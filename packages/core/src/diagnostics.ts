import semver from 'semver';
import type { ProjectModel } from './types.js';
import type { Registry } from './registry/npm.js';

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

/** Compute all facts (outdated for now; vulns/deprecations later). */
export async function computeDiagnostics(
  project: ProjectModel,
  registry: Registry,
): Promise<Diagnostics> {
  const items = await computeOutdated(project, registry);
  return { generatedAt: Date.now(), items };
}
