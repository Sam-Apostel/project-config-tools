import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CatalogPackage,
  Change,
  DependencyEntry,
  Diagnostic,
  Improvement,
  JournalEntry,
  ProjectModel,
  ScriptEntry,
} from '@visual-config/core';
import type { TsconfigView } from '@visual-config/protocol';
import { connect, type ServerRpc } from './rpc.js';

type Section =
  'overview' | 'suggestions' | 'dependencies' | 'catalog' | 'typescript' | 'scripts' | 'history';

interface TaskRun {
  taskId: string;
  script: string;
  output: string;
  status: 'running' | 'done' | 'error';
}

type OutdatedMap = Map<string, { latest: string; diff: string; severity: string }>;

export function App(): JSX.Element {
  const [rpc, setRpc] = useState<ServerRpc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectModel | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [section, setSection] = useState<Section>('overview');
  const [pending, setPending] = useState<Change | null>(null);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [outdated, setOutdated] = useState<OutdatedMap>(new Map());
  const [tsconfig, setTsconfig] = useState<TsconfigView | null>(null);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const rpcRef = useRef<ServerRpc | null>(null);

  useEffect(() => {
    let closed = false;
    connect({
      onProjectChanged: (next) => setProject(next),
      onTaskOutput: (taskId, chunk) =>
        setRuns((prev) =>
          prev.map((r) => (r.taskId === taskId ? { ...r, output: r.output + chunk } : r)),
        ),
      onTaskExit: (taskId, code) =>
        setRuns((prev) =>
          prev.map((r) =>
            r.taskId === taskId ? { ...r, status: code === 0 ? 'done' : 'error' } : r,
          ),
        ),
    })
      .then(async (connection) => {
        if (closed) return;
        rpcRef.current = connection;
        setRpc(connection);
        setProject(await connection.getProject());
        setJournal(await connection.listJournal());
        setTsconfig(await connection.getTsconfig());
        setImprovements(await connection.getImprovements());
        // Diagnostics hit the network; load them without blocking the UI.
        connection
          .getDiagnostics()
          .then((diag) => {
            const map: OutdatedMap = new Map();
            for (const d of diag.items) {
              if (d.kind === 'outdated' && d.data) {
                map.set(d.target, {
                  latest: String(d.data.latest),
                  diff: String(d.data.diff),
                  severity: d.severity,
                });
              }
            }
            if (!closed) setOutdated(map);
          })
          .catch(() => undefined);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    return () => {
      closed = true;
    };
  }, []);

  const refreshJournal = useCallback(async () => {
    const connection = rpcRef.current;
    if (!connection) return;
    setJournal(await connection.listJournal());
    setTsconfig(await connection.getTsconfig());
    setImprovements(await connection.getImprovements());
  }, []);

  const applyImprovement = useCallback(async (improvement: Improvement) => {
    const connection = rpcRef.current;
    if (!connection || !improvement.apply) return;
    setError(null);
    const result = await connection.planOperation(
      improvement.apply.operationId,
      improvement.apply.input,
    );
    if (result.ok && result.change) setPending(result.change);
    else setError(result.error ?? 'Could not plan the change.');
  }, []);

  const planSetTsconfig = useCallback(async (key: string, value: unknown) => {
    const connection = rpcRef.current;
    if (!connection) return;
    setError(null);
    const result = await connection.planOperation('set-tsconfig-option', { key, value });
    if (result.ok && result.change) setPending(result.change);
    else setError(result.error ?? 'Could not plan the change.');
  }, []);

  const planInstall = useCallback(async (name: string, range: string, dev: boolean) => {
    const connection = rpcRef.current;
    if (!connection) return;
    setError(null);
    const result = await connection.planOperation('install-package', { name, range, dev });
    if (result.ok && result.change) setPending(result.change);
    else setError(result.error ?? 'Could not plan the install.');
  }, []);

  const searchCatalog = useCallback(async (text: string): Promise<CatalogPackage[]> => {
    const connection = rpcRef.current;
    if (!connection || !text.trim()) return [];
    const result = await connection.searchCatalog({ text });
    return result.packages;
  }, []);

  const planRemoveDependency = useCallback(async (name: string) => {
    const connection = rpcRef.current;
    if (!connection) return;
    setError(null);
    const result = await connection.planOperation('remove-dependency', { name });
    if (result.ok && result.change) setPending(result.change);
    else setError(result.error ?? 'Could not plan the removal.');
  }, []);

  const planUpgradeAll = useCallback(async (upgrades: Array<{ name: string; range: string }>) => {
    const connection = rpcRef.current;
    if (!connection || upgrades.length === 0) return;
    setError(null);
    const result = await connection.planOperation('upgrade-dependencies', { upgrades });
    if (result.ok && result.change) setPending(result.change);
    else setError(result.error ?? 'Could not plan the upgrade.');
  }, []);

  const runScript = useCallback(async (name: string) => {
    if (!rpcRef.current) return;
    const handle = await rpcRef.current.runScript(name);
    setRuns((prev) => [
      { taskId: handle.taskId, script: name, output: '', status: 'running' },
      ...prev.filter((r) => r.script !== name || r.status === 'running'),
    ]);
  }, []);

  const confirmPending = useCallback(async () => {
    const connection = rpcRef.current;
    if (!connection || !pending) return;
    const result = await connection.applyChange(pending.id);
    setPending(null);
    if (!result.ok && result.errors.length) setError(result.errors.join('; '));
    await refreshJournal();
  }, [pending, refreshJournal]);

  const undo = useCallback(
    async (entryId: string) => {
      const connection = rpcRef.current;
      if (!connection) return;
      const result = await connection.undo(entryId);
      if (!result.ok && result.errors.length) setError(result.errors.join('; '));
      await refreshJournal();
    },
    [refreshJournal],
  );

  const planAddScript = useCallback(async (name: string, command: string) => {
    const connection = rpcRef.current;
    if (!connection) return;
    setError(null);
    const result = await connection.planOperation('add-script', { name, command });
    if (result.ok && result.change) setPending(result.change);
    else setError(result.error ?? 'Could not plan the change.');
  }, []);

  const planSetField = useCallback(async (field: string, value: string) => {
    const connection = rpcRef.current;
    if (!connection) return;
    setError(null);
    const result = await connection.planOperation('set-package-field', { field, value });
    if (result.ok && result.change) setPending(result.change);
    else setError(result.error ?? 'Could not plan the change.');
  }, []);

  if (error && !project) return <div className="status">⚠ {error}</div>;
  if (!rpc || !project) return <div className="status">Connecting to the daemon…</div>;

  const deps = project.dependencies;
  const counts: Record<Section, number> = {
    overview: 0,
    suggestions: improvements.length,
    dependencies: deps.length,
    catalog: 0,
    typescript: 0,
    scripts: project.scripts.length,
    history: journal.filter((j) => !j.undone).length,
  };
  const outdatedCount = deps.filter((d) => outdated.has(d.name)).length;

  return (
    <div className="app">
      <div className="topbar">
        <h1>visual-config</h1>
        <span className="meta mono">{project.name ?? project.root}</span>
        <span className="meta">·</span>
        <span className="meta">{project.packageManager}</span>
        <span className="meta">·</span>
        <span className="meta">{project.configFiles.length} config files</span>
      </div>

      <nav className="rail">
        <RailButton
          label="Overview"
          active={section === 'overview'}
          onClick={() => setSection('overview')}
        />
        {improvements.length > 0 && (
          <RailButton
            label="Suggestions"
            count={improvements.length}
            active={section === 'suggestions'}
            onClick={() => setSection('suggestions')}
          />
        )}
        <RailButton
          label="Dependencies"
          count={counts.dependencies}
          active={section === 'dependencies'}
          onClick={() => setSection('dependencies')}
        />
        <RailButton
          label="Catalog"
          active={section === 'catalog'}
          onClick={() => setSection('catalog')}
        />
        {tsconfig?.present && (
          <RailButton
            label="TypeScript"
            active={section === 'typescript'}
            onClick={() => setSection('typescript')}
          />
        )}
        <RailButton
          label="Scripts"
          count={counts.scripts}
          active={section === 'scripts'}
          onClick={() => setSection('scripts')}
        />
        <RailButton
          label="History"
          count={counts.history}
          active={section === 'history'}
          onClick={() => setSection('history')}
        />
      </nav>

      <main className="main">
        {error && <div className="error-banner">{error}</div>}
        {section === 'overview' && (
          <Overview project={project} outdatedCount={outdatedCount} onSetField={planSetField} />
        )}
        {section === 'suggestions' && (
          <Suggestions improvements={improvements} onApply={applyImprovement} />
        )}
        {section === 'dependencies' && (
          <Dependencies
            deps={deps}
            outdated={outdated}
            onUpgrade={(name, latest, dev) => planInstall(name, `^${latest}`, dev)}
            onRemove={(name) => planRemoveDependency(name)}
            onUpgradeAll={() =>
              planUpgradeAll(
                deps
                  .filter((d) => outdated.has(d.name))
                  .map((d) => ({ name: d.name, range: `^${outdated.get(d.name)!.latest}` })),
              )
            }
          />
        )}
        {section === 'catalog' && (
          <Catalog
            onSearch={searchCatalog}
            installed={new Set(deps.map((d) => d.name))}
            onInstall={planInstall}
          />
        )}
        {section === 'typescript' && tsconfig && (
          <TypeScriptView tsconfig={tsconfig} onSet={planSetTsconfig} />
        )}
        {section === 'scripts' && (
          <Scripts
            scripts={project.scripts}
            runs={runs}
            onRun={runScript}
            onPlanAddScript={planAddScript}
          />
        )}
        {section === 'history' && <History journal={journal} onUndo={undo} />}
      </main>

      {pending && (
        <DiffSheet change={pending} onCancel={() => setPending(null)} onConfirm={confirmPending} />
      )}
    </div>
  );
}

function RailButton(props: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button className={props.active ? 'active' : ''} onClick={props.onClick}>
      <span>{props.label}</span>
      {props.count !== undefined && <span className="count">{props.count}</span>}
    </button>
  );
}

function EditableRow(props: {
  label: string;
  field: string;
  value?: string;
  onSet: (field: string, value: string) => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value ?? '');
  if (editing) {
    return (
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft !== (props.value ?? '')) props.onSet(props.field, draft);
          setEditing(false);
        }}
      >
        <span className="grow">{props.label}</span>
        <input
          className="field"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn primary small" type="submit">
          Save
        </button>
        <button className="btn small" type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </form>
    );
  }
  return (
    <div className="row">
      <span className="grow">{props.label}</span>
      <span className="name">{props.value ?? '—'}</span>
      <button
        className="btn small"
        onClick={() => {
          setDraft(props.value ?? '');
          setEditing(true);
        }}
      >
        Edit
      </button>
    </div>
  );
}

