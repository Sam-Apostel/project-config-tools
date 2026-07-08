import semver from 'semver';
import type { ProjectModel } from './types.js';
import type { Registry } from './registry/npm.js';
import { computeVulnerabilities } from './diagnostics.js';

export interface VulnAdvisory {
  title: string;
  severity: string;
  url?: string;
}

export interface VulnFix {
  name: string;
  /** The version currently in play (installed, or the range floor). */
  from: string;
  /** The lowest safe version that escapes every advisory affecting this package. */
  to: string;
  /** Whether `to` crosses a major from `from` (a potentially breaking upgrade). */
  major: boolean;
  advisories: VulnAdvisory[];
}

export interface Remediation {
  fixes: VulnFix[];
  /** Vulnerable packages we could not find a safe published version for. */
  unfixable: Array<{ name: string; from: string; advisories: VulnAdvisory[] }>;
}

/** Pick the lowest stable version above `from` that satisfies none of the vulnerable ranges. */
export function pickSafeVersion(
  from: string,
  versions: string[],
  vulnerableRanges: string[],
): string | undefined {
  const ranges = vulnerableRanges.filter(Boolean);
  const safe = versions
    .filter((v) => semver.valid(v) && !semver.prerelease(v))
    .filter((v) => semver.gt(v, from))
    .filter((v) => !ranges.some((r) => rangeIncludes(r, v)))
    .sort(semver.compare);
  return safe[0];
}

/** A vulnerable_versions range may be malformed; treat an unparseable range as non-matching. */
function rangeIncludes(range: string, version: string): boolean {
  try {
    return semver.satisfies(version, range, { includePrerelease: true });
  } catch {
    return false;
  }
}

/**
 * Turn vulnerability findings into concrete upgrade targets: for each vulnerable
 * direct dependency, the minimal safe version that escapes every advisory
 * affecting it. Packages with no safe published version are reported as
 * `unfixable` rather than silently dropped.
 */
export async function computeRemediation(
  project: ProjectModel,
  registry: Registry,
): Promise<Remediation> {
  const vulns = await computeVulnerabilities(project, registry);
  if (vulns.length === 0 || !registry.versions) return { fixes: [], unfixable: [] };

  // Group advisories + their vulnerable ranges by package.
  const byPackage = new Map<
    string,
    { from: string; ranges: string[]; advisories: VulnAdvisory[] }
  >();
  for (const v of vulns) {
    const from = String(v.data?.current ?? '');
    if (!semver.valid(from)) continue;
    const entry = byPackage.get(v.target) ?? { from, ranges: [], advisories: [] };
    const range = v.data?.vulnerableVersions;
    if (typeof range === 'string' && range) entry.ranges.push(range);
    entry.advisories.push({
      title: v.message,
      severity: String(v.data?.level ?? v.severity),
      url: v.data?.url ? String(v.data.url) : undefined,
    });
    byPackage.set(v.target, entry);
  }

  const fixes: VulnFix[] = [];
  const unfixable: Remediation['unfixable'] = [];
  await Promise.all(
    [...byPackage.entries()].map(async ([name, info]) => {
      let to: string | undefined;
      try {
        to = pickSafeVersion(info.from, await registry.versions!(name), info.ranges);
      } catch {
        to = undefined;
      }
      if (to) {
        fixes.push({
          name,
          from: info.from,
          to,
          major: semver.major(to) > semver.major(info.from),
          advisories: info.advisories,
        });
      } else {
        unfixable.push({ name, from: info.from, advisories: info.advisories });
      }
    }),
  );
  fixes.sort((a, b) => a.name.localeCompare(b.name));
  unfixable.sort((a, b) => a.name.localeCompare(b.name));
  return { fixes, unfixable };
}
