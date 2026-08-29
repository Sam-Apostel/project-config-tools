import { describe, it, expect } from 'vitest';
import { discoverProjects } from './discover.js';
import { InMemoryFileSystem } from '../fs.js';

function pkg(name?: string): string {
  return JSON.stringify(name ? { name } : {}) + '\n';
}

describe('discoverProjects', () => {
  it('finds one target per repo and reads its name', async () => {
    const fs = new InMemoryFileSystem({
      '/work/app-a/package.json': pkg('app-a'),
      '/work/app-a/src/index.ts': '',
      '/work/app-b/package.json': pkg('@scope/app-b'),
    });
    const found = await discoverProjects(fs, '/work');
    expect(found).toEqual([
      { root: '/work/app-a', relPath: 'app-a', name: 'app-a' },
      { root: '/work/app-b', relPath: 'app-b', name: '@scope/app-b' },
    ]);
  });

  it('prunes workspace members below a repo root', async () => {
    const fs = new InMemoryFileSystem({
      '/work/mono/package.json': pkg('mono-root'),
      '/work/mono/packages/core/package.json': pkg('@mono/core'),
      '/work/mono/packages/ui/package.json': pkg('@mono/ui'),
    });
    const found = await discoverProjects(fs, '/work');
    // Only the top-most package.json (the monorepo root) is returned.
    expect(found.map((p) => p.root)).toEqual(['/work/mono']);
  });

  it('finds a package.json nested in a child folder (monorepo with no root manifest)', async () => {
    const fs = new InMemoryFileSystem({
      '/work/repo/.git/config': '',
      '/work/repo/frontend/package.json': pkg('frontend'),
    });
    const found = await discoverProjects(fs, '/work');
    expect(found).toEqual([
      { root: '/work/repo/frontend', relPath: 'repo/frontend', name: 'frontend' },
    ]);
  });

  it('respects the depth budget', async () => {
    const fs = new InMemoryFileSystem({
      '/work/a/b/c/d/package.json': pkg('too-deep'),
      '/work/near/package.json': pkg('near'),
    });
    expect((await discoverProjects(fs, '/work', { depth: 2 })).map((p) => p.name)).toEqual([
      'near',
    ]);
    expect((await discoverProjects(fs, '/work', { depth: 4 })).map((p) => p.name).sort()).toEqual([
      'near',
      'too-deep',
    ]);
  });

  it('ignores node_modules (skipped by walk)', async () => {
    const fs = new InMemoryFileSystem({
      '/work/app/package.json': pkg('app'),
      '/work/app/node_modules/left-pad/package.json': pkg('left-pad'),
    });
    const found = await discoverProjects(fs, '/work');
    expect(found.map((p) => p.name)).toEqual(['app']);
  });
});
