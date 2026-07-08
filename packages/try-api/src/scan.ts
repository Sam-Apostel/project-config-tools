import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { openProject, type Engine } from '@apostel/visual-config-core';

export interface ParsedRepo {
  owner: string;
  repo: string;
  url: string;
}

/**
 * Accept `owner/repo`, `github.com/owner/repo`, or a full https URL (.git optional).
 * We only ever build a canonical `https://github.com/<owner>/<repo>.git` URL from the
 * parsed parts, so a caller can never point the cloner at an arbitrary host (no SSRF).
 */
export function parseRepo(input: string): ParsedRepo {
  const cleaned = input.trim().replace(/\.git$/, '');
  const m = cleaned.match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)$/);
  const owner = m?.[1];
  const repo = m?.[2];
  if (!owner || !repo || owner === '.' || owner === '..' || repo === '.' || repo === '..') {
    throw new Error(`Not a GitHub repo: "${input}". Use owner/repo (e.g. sindresorhus/got).`);
  }
  return { owner, repo, url: `https://github.com/${owner}/${repo}.git` };
}

export interface TryFinding {
  kind: 'outdated' | 'vulnerability' | 'deprecation';
  target: string;
  message: string;
  severity: string;
  /** For deprecations, the maintainer-suggested replacement, when we could extract one. */
  alternative?: string;
  /** For outdated, the latest published version. */
  latest?: string;
}

export interface TryUpgrade {
  available: boolean;
  summary: string;
  stat: { files: number; additions: number; deletions: number };
  /** Concatenated unified diffs — `git apply`-able. Empty when nothing to upgrade. */
  patch: string;
  /** Display-only follow-up commands the real apply would run (e.g. the install). */
  commands: string[];
}

export interface TryScanResult {
  repo: string;
  name?: string;
  packageManager: string;
  counts: { outdated: number; vulnerable: number; deprecated: number };
  findings: TryFinding[];
  upgrade: TryUpgrade;
}

/** Count added/removed source lines in a unified diff, ignoring the +++/--- file headers. */
export function diffStat(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

interface DiagnosticLike {
  kind: string;
  target: string;
  message: string;
  severity: string;
  data?: Record<string, unknown>;
}

/**
 * Turn an already-open {@link Engine} into the playground payload: the dependency-health
 * findings plus a single "upgrade everything outdated" diff. Pure over the engine (no git,
 * no filesystem of its own), so it is unit-testable with an in-memory project.
 */
export async function scanProject(engine: Engine, repoLabel: string): Promise<TryScanResult> {
  const project = engine.getProject();
  const diag = await engine.getDiagnostics();
  const items = diag.items as DiagnosticLike[];

  const findings: TryFinding[] = items
    .filter((d) => d.kind === 'outdated' || d.kind === 'vulnerability' || d.kind === 'deprecation')
    .map((d) => ({
      kind: d.kind as TryFinding['kind'],
      target: d.target,
      message: d.message,
      severity: d.severity,
      alternative: d.data?.alternative ? String(d.data.alternative) : undefined,
      latest: d.data?.latest ? String(d.data.latest) : undefined,
    }));

  const counts = {
    outdated: findings.filter((f) => f.kind === 'outdated').length,
    vulnerable: findings.filter((f) => f.kind === 'vulnerability').length,
    deprecated: findings.filter((f) => f.kind === 'deprecation').length,
  };

  const upgrades = findings
    .filter((f) => f.kind === 'outdated' && f.latest)
    .map((f) => ({ name: f.target, range: `^${f.latest}` }));

  let upgrade: TryUpgrade = {
    available: false,
    summary: 'Dependencies look current — nothing to upgrade.',
    stat: { files: 0, additions: 0, deletions: 0 },
    patch: '',
    commands: [],
  };

  if (upgrades.length > 0) {
    try {
      const change = await engine.plan('upgrade-dependencies', { upgrades });
      const patch = change.edits
        .map((e) => (e.diff.endsWith('\n') ? e.diff : e.diff + '\n'))
        .join('');
      upgrade = {
        available: true,
        summary: `Upgrade ${upgrades.length} ${upgrades.length === 1 ? 'dependency' : 'dependencies'} to latest`,
        stat: { files: change.edits.length, ...diffStat(patch) },
        patch,
        commands: change.commands.map((c) => c.run),
      };
    } catch {
      // Planning is best-effort for the preview; leave `available: false` on failure.
    }
  }

  return {
    repo: repoLabel,
    name: project.name,
    packageManager: project.packageManager,
    counts,
    findings,
    upgrade,
  };
}

function cloneShallow(url: string, dest: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // --depth 1 (no history) + blob:limit caps how much we pull for a huge repo.
    const git = spawn(
      'git',
      ['clone', '--depth', '1', '--filter=blob:limit=1m', '--quiet', url, dest],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let err = '';
    const timer = setTimeout(() => {
      git.kill('SIGKILL');
      reject(new Error('Clone timed out'));
    }, timeoutMs);
    git.stderr.on('data', (d: Buffer) => (err += d.toString()));
    git.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    git.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `git clone exited with ${code}`));
    });
  });
}

export interface ScanRepoOptions {
  /** Max time for the git clone before it's killed. Default 25s. */
  cloneTimeoutMs?: number;
}

/**
 * The full hosted flow: shallow-clone a public repo into a throwaway dir, run the real
 * engine against it, and return the payload — then always clean up. Read-only: no plugins
 * are discovered or loaded and no commands are ever run, so the target repo's code never
 * executes. Diagnostics reach the npm registry; nothing else leaves the box.
 */
export async function scanRepo(input: string, opts: ScanRepoOptions = {}): Promise<TryScanResult> {
  const { owner, repo, url } = parseRepo(input);
  const label = `${owner}/${repo}`;
  const dir = await mkdtemp(join(tmpdir(), 'vc-try-'));
  try {
    // Sanitize infra failures: raw git stderr / temp paths must never reach the caller.
    try {
      await cloneShallow(url, dir, opts.cloneTimeoutMs ?? 25_000);
    } catch (err) {
      const msg = err instanceof Error && err.message === 'Clone timed out' ? ' (timed out)' : '';
      throw new Error(`Could not clone ${label}${msg} — make sure it's a public GitHub repo.`);
    }
    let engine: Engine;
    try {
      engine = await openProject(dir, { plugins: [], journalPath: null });
    } catch {
      throw new Error(`${label} has no package.json at its root — nothing to scan.`);
    }
    return await scanProject(engine, label);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
