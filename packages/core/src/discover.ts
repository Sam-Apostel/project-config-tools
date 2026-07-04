import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { Plugin } from './plugin.js';

function looksLikePlugin(value: unknown): value is Plugin {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Plugin).id === 'string' &&
    typeof (value as Plugin).setup === 'function'
  );
}

interface DepManifest {
  name?: string;
  keywords?: string[];
  ['visual-config']?: unknown;
}

/**
 * Find a package's own package.json by walking up from its resolved entry —
 * robust even when the package's `exports` map blocks the `/package.json`
 * subpath (Node's exports encapsulation).
 */
async function manifestForEntry(entry: string, name: string): Promise<DepManifest | undefined> {
  let dir = dirname(entry);
  for (let i = 0; i < 8; i++) {
    try {
      const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as DepManifest;
      if (manifest.name === name) return manifest;
    } catch {
      /* keep walking */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Discover installed plugins from the project's dependencies (npm-first, per
 * the v1 distribution decision): any dependency whose package.json carries a
 * `visual-config` field or the `visual-config-plugin` keyword is imported and,
 * if it exports a Plugin, loaded. Broken/unresolvable entries are skipped.
 */
export async function discoverPlugins(root: string): Promise<Plugin[]> {
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch {
    return [];
  }

  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  const require = createRequire(join(root, 'package.json'));
  const plugins: Plugin[] = [];

  for (const name of names) {
    try {
      const entry = require.resolve(name);
      const manifest = await manifestForEntry(entry, name);
      const isPlugin =
        manifest?.['visual-config'] !== undefined ||
        (Array.isArray(manifest?.keywords) && manifest.keywords.includes('visual-config-plugin'));
      if (!isPlugin) continue;

      const mod = (await import(pathToFileURL(entry).href)) as { default?: unknown };
      const candidate = mod.default ?? mod;
      if (looksLikePlugin(candidate)) plugins.push(candidate);
    } catch {
      /* skip unresolvable or broken dependencies */
    }
  }

  return plugins;
}
