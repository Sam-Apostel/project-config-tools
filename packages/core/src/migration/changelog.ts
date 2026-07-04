import semver from 'semver';
import type { BreakingChange, ChangelogSource, ReleaseNotes } from './types.js';

/** Pull `owner/repo` out of a package.json `repository` url. */
export function parseGithubRepo(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.#]+)/i);
  return m ? `${m[1]}/${m[2]}` : undefined;
}

function guessKind(text: string): BreakingChange['kind'] {
  const t = text.toLowerCase();
  if (/\bremov|\bdelet|\bdrop/.test(t)) return 'removed-api';
  if (/\brenam/.test(t)) return 'renamed';
  if (/\bsignature|\bargument|\bparam/.test(t)) return 'changed-signature';
  if (/\bnode\b|\bengine/.test(t)) return 'node-engine';
  if (/\besm\b|\bcjs\b|\bcommonjs/.test(t)) return 'esm-cjs';
  if (/\bpeer\b/.test(t)) return 'peer-dep';
  if (/\bconfig|\boption/.test(t)) return 'config';
  return 'behavior';
}

const STOPWORDS = new Set(['true', 'false', 'null', 'undefined', 'string', 'number', 'boolean']);

/** Heuristically pull code identifiers out of a breaking-change line (backticked). */
export function extractSymbols(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const raw = m[1]!.trim();
    // take a leading identifier (drop call parens, member access, args)
    const id = raw.match(/^[A-Za-z_$][\w$]*/)?.[0];
    if (id && !STOPWORDS.has(id) && id.length > 1) out.add(id);
  }
  return [...out];
}

/** Extract breaking-change bullets from a release body. */
export function extractBreakingChanges(version: string, body: string): BreakingChange[] {
  const lines = body.split(/\r?\n/);
  const changes: BreakingChange[] = [];
  let inBreakingSection = false;

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      inBreakingSection = /breaking/i.test(line);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const isBullet = bullet !== null;
    const content = bullet?.[1] ?? line;
    const flaggedInline = /breaking/i.test(line);
    if ((inBreakingSection && isBullet) || (isBullet && flaggedInline)) {
      const summary = content.replace(/\*\*BREAKING[^:]*:?\*\*/i, '').trim();
      if (summary) {
        changes.push({
          version,
          summary,
          kind: guessKind(summary),
          symbols: extractSymbols(summary),
        });
      }
    }
  }
  return changes;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
}

interface Packument {
  repository?: { url?: string } | string;
}

/**
 * Fetch release notes from GitHub Releases between two versions. Best-effort:
 * resolves the repo from the npm packument, then reads public releases (no auth,
 * rate-limited). Failures degrade to an empty list, never throw upward.
 */
export class GithubChangelogSource implements ChangelogSource {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly registryBase = 'https://registry.npmjs.org',
    private readonly githubBase = 'https://api.github.com',
  ) {}

  private async resolveRepo(pkg: string): Promise<string | undefined> {
    try {
      const res = await this.fetchImpl(`${this.registryBase}/${pkg}`);
      if (!res.ok) return undefined;
      const data = (await res.json()) as Packument;
      const url = typeof data.repository === 'string' ? data.repository : data.repository?.url;
      return parseGithubRepo(url);
    } catch {
      return undefined;
    }
  }

  async fetch(pkg: string, from: string, to: string, repoUrl?: string): Promise<ReleaseNotes[]> {
    const repo = parseGithubRepo(repoUrl) ?? (await this.resolveRepo(pkg));
    if (!repo) return [];
    try {
      const res = await this.fetchImpl(`${this.githubBase}/repos/${repo}/releases?per_page=100`, {
        headers: { accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return [];
      const releases = (await res.json()) as GithubRelease[];
      const out: ReleaseNotes[] = [];
      for (const rel of releases) {
        const version = semver.clean((rel.tag_name ?? '').replace(/^v/, '')) ?? undefined;
        if (!version) continue;
        if (!semver.gt(version, from) || semver.gt(version, to)) continue;
        out.push({
          version,
          url: rel.html_url,
          body: rel.body ?? '',
          breakingChanges: extractBreakingChanges(version, rel.body ?? ''),
        });
      }
      return out.sort((a, b) => (semver.gt(a.version, b.version) ? 1 : -1));
    } catch {
      return [];
    }
  }
}
