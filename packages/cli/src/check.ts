import { openProject } from '@apostel/visual-config-core';
import type { Diagnostic } from '@apostel/visual-config-core';

/** Diagnostic kinds a CI check can gate on. */
export type FailKind = 'vulnerability' | 'deprecation' | 'outdated';

const ALIASES: Record<string, FailKind | 'any' | 'none'> = {
  vuln: 'vulnerability',
  vulns: 'vulnerability',
  vulnerability: 'vulnerability',
  vulnerabilities: 'vulnerability',
  deprecation: 'deprecation',
  deprecations: 'deprecation',
  deprecated: 'deprecation',
  outdated: 'outdated',
  any: 'any',
  all: 'any',
  none: 'none',
};

/**
 * Parse a `--fail-on` spec (comma-separated kinds, or `any`/`none`) into the set
 * of diagnostic kinds that should fail the check. Throws on an unknown token.
 */
export function parseFailOn(spec: string): Set<FailKind> {
  const set = new Set<FailKind>();
  for (const token of spec
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)) {
    const kind = ALIASES[token];
    if (kind === 'none') return new Set();
    if (kind === 'any') return new Set(['vulnerability', 'deprecation', 'outdated']);
    if (kind) set.add(kind);
    else {
      throw new Error(
        `Unknown --fail-on value "${token}". Use vuln, deprecation, outdated, any, or none.`,
      );
    }
  }
  return set;
}

export interface CheckCounts {
  vulnerability: number;
  deprecation: number;
  outdated: number;
}

/** Pure policy: which selected kinds are present. `ok` is true when none are. */
export function evaluatePolicy(
  counts: CheckCounts,
  failOn: Set<FailKind>,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const label: Record<FailKind, [string, string]> = {
    vulnerability: ['vulnerability', 'vulnerabilities'],
    deprecation: ['deprecated dependency', 'deprecated dependencies'],
    outdated: ['outdated dependency', 'outdated dependencies'],
  };
  for (const kind of ['vulnerability', 'deprecation', 'outdated'] as const) {
    if (failOn.has(kind) && counts[kind] > 0) {
      const [one, many] = label[kind];
      reasons.push(`${counts[kind]} ${counts[kind] === 1 ? one : many}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

function countKinds(items: Diagnostic[]): CheckCounts {
  const counts: CheckCounts = { vulnerability: 0, deprecation: 0, outdated: 0 };
  for (const d of items) {
    if (d.kind === 'vulnerability') counts.vulnerability++;
    else if (d.kind === 'deprecation') counts.deprecation++;
    else if (d.kind === 'outdated') counts.outdated++;
  }
  return counts;
}

export interface CheckOptions {
  json: boolean;
  failOn: Set<FailKind>;
}

/**
 * The headless CI check: read the project, compute fact-based diagnostics, print
 * a summary (or JSON), and return an exit code (0 pass, 1 policy-fail). The engine
 * only reads/parses — it never runs the project's code.
 */
export async function runCheck(root: string, opts: CheckOptions): Promise<number> {
  const engine = await openProject(root, { plugins: [], journalPath: null });
  const project = engine.getProject();
  const diag = await engine.getDiagnostics();
  const counts = countKinds(diag.items);
  const { ok, reasons } = evaluatePolicy(counts, opts.failOn);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          project: project.name ?? null,
          packageManager: project.packageManager,
          counts,
          ok,
          failedOn: reasons,
          findings: diag.items,
        },
        null,
        2,
      ) + '\n',
    );
    return ok ? 0 : 1;
  }

  const out = (s: string): void => void process.stdout.write(s + '\n');
  out(`visual-config check · ${project.name ?? root} (${project.packageManager})`);
  out(
    `  ${counts.vulnerability} vulnerable · ${counts.outdated} outdated · ${counts.deprecation} deprecated`,
  );
  for (const d of diag.items) {
    if (d.kind === 'vulnerability') {
      out(`  ✖ ${d.target}  ${String(d.data?.level ?? d.severity)}  ${d.message}`);
    } else if (d.kind === 'deprecation') {
      const alt = d.data?.alternative ? ` → ${String(d.data.alternative)}` : '';
      out(`  ⚠ ${d.target}  deprecated${alt}`);
    }
  }
  if (ok) {
    out(opts.failOn.size === 0 ? '✓ check passed (nothing gated)' : '✓ check passed');
  } else {
    out(`✖ check failed: ${reasons.join(', ')}`);
  }
  return ok ? 0 : 1;
}