function Suggestions(props: {
  improvements: Improvement[];
  onApply: (improvement: Improvement) => void;
}): JSX.Element {
  return (
    <>
      <h2 className="section-title">Suggestions</h2>
      <p className="section-sub">
        Recommendations from the opinion packs you installed — always attributed. The base tool
        ships none of these; these are someone's opinion, shown as theirs.
      </p>
      <div className="card">
        {props.improvements.map((imp) => (
          <div className="row" key={imp.id}>
            <div className="grow">
              <div className="name">{imp.title}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{imp.detail}</div>
              {imp.docUrl && (
                <a href={imp.docUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                  docs
                </a>
              )}
            </div>
            <span className="badge" title={imp.author.url}>
              via {imp.author.name}
            </span>
            {imp.author.official ? (
              <span className="badge risk-safe">verified</span>
            ) : (
              <span className="badge">community</span>
            )}
            {imp.apply && (
              <button className="btn primary small" onClick={() => props.onApply(imp)}>
                Apply…
              </button>
            )}
          </div>
        ))}
        {props.improvements.length === 0 && (
          <div className="empty">No opinion packs installed — the base stays neutral.</div>
        )}
      </div>
    </>
  );
}

function Overview(props: {
  project: ProjectModel;
  outdatedCount: number;
  onSetField: (field: string, value: string) => void;
}): JSX.Element {
  const { project, outdatedCount, onSetField } = props;
  return (
    <>
      <h2 className="section-title">Overview</h2>
      <p className="section-sub">A glance at this project's configuration. Fields are editable.</p>
      <div className="card">
        <EditableRow label="Name" field="name" value={project.name} onSet={onSetField} />
        <EditableRow label="Version" field="version" value={project.version} onSet={onSetField} />
        <EditableRow
          label="Description"
          field="description"
          value={project.description}
          onSet={onSetField}
        />
        <div className="row">
          <span className="grow">Package manager</span>
          <span className="name">{project.packageManager}</span>
        </div>
        <div className="row">
          <span className="grow">Dependencies</span>
          <span className="name">{project.dependencies.length}</span>
          {outdatedCount > 0 && <span className="badge risk-review">{outdatedCount} outdated</span>}
        </div>
        <div className="row">
          <span className="grow">Scripts</span>
          <span className="name">{project.scripts.length}</span>
        </div>
      </div>
      <h2 className="section-title" style={{ marginTop: 28 }}>
        Config files
      </h2>
      <div className="card">
        {project.configFiles.map((f) => (
          <div className="row" key={f.path}>
            <span className="name grow">{f.path}</span>
            <span className="badge">{f.kind}</span>
            <span className="badge">{f.editable}</span>
          </div>
        ))}
        {project.configFiles.length === 0 && (
          <div className="empty">No known config files detected.</div>
        )}
      </div>
    </>
  );
}

function Dependencies(props: {
  deps: DependencyEntry[];
  outdated: OutdatedMap;
  onUpgrade: (name: string, latest: string, dev: boolean) => void;
  onRemove: (name: string) => void;
  onUpgradeAll: () => void;
}): JSX.Element {
  const outdatedCount = props.deps.filter((d) => props.outdated.has(d.name)).length;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="section-title" style={{ flex: 1 }}>
          Dependencies
        </h2>
        {outdatedCount > 0 && (
          <button className="btn primary small" onClick={props.onUpgradeAll}>
            Upgrade all ({outdatedCount})
          </button>
        )}
      </div>
      <p className="section-sub">
        Everything declared in package.json. Outdated versions are facts from the registry.
      </p>
      <div className="card">
        {props.deps.map((d) => {
          const out = props.outdated.get(d.name);
          return (
            <div className="row" key={`${d.type}:${d.name}`}>
              <span className="name grow">{d.name}</span>
              <span className="name" style={{ color: 'var(--text-muted)' }}>
                {d.range}
              </span>
              {out && (
                <span className={`badge ${out.severity === 'warn' ? 'risk-review' : ''}`}>
                  → {out.latest} ({out.diff})
                </span>
              )}
              <span className={`badge ${d.type === 'dev' ? 'dev' : ''}`}>{d.type}</span>
              {out && (
                <button
                  className="btn small"
                  onClick={() => props.onUpgrade(d.name, out.latest, d.type === 'dev')}
                >
                  Upgrade
                </button>
              )}
              <button className="btn small" onClick={() => props.onRemove(d.name)}>
                Remove
              </button>
            </div>
          );
        })}
        {props.deps.length === 0 && <div className="empty">No dependencies yet.</div>}
      </div>
    </>
  );
}

