import { describe, it, expect } from 'vitest';
import { detectProject } from './detect.js';
import { InMemoryFileSystem } from '../fs.js';

function pkg(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

describe('detectProject workspaces', () => {
  it('resolves npm/yarn workspace globs to member packages', async () => {
    const fs = new InMemoryFileSystem({
      '/proj/package.json': pkg({ name: 'root', private: true, workspaces: ['packages/*'] }),
      '/proj/packages/core/package.json': pkg({ name: '@acme/core' }),
      '/proj/packages/ui/package.json': pkg({ name: '@acme/ui' }),
      // Deeper than one level — not matched by `packages/*`.
      '/proj/packages/ui/fixtures/nested/package.json': pkg({ name: 'nested' }),
    });
    const project = await detectProject(fs, '/proj');
    expect(project.workspaces).toEqual(['packages/*']);
    expect(project.workspacePackages).toEqual([
      { name: '@acme/core', dir: 'packages/core' },
      { name: '@acme/ui', dir: 'packages/ui' },
    ]);
  });

  it('reads the object form of workspaces', async () => {
    const fs = new InMemoryFileSystem({
      '/proj/package.json': pkg({ name: 'root', workspaces: { packages: ['apps/*'] } }),
      '/proj/apps/web/package.json': pkg({ name: 'web' }),
    });
    const project = await detectProject(fs, '/proj');
    expect(project.workspaces).toEqual(['apps/*']);
    expect(project.workspacePackages).toEqual([{ name: 'web', dir: 'apps/web' }]);
  });

  it('parses pnpm-workspace.yaml and lists it as a read-only config', async () => {
    const fs = new InMemoryFileSystem({
      '/proj/package.json': pkg({ name: 'root', private: true }),
      '/proj/pnpm-workspace.yaml': [
        'packages:',
        "  - 'packages/*'",
        '  - apps/**   # every app, nested too',
        "  - '!**/__fixtures__/**'",
        '',
        'onlyBuiltDependencies:',
        '  - esbuild',
        '',
      ].join('\n'),
      '/proj/packages/core/package.json': pkg({ name: '@acme/core' }),
      '/proj/apps/web/admin/package.json': pkg({ name: 'admin' }),
    });
    const project = await detectProject(fs, '/proj');
    expect(project.workspaces).toEqual(['packages/*', 'apps/**', '!**/__fixtures__/**']);
    expect(project.workspacePackages.map((p) => p.dir)).toEqual([
      'apps/web/admin',
      'packages/core',
    ]);
    expect(project.configFiles).toContainEqual({
      path: 'pnpm-workspace.yaml',
      kind: 'pnpm-workspace',
      format: 'yaml',
      editable: 'read-only',
    });
  });

  it('honors `!` exclusion globs', async () => {
    const fs = new InMemoryFileSystem({
      '/proj/package.json': pkg({ name: 'root', workspaces: ['packages/*', '!packages/private'] }),
      '/proj/packages/core/package.json': pkg({ name: 'core' }),
      '/proj/packages/private/package.json': pkg({ name: 'private' }),
    });
    const project = await detectProject(fs, '/proj');
    expect(project.workspacePackages.map((p) => p.dir)).toEqual(['packages/core']);
  });

  it('is empty for a single-package project', async () => {
    const fs = new InMemoryFileSystem({ '/proj/package.json': pkg({ name: 'solo' }) });
    const project = await detectProject(fs, '/proj');
    expect(project.workspaces).toEqual([]);
    expect(project.workspacePackages).toEqual([]);
  });
});
