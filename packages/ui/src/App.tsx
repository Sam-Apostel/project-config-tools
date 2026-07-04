import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Change,
  DependencyEntry,
  JournalEntry,
  ProjectModel,
  ScriptEntry,
} from '@visual-config/core';
import { connect, type ServerRpc } from './rpc.js';

type Section = 'overview' | 'dependencies' | 'scripts' | 'history';

interface TaskRun {
  taskId: string;
  script: string;
  output: string;
  status: 'running' | 'done' | 'error';
}

export function App(): JSX.Element {
  const [rpc, setRpc] = useState<ServerRpc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectModel | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [section, setSection] = useState<Section>('overview');
  const [pending, setPending] = useState<Change | null>(null);
  const [runs, setRuns] = useState<TaskRun[]>([]);
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
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    return () => {
      closed = true;
    };
  }, []);

  const refreshJournal = useCallback(async () => {
    if (rpcRef.current) setJournal(await rpcRef.current.listJournal());
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

  if (error && !project) return <div className="status">⚠ {error}</div>;
  if (!rpc || !project) return <div className="status">Connecting to the daemon…</div>;

  const deps = project.dependencies;
  const counts: Record<Section, number> = {
    overview: 0,
    dependencies: deps.length,
    scripts: project.scripts.length,
    history: journal.filter((j) => !j.undone).length,
  };

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
        <RailButton
          label="Dependencies"
          count={counts.dependencies}
          active={section === 'dependencies'}
          onClick={() => setSection('dependencies')}
        />
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
        {section === 'overview' && <Overview project={project} />}
        {section === 'dependencies' && <Dependencies deps={deps} />}
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

function Overview(props: { project: ProjectModel }): JSX.Element {
  const { project } = props;
  return (
    <>
      <h2 className="section-title">Overview</h2>
      <p className="section-sub">A glance at this project's configuration.</p>
      <div className="card">
        <div className="row">
          <span className="grow">Name</span>
          <span className="name">{project.name ?? '—'}</span>
        </div>
        <div className="row">
          <span className="grow">Version</span>
          <span className="name">{project.version ?? '—'}</span>
        </div>
        <div className="row">
          <span className="grow">Package manager</span>
          <span className="name">{project.packageManager}</span>
        </div>
        <div className="row">
          <span className="grow">Dependencies</span>
          <span className="name">{project.dependencies.length}</span>
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

function Dependencies(props: { deps: DependencyEntry[] }): JSX.Element {
  return (
    <>
      <h2 className="section-title">Dependencies</h2>
      <p className="section-sub">Everything declared in package.json.</p>
      <div className="card">
        {props.deps.map((d) => (
          <div className="row" key={`${d.type}:${d.name}`}>
            <span className="name grow">{d.name}</span>
            <span className="name" style={{ color: 'var(--text-muted)' }}>
              {d.range}
            </span>
            <span className={`badge ${d.type === 'dev' ? 'dev' : ''}`}>{d.type}</span>
          </div>
        ))}
        {props.deps.length === 0 && <div className="empty">No dependencies yet.</div>}
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
