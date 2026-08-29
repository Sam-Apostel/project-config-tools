import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import type { ReadableFileSystem } from '../types.js';

/** A dir under the scanned parent that holds a package.json — a fan-out target. */
export interface DiscoveredProject {
  /** Absolute path to the directory containing package.json. */
  root: string;
  /** Path relative to the scanned parent, `/`-separated (`.` for the parent itself). */
  relPath: string;
  /** The package.json `name`, when it declares one. */
  name?: string;
}

export interface DiscoverOptions {
  /** How many directory levels below the parent to search. Default 3. */
  depth?: number;
}

/** A `FileSystem` whose `walk` we lean on (kept minimal so this is easy to stub). */
interface Walkable extends ReadableFileSystem {
  walk(dir: string): Promise<string[]>;
}

/**
 * Discover npm projects under a parent folder — no config file, pure filesystem.
 *
 * We walk the parent (the fs `walk` already skips node_modules/.git/dist), take
 * every directory that holds a `package.json` within `depth` levels, and **prune
 * nested ones**: the top-most package.json in each subtree wins. That yields one
 * target per repo and handles both shapes the user cares about — a repo with its
 * package.json at the root, and a monorepo whose package.json lives in a child
 * folder (found wherever it sits, as long as it's within `depth`). Workspace
 * members below a repo root are left to the engine's own workspace support.
 */
export async function discoverProjects(
  fs: Walkable,
  parent: string,
  opts: DiscoverOptions = {},
): Promise<DiscoveredProject[]> {
  const depth = opts.depth ?? 3;
  const parentDir = resolve(parent);

  const pkgDirs = new Set<string>();
  for (const file of await fs.walk(parentDir)) {
    if (basename(file) === 'package.json') pkgDirs.add(dirname(file));
  }

  // Keep dirs within the depth budget, sorted so ancestors precede descendants.
  const withinDepth = [...pkgDirs]
    .filter((dir) => {
      const rel = relative(parentDir, dir);
      if (rel === '') return true; // the parent itself
      if (rel.startsWith('..')) return false; // outside the parent
      return rel.split(sep).length <= depth;
    })
    .sort();

  // Prune: drop any dir that sits under one we already accepted.
  const roots: string[] = [];
  for (const dir of withinDepth) {
    if (!roots.some((r) => dir === r || dir.startsWith(r + sep))) roots.push(dir);
  }

  const projects: DiscoveredProject[] = [];
  for (const root of roots) {
    let name: string | undefined;
    try {
      const pkg = JSON.parse(await fs.readFile(join(root, 'package.json'))) as { name?: unknown };
      if (typeof pkg.name === 'string') name = pkg.name;
    } catch {
      // A malformed package.json still marks a project; it just has no name here.
    }
    const rel = relative(parentDir, root);
    projects.push({ root, relPath: rel === '' ? '.' : rel.split(sep).join('/'), name });
  }
  return projects;
}