function Catalog(props: {
  installed: Set<string>;
  onSearch: (text: string) => Promise<CatalogPackage[]>;
  onInstall: (name: string, range: string, dev: boolean) => void;
}): JSX.Element {
  const [text, setText] = useState('');
  const [results, setResults] = useState<CatalogPackage[]>([]);
  const [searching, setSearching] = useState(false);

  const doSearch = async (query: string): Promise<void> => {
    setSearching(true);
    try {
      setResults(await props.onSearch(query));
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <h2 className="section-title">Catalog</h2>
      <p className="section-sub">
        Browse the npm registry and install by selecting — never by typing a name into a command.
      </p>
      <form
        className="form-inline"
        style={{ marginTop: 0, marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          void doSearch(text);
        }}
      >
        <input
          className="field"
          style={{ flex: 1, minWidth: 240 }}
          placeholder="Search packages, e.g. zod, react-query…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn primary small" type="submit" disabled={!text.trim() || searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      <div className="card">
        {results.map((p) => (
          <div className="row" key={p.name}>
            <div className="grow">
              <div className="name">
                {p.name} <span style={{ color: 'var(--text-faint)' }}>{p.version}</span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.description}</div>
            </div>
            {props.installed.has(p.name) ? (
              <span className="badge risk-safe">installed</span>
            ) : (
              <>
                <button
                  className="btn small"
                  onClick={() => props.onInstall(p.name, `^${p.version}`, true)}
                >
                  + dev
                </button>
                <button
                  className="btn primary small"
                  onClick={() => props.onInstall(p.name, `^${p.version}`, false)}
                >
                  Install
                </button>
              </>
            )}
          </div>
        ))}
        {results.length === 0 && (
          <div className="empty">{searching ? 'Searching…' : 'Search to browse packages.'}</div>
        )}
      </div>
    </>
  );
}

const COMMON_TS_OPTIONS: { key: string; blurb: string }[] = [
  { key: 'strict', blurb: 'Enable all strict type-checking options.' },
  { key: 'noUncheckedIndexedAccess', blurb: 'Add undefined to indexed access results.' },
  { key: 'noImplicitAny', blurb: 'Error on expressions with an implied any type.' },
  { key: 'skipLibCheck', blurb: 'Skip type-checking of declaration files.' },
  { key: 'esModuleInterop', blurb: 'Emit interop helpers for CommonJS default imports.' },
  { key: 'verbatimModuleSyntax', blurb: 'Require explicit import type / export type.' },
];

function TypeScriptView(props: {
  tsconfig: TsconfigView;
  onSet: (key: string, value: unknown) => void;
}): JSX.Element {
  const { options } = props.tsconfig;
  const format = (v: unknown): string => (v === undefined ? 'unset' : JSON.stringify(v));
  return (
    <>
      <h2 className="section-title">TypeScript</h2>
      <p className="section-sub">
        What tsconfig.json sets, as facts. Toggle a value to plan a comment-preserving edit — the
        tool ships no opinion about which to choose.
      </p>
      <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Common options</h3>
      <div className="card">
        {COMMON_TS_OPTIONS.map(({ key, blurb }) => {
          const current = options[key];
          return (
            <div className="row" key={key}>
              <div className="grow">
                <div className="name">{key}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{blurb}</div>
              </div>
              <span className={`badge ${current === true ? 'risk-safe' : ''}`}>
                {format(current)}
              </span>
              <button className="btn small" onClick={() => props.onSet(key, current !== true)}>
                Set {current === true ? 'false' : 'true'}
              </button>
            </div>
          );
        })}
      </div>
      <h3 style={{ fontSize: 15, margin: '24px 0 8px' }}>All compilerOptions</h3>
      <div className="card">
        {Object.entries(options).map(([key, value]) => (
          <div className="row" key={key}>
            <span className="name grow">{key}</span>
            <span className="name" style={{ color: 'var(--text-muted)' }}>
              {JSON.stringify(value)}
            </span>
          </div>
        ))}
        {Object.keys(options).length === 0 && (
          <div className="empty">No compilerOptions set in tsconfig.json.</div>
        )}
      </div>
    </>
  );
}

function Scripts(props: {
  scripts: ScriptEntry[];
  runs: TaskRun[];
  onRun: (name: string) => void;
  onPlanAddScript: (name: string, command: string) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');

  return (
    <>
      <h2 className="section-title">Scripts</h2>
      <p className="section-sub">
        Run any script with a button; add a new one as a reviewed change.
      </p>
      <div className="card">
        {props.scripts.map((s) => {
          const run = props.runs.find((r) => r.script === s.name);
          return (
            <div className="row" key={s.name}>
              <span className="name">{s.name}</span>
              <span className="name grow" style={{ color: 'var(--text-faint)' }}>
                {s.command}
              </span>
              {run?.status === 'running' && <span className="badge">running…</span>}
              {run?.status === 'done' && <span className="badge risk-safe">done</span>}
              {run?.status === 'error' && <span className="badge risk-breaking">failed</span>}
              <button className="btn small" onClick={() => props.onRun(s.name)}>
                Run
              </button>
            </div>
          );
        })}
        {props.scripts.length === 0 && <div className="empty">No scripts defined.</div>}
      </div>

      <form
        className="form-inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && command.trim()) {
            props.onPlanAddScript(name.trim(), command.trim());
            setName('');
            setCommand('');
          }
        }}
      >
        <input
          className="field"
          placeholder="script name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="field"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="command, e.g. vitest run"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <button
          className="btn primary small"
          type="submit"
          disabled={!name.trim() || !command.trim()}
        >
          Add script…
        </button>
      </form>

      {props.runs.map((r) => (
        <div key={r.taskId}>
          <div className="section-sub mono" style={{ marginTop: 16, marginBottom: 4 }}>
            {r.script} — {r.status}
          </div>
          <div className="console">{r.output || '(no output yet)'}</div>
        </div>
      ))}
    </>
  );
}

