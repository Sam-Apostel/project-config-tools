import { describe, it, expect } from 'vitest';
import { computeOutdated } from './diagnostics.js';
import { searchCatalog } from './catalog.js';
import type { Registry, RegistrySearchHit } from './registry/npm.js';
import type { ProjectModel } from './types.js';

class StubRegistry implements Registry {
  constructor(
    private readonly latest: Record<string, string>,
    private readonly hits: RegistrySearchHit[] = [],
  ) {}
  search(): Promise<RegistrySearchHit[]> {
    return Promise.resolve(this.hits);
  }
  latestVersion(name: string): Promise<string | undefined> {
    return Promise.resolve(this.latest[name]);
  }
}

function project(deps: ProjectModel['dependencies']): ProjectModel {
  return {
    root: '/p',
    packageManager: 'npm',
    scripts: [],
    dependencies: deps,
    configFiles: [],
    detected: [],
    workspaces: [],
  };
}

describe('computeOutdated', () => {
  it('flags a dependency with a newer version', async () => {
    const reg = new StubRegistry({ zod: '3.24.0' });
    const items = await computeOutdated(
      project([{ name: 'zod', range: '^3.23.0', type: 'prod' }]),
      reg,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('outdated');
    expect(items[0]!.source).toEqual({ type: 'fact', provider: 'registry' });
    expect(items[0]!.data?.latest).toBe('3.24.0');
  });

  it('marks a major jump as warn severity', async () => {
    const reg = new StubRegistry({ react: '19.0.0' });
    const items = await computeOutdated(
      project([{ name: 'react', range: '^18.3.0', type: 'prod' }]),
      reg,
    );
    expect(items[0]!.severity).toBe('warn');
    expect(items[0]!.data?.diff).toBe('major');
  });

  it('does not flag an up-to-date dependency', async () => {
    const reg = new StubRegistry({ zod: '3.23.0' });
    const items = await computeOutdated(
      project([{ name: 'zod', range: '^3.23.0', type: 'prod' }]),
      reg,
    );
    expect(items).toHaveLength(0);
  });

  it('skips non-registry ranges (workspace/file/*)', async () => {
    const reg = new StubRegistry({ a: '9.9.9', b: '9.9.9' });
    const items = await computeOutdated(
      project([
        { name: 'a', range: 'workspace:*', type: 'prod' },
        { name: 'b', range: '*', type: 'dev' },
      ]),
      reg,
    );
    expect(items).toHaveLength(0);
  });

  it('swallows per-dependency lookup errors', async () => {
    const failing: Registry = {
      search: () => Promise.resolve([]),
      latestVersion: () => Promise.reject(new Error('network')),
    };
    const items = await computeOutdated(
      project([{ name: 'zod', range: '^3', type: 'prod' }]),
      failing,
    );
    expect(items).toHaveLength(0);
  });
});

describe('searchCatalog', () => {
  it('maps registry hits into catalog packages', async () => {
    const reg = new StubRegistry({}, [
      {
        name: 'zod',
        version: '3.24.0',
        description: 'schema validation',
        links: { npm: 'https://npm/zod', homepage: 'https://zod.dev' },
        publisher: 'colinhacks',
      },
    ]);
    const result = await searchCatalog(reg, { text: 'zod' });
    expect(result.packages[0]).toMatchObject({
      name: 'zod',
      version: '3.24.0',
      homepage: 'https://zod.dev',
      publisher: 'colinhacks',
    });
  });
});
