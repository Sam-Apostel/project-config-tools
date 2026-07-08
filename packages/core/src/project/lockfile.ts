import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ReadableFileSystem } from '../types.js';

/**
 * Read the exact installed version of each top-level dependency from whichever
 * lockfile is present. This is what makes diagnostics reflect what's actually
 * installed (and what a fresh install would resolve to) rather than the floor of
 * the declared semver range.
 *
 * Best-effort by design: an unreadable or unrecognized lockfile yields `{}`, and
 * the caller falls back to range-based comparison. Returns a plain record (name →
 * version) so it serializes cleanly across the RPC boundary.
 */
export async function readInstalledVersions(
  fs: ReadableFileSystem,
  root: string,
): Promise<Record<string, string>> {
  const read = async (name: string): Promise<string | undefined> => {
    try {
      return (await fs.exists(join(root, name))) ? await fs.readFile(join(root, name)) : undefined;
    } catch {
      return undefined;
    }
  };

  try {
    const pnpm = await read('pnpm-lock.yaml');
    if (pnpm) return parsePnpmLock(pnpm);
    const npm = (await read('package-lock.json')) ?? (await read('npm-shrinkwrap.json'));
    if (npm) return parseNpmLock(npm);
    const yarn = await read('yarn.lock');
    if (yarn) return parseYarnLock(yarn);
  } catch {
    // A malformed lockfile must never sink detection — fall through to {}.
  }
  return {};
}

/** Strip pnpm's peer-suffix and any leading `/name@` so we keep a bare semver. */
function cleanPnpmVersion(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const base = v.replace(/\(.*$/, '').trim(); // drop `(react@18)(…)` peer markers
  if (!base || base.startsWith('link:') || base.startsWith('file:')) return undefined;
  // Some entries look like `/@scope/name@1.2.3`; keep the trailing version.
  const at = base.lastIndexOf('@');
  const candidate = at > 0 ? base.slice(at + 1) : base;
  return /^\d/.test(candidate) ? candidate : undefined;
}

function parsePnpmLock(text: string): Record<string, string> {
  const doc = parseYaml(text) as {
    importers?: Record<string, Record<string, Record<string, { version?: unknown }>>>;
    dependencies?: Record<string, { version?: unknown } | string>;
    devDependencies?: Record<string, { version?: unknown } | string>;
  };
  const out: Record<string, string> = {};
  const takeGroup = (group?: Record<string, { version?: unknown } | string>): void => {
    for (const [name, entry] of Object.entries(group ?? {})) {
      const raw = typeof entry === 'string' ? entry : entry?.version;
      const v = cleanPnpmVersion(raw);
      if (v) out[name] = v;
    }
  };
  // Modern pnpm (v9): the root workspace member lives under importers['.'].
  const root = doc.importers?.['.'];
  if (root) {
    takeGroup(root.dependencies);
    takeGroup(root.devDependencies);
    takeGroup(root.optionalDependencies);
  } else {
    // Older single-package pnpm lockfiles put the maps at the top level.
    takeGroup(doc.dependencies);
    takeGroup(doc.devDependencies);
  }
  return out;
}

function parseNpmLock(text: string): Record<string, string> {
  const doc = JSON.parse(text) as {
    packages?: Record<string, { version?: string }>;
    dependencies?: Record<string, { version?: string }>;
  };
  const out: Record<string, string> = {};
  // lockfileVersion 2/3: exact versions live under packages['node_modules/<name>'].
  if (doc.packages) {
    for (const [path, entry] of Object.entries(doc.packages)) {
      if (!path.startsWith('node_modules/')) continue;
      const name = path.slice('node_modules/'.length);
      // Skip nested paths (a/node_modules/b) — keep only top-level installs.
      if (name.includes('/node_modules/')) continue;
      if (entry.version) out[name] = entry.version;
    }
  }
  // lockfileVersion 1: a flat dependencies map.
  if (doc.dependencies) {
    for (const [name, entry] of Object.entries(doc.dependencies)) {
      if (entry.version && !out[name]) out[name] = entry.version;
    }
  }
  return out;
}

function parseYarnLock(text: string): Record<string, string> {
  // Yarn Berry (v2+) is real YAML; classic (v1) is a bespoke format.
  if (/^__metadata:/m.test(text)) return parseYarnBerry(text);
  return parseYarnClassic(text);
}

function parseYarnBerry(text: string): Record<string, string> {
  const doc = parseYaml(text) as Record<string, { version?: string }>;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(doc)) {
    if (key === '__metadata' || !entry?.version) continue;
    // Keys are comma-joined descriptors like "lodash@npm:^4.17.0, lodash@npm:^4".
    for (const desc of key.split(',')) {
      const name = descriptorName(desc.trim());
      if (name) out[name] = entry.version;
    }
  }
  return out;
}

function parseYarnClassic(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let headers: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#') || line.trim() === '') continue;
    if (!/^\s/.test(line) && line.trimEnd().endsWith(':')) {
      // A block header: one or more comma-separated "name@range" specifiers.
      headers = line
        .slice(0, -1)
        .split(',')
        .map((s) => s.trim().replace(/^"|"$/g, ''));
      continue;
    }
    const m = line.match(/^\s+version:?\s+"?([^"\s]+)"?/);
    if (m?.[1] && headers.length) {
      for (const h of headers) {
        const name = descriptorName(h);
        if (name) out[name] = m[1];
      }
      headers = [];
    }
  }
  return out;
}

/** Extract the package name from a lock descriptor like `@scope/pkg@npm:^1.2` or `pkg@^1`. */
function descriptorName(descriptor: string): string | undefined {
  const d = descriptor.replace(/^"|"$/g, '');
  const scoped = d.startsWith('@');
  const at = d.indexOf('@', scoped ? 1 : 0);
  const name = at > 0 ? d.slice(0, at) : d;
  return name || undefined;
}
