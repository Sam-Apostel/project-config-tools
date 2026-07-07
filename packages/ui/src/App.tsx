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
} from '@apostel/visual-config-core';
import type {
  BumpAnalysis,
  ConfigOptionDoc,
  ConfigView,
  ReleaseNotes,
  ScaffoldStatus,
  TsconfigView,
} from '@apostel/visual-config-protocol';
import { connect, type ServerRpc } from './rpc.js';

type Section =
  | 'overview'
  | 'suggestions'
  | 'dependencies'
  | 'catalog'
  | 'typescript'
  | 'config'
  | 'scripts'
  | 'history';

interface TaskRun {
  taskId: string;
  script: string;
  output: string;
  status: 'running' | 'done' | 'error';
}

type OutdatedMap = Map<string, { latest: string; diff: string; severity: string }>;
type VulnInfo = { level: string; title: string; url?: string };
type VulnMap = Map<string, VulnInfo[]>;
type DeprecationMap = Map<string, { message: string; alternative?: string }>;
type ChangelogMap = Map<string, ReleaseNotes[] | 'loading'>;

export function App(): JSX.Element {
  const [rpc, setRpc] = useState<ServerRpc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectModel | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [section, setSection] = useState<Section>('overview');
  const [pending, setPending] = useState<Change | null>(null);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [outdated, setOutdated] = useState<OutdatedMap>(new Map());
  const [vulns, setVulns] = useState<VulnMap>(new Map());
  const [deprecations, setDeprecations] = useState<DeprecationMap>(new Map());
  const [changelogs, setChangelogs] = useState<ChangelogMap>(new Map());
  const [tsconfig, setTsconfig] = useState<TsconfigView | null>(null);
  const [configs, setConfigs] = useState<ConfigView[]>([]);
  const [scaffolds, setScaffolds] = useState<ScaffoldStatus[]>([]);
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [bumps, setBumps] = useState<Map<string, BumpAnalysis | 'loading'>>(new Map());
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
        setConfigs(await connection.getConfigs());
        setScaffolds(await connection.getScaffolds());
        setImprovements(await connection.getImprovements());
        // Diagnostics hit the network; load them without blocking the UI.
        connection
          .getDiagnostics()
          .then((diag) => {
            const out: OutdatedMap = new Map();
            const vuln: VulnMap = new Map();
            const dep: DeprecationMap = new Map();
            for (const d of diag.items) {
              if (d.kind === 'outdated' && d.data) {
                out.set(d.target, {
                  latest: String(d.data.latest),
                  diff: String(d.data.diff),
                  severity: d.severity,
                });
              } else if (d.kind === 'vulnerability') {
                const list = vuln.get(d.target) ?? [];
                list.push({
                  level: String(d.data?.level ?? d.severity),
                  title: d.message,
                  url: d.data?.url ? String(d.data.url) : undefined,
                });
                vuln.set(d.target, list);
              } else if (d.kind === 'deprecation') {
                dep.set(d.target, {
                  message: d.message,
                  alternative: d.data?.alternative ? String(d.data.alternative) : undefined,
                });
              }
            }
            if (!closed) {
              setOutdated(out);
              setVulns(vuln);
              setDeprecations(dep);
            }
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
    setConfigs(await connection.getConfigs());
    setScaffolds(await connection.getScaffolds());
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

  const planSetConfig = useCallback(async (path: string, key: string, value: unknown) => {
    const connection = rpcRef.current;
    if (!connection) return;
    setError(null);
    const result = await connection.planOperation('set-config-value', { path, key, value });
    if (result.ok && result.change) setPending(result.change);
    else setError(result.error ?? 'Could not plan the change.');
  }, []);

  const planRemoveConfig = useCallback(async (path: string, key: string) => {
    const connection = rpcRef.current;
    if (!connection) return;
    setError(null);
    const result = await connection.planOperation('remove-config-value', { path, key });
    if (result.ok && result.change) setPending(result.change);
    else setError(result.error ?? 'Could not plan the change.');
  }, []);

  const planAddConfig = useCallback(async (tool: string) => {
    const connection = rpcRef.current;
    if (!connection) return;
    setError(null);
    const result = await connection.planOperation('add-config', { tool });
    if (result.ok && result.change) setPending(result.change);
    else setError(result.error ?? 'Could not plan the setup.');
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

  const analyzeBump = useCallback(async (name: string) => {
    const connection = rpcRef.current;
    if (!connection) return;
    setBumps((prev) => new Map(prev).set(name, 'loading'));
    try {
      const result = await connection.analyzeBump(name);
      setBumps((prev) => new Map(prev).set(name, result));
    } catch {
      setBumps((prev) => {
        const next = new Map(prev);
        next.delete(name);
        return next;
      });
      setError('Could not analyze that bump.');
    }
  }, []);

  const loadChangelog = useCallback(
    async (name: string) => {
      const connection = rpcRef.current;
      if (!connection) return;
      if (changelogs.has(name)) {
        // Already open (or loading) — a second click collapses it.
        setChangelogs((prev) => {
          const next = new Map(prev);
          next.delete(name);
          return next;
        });
        return;
      }
      setChangelogs((prev) => new Map(prev).set(name, 'loading'));
      try {
        const notes = await connection.getChangelog(name);
        setChangelogs((prev) => new Map(prev).set(name, notes));
      } catch {
        setChangelogs((prev) => new Map(prev).set(name, []));
      }
    },
    [changelogs],
  );

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

  const stopScript = useCallback(async (taskId: string) => {
    await rpcRef.current?.stopScript(taskId);
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
    config: configs.length,
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
        {(configs.length > 0 || scaffolds.some((s) => !s.present)) && (
          <RailButton
            label="Config"
            count={configs.length}
            active={section === 'config'}
            onClick={() => setSection('config')}
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
            vulns={vulns}
            deprecations={deprecations}
            changelogs={changelogs}
            bumps={bumps}
            onAnalyze={analyzeBump}
            onChangelog={loadChangelog}
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
        {section === 'config' && (
          <ConfigSection
            configs={configs}
            scaffolds={scaffolds}
            onSet={planSetConfig}
            onRemove={planRemoveConfig}
            onAdd={planAddConfig}
          />
        )}
        {section === 'scripts' && (
          <Scripts
            scripts={project.scripts}
            runs={runs}
            onRun={runScript}
            onStop={stopScript}
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
  vulns: VulnMap;
  deprecations: DeprecationMap;
  changelogs: ChangelogMap;
  bumps: Map<string, BumpAnalysis | 'loading'>;
  onAnalyze: (name: string) => void;
  onChangelog: (name: string) => void;
  onUpgrade: (name: string, latest: string, dev: boolean) => void;
  onRemove: (name: string) => void;
  onUpgradeAll: () => void;
}): JSX.Element {
  const outdatedCount = props.deps.filter((d) => props.outdated.has(d.name)).length;
  const vulnCount = props.deps.filter((d) => props.vulns.has(d.name)).length;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="section-title" style={{ flex: 1 }}>
          Dependencies
        </h2>
        {vulnCount > 0 && <span className="badge risk-breaking">{vulnCount} vulnerable</span>}
        {outdatedCount > 0 && (
          <button className="btn primary small" onClick={props.onUpgradeAll}>
            Upgrade all ({outdatedCount})
          </button>
        )}
      </div>
      <p className="section-sub">
        Everything declared in package.json. Vulnerabilities, deprecations and outdated versions are
        facts from the registry; “Safe?” checks the changelog against your code, and “Changelog”
        shows the release notes.
      </p>
      <div className="card">
        {props.deps.map((d) => {
          const out = props.outdated.get(d.name);
          const bump = props.bumps.get(d.name);
          const vuln = props.vulns.get(d.name);
          const deprecated = props.deprecations.get(d.name);
          const changelog = props.changelogs.get(d.name);
          return (
            <div className="row" key={`${d.type}:${d.name}`} style={{ flexWrap: 'wrap' }}>
              <span className="name grow">{d.name}</span>
              <span className="name" style={{ color: 'var(--text-muted)' }}>
                {d.range}
              </span>
              {vuln && (
                <span className="badge risk-breaking" title={vuln.map((v) => v.title).join('\n')}>
                  {vuln.length} vuln{vuln.length > 1 ? 's' : ''}
                </span>
              )}
              {deprecated && (
                <span className="badge risk-review" title={deprecated.message}>
                  deprecated
                </span>
              )}
              {out && (
                <span className={`badge ${out.severity === 'warn' ? 'risk-review' : ''}`}>
                  → {out.latest} ({out.diff})
                </span>
              )}
              <span className={`badge ${d.type === 'dev' ? 'dev' : ''}`}>{d.type}</span>
              {out && bump === 'loading' && <span className="badge">checking…</span>}
              {out && bump && bump !== 'loading' && (
                <span
                  className={`badge risk-${bump.verdict === 'safe' ? 'safe' : bump.verdict === 'review' ? 'review' : 'breaking'}`}
                >
                  {bump.verdict}
                </span>
              )}
              {out && !bump && (
                <button className="btn small" onClick={() => props.onAnalyze(d.name)}>
                  Safe?
                </button>
              )}
              <button className="btn small" onClick={() => props.onChangelog(d.name)}>
                Changelog
              </button>
              {out && (
                <button
                  className="btn small"
                  onClick={() => props.onUpgrade(d.name, out.latest, d.type === 'dev')}
                >
                  Upgrade
                </button>
              )}
              {deprecated?.alternative && (
                <button
                  className="btn small"
                  title={`Install ${deprecated.alternative} instead`}
                  onClick={() =>
                    props.onUpgrade(deprecated.alternative!, 'latest', d.type === 'dev')
                  }
                >
                  → {deprecated.alternative}
                </button>
              )}
              <button className="btn small" onClick={() => props.onRemove(d.name)}>
                Remove
              </button>
              {deprecated && (
                <div
                  style={{
                    flexBasis: '100%',
                    fontSize: 12,
                    color: 'var(--warn)',
                    paddingLeft: 2,
                  }}
                >
                  Deprecated: {deprecated.message}
                </div>
              )}
              {bump && bump !== 'loading' && (
                <div
                  style={{
                    flexBasis: '100%',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    paddingLeft: 2,
                  }}
                >
                  {bump.from} → {bump.to}:{' '}
                  {bump.reasons.filter((r) => r.assessment === 'used-affected').length > 0
                    ? bump.reasons
                        .filter((r) => r.assessment === 'used-affected')
                        .map((r) => r.note)
                        .join(' ')
                    : (bump.notes[0] ?? 'No affecting changes found for your usage.')}
                </div>
              )}
              {changelog && (
                <div style={{ flexBasis: '100%' }}>
                  {changelog === 'loading' ? (
                    <div className="empty">Loading changelog…</div>
                  ) : changelog.length === 0 ? (
                    <div className="empty">
                      No release notes found (no GitHub releases, or none in this range).
                    </div>
                  ) : (
                    <ChangelogView notes={changelog} />
                  )}
                </div>
              )}
            </div>
          );
        })}
        {props.deps.length === 0 && <div className="empty">No dependencies yet.</div>}
      </div>
    </>
  );
}

function ChangelogView(props: { notes: ReleaseNotes[] }): JSX.Element {
  const notes = [...props.notes].reverse(); // newest first
  return (
    <div className="changelog">
      {notes.map((n) => (
        <div className="changelog-entry" key={n.version}>
          <div className="changelog-head">
            <span className="name">{n.version}</span>
            {n.url && (
              <a href={n.url} target="_blank" rel="noreferrer" className="changelog-link">
                release notes ↗
              </a>
            )}
            {n.breakingChanges.length > 0 && (
              <span className="badge risk-breaking">{n.breakingChanges.length} breaking</span>
            )}
          </div>
          {n.breakingChanges.length > 0 && (
            <ul className="changelog-breaking">
              {n.breakingChanges.map((b, i) => (
                <li key={i}>{b.summary}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
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

function getNested(values: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((o, k) => {
    return o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;
  }, values);
}

function ConfigOptionRow(props: {
  opt: ConfigOptionDoc;
  current: unknown;
  onSet: (value: unknown) => void;
  onUnset: () => void;
}): JSX.Element {
  const { opt, current } = props;
  const isSet = current !== undefined;
  const [draft, setDraft] = useState('');
  return (
    <div className="row" style={{ flexWrap: 'wrap' }}>
      <div className="grow">
        <div className="name">{opt.key}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {opt.description}
          {opt.default !== undefined && ` (default: ${JSON.stringify(opt.default)})`}
        </div>
      </div>
      <span className={`badge ${current === true ? 'risk-safe' : ''}`}>
        {isSet ? JSON.stringify(current) : 'unset'}
      </span>
      {opt.type === 'boolean' && (
        <button className="btn small" onClick={() => props.onSet(current !== true)}>
          Set {current === true ? 'false' : 'true'}
        </button>
      )}
      {opt.type === 'enum' && (
        <select
          className="field"
          value={typeof current === 'string' ? current : ''}
          onChange={(e) => props.onSet(e.target.value)}
        >
          <option value="" disabled>
            choose…
          </option>
          {(opt.values ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      )}
      {(opt.type === 'number' || opt.type === 'string') && (
        <>
          <input
            className="field"
            style={{ width: 120 }}
            placeholder={isSet ? String(current) : opt.type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            className="btn small"
            disabled={!draft.trim()}
            onClick={() => {
              props.onSet(opt.type === 'number' ? Number(draft) : draft);
              setDraft('');
            }}
          >
            Set
          </button>
        </>
      )}
      {isSet && (
        <button className="btn small" onClick={props.onUnset}>
          Unset
        </button>
      )}
    </div>
  );
}

function ConfigCard(props: {
  config: ConfigView;
  onSet: (path: string, key: string, value: unknown) => void;
  onRemove: (path: string, key: string) => void;
}): JSX.Element {
  const { path, kind, values, schema } = props.config;
  const documented = new Set(schema?.options.map((o) => o.key) ?? []);
  const otherKeys = Object.keys(values).filter((k) => !documented.has(k));
  return (
    <div style={{ marginBottom: 24 }}>
      <h3
        style={{ fontSize: 15, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        {schema?.title ?? kind}
        <span className="name" style={{ color: 'var(--text-faint)', fontWeight: 400 }}>
          {path}
        </span>
        {schema?.docsUrl && (
          <a
            href={schema.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="changelog-link"
            style={{ marginLeft: 'auto' }}
          >
            docs ↗
          </a>
        )}
      </h3>
      <div className="card">
        {schema?.options.map((opt) => (
          <ConfigOptionRow
            key={opt.key}
            opt={opt}
            current={getNested(values, opt.key)}
            onSet={(v) => props.onSet(path, opt.key, v)}
            onUnset={() => props.onRemove(path, opt.key)}
          />
        ))}
        {!schema && (
          <div className="empty">No documented options for “{kind}” yet — raw values below.</div>
        )}
      </div>
      {otherKeys.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="section-sub" style={{ margin: '0 0 4px' }}>
            Other keys set in this file
          </div>
          <div className="card">
            {otherKeys.map((k) => (
              <div className="row" key={k}>
                <span className="name grow">{k}</span>
                <span className="name" style={{ color: 'var(--text-muted)' }}>
                  {JSON.stringify(values[k])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigSection(props: {
  configs: ConfigView[];
  scaffolds: ScaffoldStatus[];
  onSet: (path: string, key: string, value: unknown) => void;
  onRemove: (path: string, key: string) => void;
  onAdd: (tool: string) => void;
}): JSX.Element {
  const missing = props.scaffolds.filter((s) => !s.present);
  return (
    <>
      <h2 className="section-title">Config</h2>
      <p className="section-sub">
        Every editable JSON config in this project — Biome, Prettier, ESLint, oxlint, tsconfig.
        Change a documented option to plan a format- and comment-preserving edit; the tool ships no
        opinion about which value to pick.
      </p>
      {props.configs.map((cfg) => (
        <ConfigCard key={cfg.path} config={cfg} onSet={props.onSet} onRemove={props.onRemove} />
      ))}
      {props.configs.length === 0 && (
        <div className="empty">No editable JSON configs detected yet.</div>
      )}
      {missing.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Set up a tool</h3>
          <p className="section-sub" style={{ marginTop: 0 }}>
            Install a formatter/linter, create its config, and add its scripts — one reviewed
            change.
          </p>
          <div className="card">
            {missing.map((s) => (
              <div className="row" key={s.tool}>
                <div className="grow">
                  <div className="name">{s.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    installs {s.packages.join(', ')} · creates {s.configPath}
                  </div>
                </div>
                <button className="btn small primary" onClick={() => props.onAdd(s.tool)}>
                  Set up {s.title}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Scripts(props: {
  scripts: ScriptEntry[];
  runs: TaskRun[];
  onRun: (name: string) => void;
  onStop: (taskId: string) => void;
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
              {run?.status === 'running' ? (
                <button className="btn small" onClick={() => props.onStop(run.taskId)}>
                  Stop
                </button>
              ) : (
                <button className="btn small" onClick={() => props.onRun(s.name)}>
                  Run
                </button>
              )}
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
          <div
            className="section-sub mono"
            style={{
              marginTop: 16,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>
              {r.script} — {r.status}
            </span>
            {r.status === 'running' && (
              <button className="btn small" onClick={() => props.onStop(r.taskId)}>
                Stop
              </button>
            )}
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
