import semver from 'semver';
import type { ProjectModel } from './types.js';
import type { Advisory, Registry } from './registry/npm.js';

/** Facts come from verifiable providers; opinions from installed, attributed packs. */
export type DiagnosticSource =
  { type: 'fact'; provider: string } | { type: 'opinion'; pack: string; author: string };

export type DiagnosticKind = 'outdated' | 'deprecation' | 'vulnerability' | 'recommendation';
export type DiagnosticSeverity = 'info' | 'warn' | 'danger';

export interface Diagnostic {
  id: string;
  kind: DiagnosticKind;
  source: DiagnosticSource;
  severity: DiagnosticSeverity;
  target: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface Diagnostics {
  generatedAt: number;
  items: Diagnostic[];
}

/** Ranges we cannot meaningfully compare against the registry. */
const NON_REGISTRY = /^(workspace:|file:|link:|git\+|https?:|npm:|catalog:|\*$)/;

/**
 * A pure fact: which dependencies have a newer version available. Per-dep
 * failures are swallowed so one bad lookup never sinks the whole report.
 */
export async function computeOutdated(
  project: ProjectModel,
  registry: Registry,
): Promise<Diagnostic[]> {
  const deps = project.dependencies.filter((d) => d.type === 'prod' || d.type === 'dev');
  const results = await Promise.all(
    deps.map(async (dep): Promise<Diagnostic | null> => {
      if (NON_REGISTRY.test(dep.range)) return null;
      try {
        const latest = await registry.latestVersion(dep.name);
        if (!latest) return null;
        const current = semver.minVersion(dep.range);
        if (!current) return null;
        if (semver.gte(current.version, latest)) return null;
        const diff = semver.diff(current.version, latest) ?? 'update';
        return {
          id: `outdated:${dep.name}`,
          kind: 'outdated',
          source: { type: 'fact', provider: 'registry' },
          severity: diff === 'major' ? 'warn' : 'info',
          target: dep.name,
          message: `${current.version} → ${latest} (${diff})`,
          data: { current: current.version, latest, diff, range: dep.range, depType: dep.type },
        };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is Diagnostic => r !== null);
}

/** Direct prod/dev deps whose range we can resolve against the registry. */
function registryDeps(project: ProjectModel): Array<{ name: string; range: string; type: string }> {
  return project.dependencies.filter(
    (d) => (d.type === 'prod' || d.type === 'dev') && !NON_REGISTRY.test(d.range),
  );
}

/**
 * A maintainer's deprecation message usually names the successor. Pull it out
 * heuristically (backticked or bare package name after "use/replaced by/…").
 * Returns undefined rather than guessing when there's no clear pointer.
 */
function isPackageName(s: string): boolean {
  return s.length >= 2 && /^@?[a-z0-9][\w.-]*(?:\/[a-z0-9][\w.-]*)?$/i.test(s);
}

export function extractAlternative(message: string): string | undefined {
  // Tier 1: a backticked token right after a hand-off cue — the maintainer
  // explicitly marked it as code/a package, so trust any package-shaped name.
  const backticked = message.match(
    /\b(?:use|replaced?\s+(?:by|with)|migrate\s+to|switch\s+to|see)\s+`([^`]+)`/i,
  );
  const b = backticked?.[1]?.trim().match(/^@?[\w.-]+(?:\/[\w.-]+)?/)?.[0];
  if (b && isPackageName(b)) return b;

  // Tier 2: a bare token, but require a package-y separator (-, /, @) so plain
  // english words after "use"/"replaced by" aren't mistaken for packages.
  const bare = [
    /\buse\s+([@\w./-]+)\s+instead/i,
    /\breplaced?\s+(?:by|with)\s+([@\w./-]+)/i,
    /\bmigrate\s+to\s+([@\w./-]+)/i,
  ];
  for (const p of bare) {
    const cand = message.match(p)?.[1]?.replace(/[.,)]+$/, '');
    if (cand && isPackageName(cand) && /[@/-]/.test(cand)) return cand;
  }
  return undefined;
}

/** Deprecated dependencies — a fact from the maintainer, with the alternative if named. */
export async function computeDeprecations(
  project: ProjectModel,
  registry: Registry,
): Promise<Diagnostic[]> {
  if (!registry.deprecation) return [];
  const results = await Promise.all(
    registryDeps(project).map(async (dep): Promise<Diagnostic | null> => {
      try {
        const message = await registry.deprecation!(dep.name);
        if (!message) return null;
        const alternative = extractAlternative(message);
        return {
          id: `deprecation:${dep.name}`,
          kind: 'deprecation',
          source: { type: 'fact', provider: 'registry' },
          severity: 'warn',
          target: dep.name,
          message,
          data: { alternative, range: dep.range, depType: dep.type },
        };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is Diagnostic => r !== null);
}

const SEVERITY: Record<Advisory['severity'], DiagnosticSeverity> = {
  critical: 'danger',
  high: 'danger',
  moderate: 'warn',
  low: 'info',
  info: 'info',
};

/** Known security advisories affecting the version this project would resolve. */
export async function computeVulnerabilities(
  project: ProjectModel,
  registry: Registry,
): Promise<Diagnostic[]> {
  if (!registry.advisories) return [];
  const deps = registryDeps(project);
  const query: Record<string, string[]> = {};
  const ranges = new Map<string, string>();
  for (const dep of deps) {
    const current = semver.minVersion(dep.range)?.version;
    if (!current) continue;
    query[dep.name] = [current];
    ranges.set(dep.name, dep.range);
  }
  let report: Record<string, Advisory[]>;
  try {
    report = await registry.advisories(query);
  } catch {
    return [];
  }
  const items: Diagnostic[] = [];
  for (const [name, advisories] of Object.entries(report)) {
    for (const adv of advisories) {
      items.push({
        id: `vulnerability:${name}:${adv.id ?? adv.title}`,
        kind: 'vulnerability',
        source: { type: 'fact', provider: 'npm-advisory' },
        severity: SEVERITY[adv.severity] ?? 'warn',
        target: name,
        message: adv.title,
        data: {
          level: adv.severity,
          url: adv.url,
          vulnerableVersions: adv.vulnerable_versions,
          current: query[name]?.[0],
          range: ranges.get(name),
        },
      });
    }
  }
  return items;
}

/** Compute every fact: outdated, deprecated, and vulnerable dependencies. */
export async function computeDiagnostics(
  project: ProjectModel,
  registry: Registry,
): Promise<Diagnostics> {
  const [outdated, deprecations, vulnerabilities] = await Promise.all([
    computeOutdated(project, registry),
    computeDeprecations(project, registry),
    computeVulnerabilities(project, registry),
  ]);
  return { generatedAt: Date.now(), items: [...vulnerabilities, ...deprecations, ...outdated] };
}
