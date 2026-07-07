import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { openProject } from '@apostel/visual-config-core';

export interface ParsedRepo {
  owner: string;
  repo: string;
  url: string;
}

/** Accept `owner/repo`, `github.com/owner/repo`, or a full https URL (.git optional). */
export function parseRepo(input: string): ParsedRepo {
  const cleaned = input.trim().replace(/\.git$/, '');
  const m = cleaned.match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)$/);
  const owner = m?.[1];
  const repo = m?.[2];
  if (!owner || !repo) {
    throw new Error(`Not a GitHub repo: "${input}". Use owner/repo (e.g. sindresorhus/got).`);
  }
  return { owner, repo, url: `https://github.com/${owner}/${repo}.git` };
}

function cloneShallow(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const git = spawn('git', ['clone', '--depth', '1', '--quiet', url, dest], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    git.stderr.on('data', (d: Buffer) => (err += d.toString()));
    git.on('error', reject);
    git.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(err.trim() || `git clone exited with ${code}`)),
    );
  });
}

/**
 * Prototype of the hosted "URL → diff" flow: shallow-clone a public repo, run the
 * real engine against it, and print a patch that fixes what it finds. Read-only —
 * we never execute the repo's code, and this prints a diff rather than writing.
 * Summary goes to stderr; the patch goes to stdout (so it can be piped/applied).
 */
export async function tryRemote(input: string): Promise<void> {
  const { owner, repo, url } = parseRepo(input);
  const dir = mkdtempSync(join(tmpdir(), 'vc-try-'));
  const log = (s: string): void => void process.stderr.write(s);
  try {
    log(`  cloning ${owner}/${repo} (read-only, shallow)…\n`);
    await cloneShallow(url, dir);

    // No plugins, no journal, and we never run the repo's commands — diff only.
    const engine = await openProject(dir, { plugins: [], journalPath: null });
    const project = engine.getProject();
    log(`  reading ${project.name ?? repo} (${project.packageManager})…\n`);

    const diag = await engine.getDiagnostics();
    const outdated = diag.items.filter((d) => d.kind === 'outdated');
    const vulns = diag.items.filter((d) => d.kind === 'vulnerability');
    const deprecations = diag.items.filter((d) => d.kind === 'deprecation');

    log(`\n  ${owner}/${repo}\n`);
    log(
      `    ${outdated.length} outdated · ${vulns.length} vulnerable · ${deprecations.length} deprecated\n`,
    );
    for (const v of vulns) log(`    ⚠ vuln: ${v.target} — ${v.message}\n`);
    for (const d of deprecations) {
      const alt = d.data?.alternative ? ` → ${String(d.data.alternative)}` : '';
      log(`    ⚠ deprecated: ${d.target}${alt}\n`);
    }

    const upgrades = outdated
      .map((d) => ({ name: d.target, range: `^${String(d.data?.latest ?? '')}` }))
      .filter((u) => u.range !== '^');

    if (upgrades.length === 0) {
      log('\n  Nothing to upgrade — dependencies look current.\n');
      return;
    }

    const change = await engine.plan('upgrade-dependencies', { upgrades });
    log(
      `\n  Patch — upgrade ${upgrades.length} dependencies to latest (apply with \`git apply\`):\n\n`,
    );
    for (const edit of change.edits)
      process.stdout.write(edit.diff + (edit.diff.endsWith('\n') ? '' : '\n'));
    log(`\n  (The real thing would then run: ${change.commands.map((c) => c.run).join('; ')})\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