function History(props: { journal: JournalEntry[]; onUndo: (id: string) => void }): JSX.Element {
  return (
    <>
      <h2 className="section-title">History</h2>
      <p className="section-sub">Every applied change, reversible by default.</p>
      <div className="card">
        {props.journal.map((entry) => (
          <div className="row" key={entry.id}>
            <span className="grow">{entry.summary}</span>
            <span className="badge">{entry.actor}</span>
            {entry.undone ? (
              <span className="badge">undone</span>
            ) : (
              <button className="btn small" onClick={() => props.onUndo(entry.id)}>
                Undo
              </button>
            )}
          </div>
        ))}
        {props.journal.length === 0 && <div className="empty">Nothing applied yet.</div>}
      </div>
    </>
  );
}

function DiffSheet(props: {
  change: Change;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const { change } = props;
  return (
    <div className="sheet-backdrop" onClick={props.onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <header>
          <span className="summary">{change.summary}</span>
          <span className={`badge risk-${change.risk}`}>{change.risk}</span>
        </header>
        {change.notes.length > 0 && (
          <div className="notes">
            {change.notes.map((n, i) => (
              <div className={`note ${n.level}`} key={i}>
                {n.message}
              </div>
            ))}
          </div>
        )}
        <div className="diff">
          {change.edits.map((edit) => (
            <pre key={edit.path}>{renderDiff(edit.diff)}</pre>
          ))}
        </div>
        <footer>
          <button className="btn" onClick={props.onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={props.onConfirm}>
            Confirm
          </button>
        </footer>
      </div>
    </div>
  );
}

function renderDiff(diff: string): JSX.Element[] {
  return diff.split('\n').map((line, i) => {
    let cls = '';
    if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-add';
    else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-del';
    else if (line.startsWith('@@') || line.startsWith('Index') || line.startsWith('=='))
      cls = 'diff-meta';
    return (
      <span key={i} className={cls}>
        {line}
        {'\n'}
      </span>
    );
  });
}
