import { describe, it, expect } from 'vitest';
import { computeInstallSizes } from './sizes.js';
import type { ProjectModel } from '../types.js';
import type { Registry, RegistrySearchHit } from '../registry/npm.js';

function project(deps: ProjectModel['dependencies']): ProjectModel {
  return {
    root: '/p',
    packageManager: 'npm',
    scripts: [],
    dependencies: deps,
    configFiles: [],
    detected: [],
    workspaces: [],
    workspacePackages: [],
  };
}

class SizeRegistry implements Registry {
  constructor(private readonly sizes: Record<string, number | undefined>) {}
  search(): Promise<RegistrySearchHit[]> {
    return Promise.resolve([]);
  }
  latestVersion(): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }
  unpackedSize(name: string): Promise<number | undefined> {
    return Promise.resolve(this.sizes[name]);
  }
}

describe('computeInstallSizes', () => {
  it('sums per-package unpacked sizes, sorts largest first, counts unknowns', async () => {
    const p = project([
      { name: 'big', range: '^1', type: 'prod', resolved: '1.0.0' },
      { name: 'small', range: '^1', type: 'dev' },
      { name: 'private-pkg', range: '^1', type: 'prod' }, // no size → unknown
      { name: 'ws', range: 'workspace:*', type: 'prod' }, // skipped, non-registry
    ]);
    const registry = new SizeRegistry({ big: 900000, small: 1000, 'private-pkg': undefined });

    const result = await computeInstallSizes(p, registry);
    expect(result.packages.map((x) => x.name)).toEqual(['big', 'small']);
    expect(result.packages[0]).toMatchObject({ name: 'big', bytes: 900000, version: '1.0.0' });
    expect(result.total).toBe(901000);
    expect(result.unknown).toBe(1); // private-pkg; workspace dep isn't counted
  });

  it('returns an empty report when the registry cannot measure size', async () => {
    const bare: Registry = {
      search: () => Promise.resolve([]),
      latestVersion: () => Promise.resolve(undefined),
    };
    const result = await computeInstallSizes(
      project([{ name: 'x', range: '^1', type: 'prod' }]),
      bare,
    );
    expect(result).toMatchObject({ total: 0, unknown: 0, packages: [] });
  });
});
