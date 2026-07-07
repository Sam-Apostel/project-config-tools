import { describe, it, expect } from 'vitest';
import {
  computeOutdated,
  computeDeprecations,
  computeVulnerabilities,
  computeDiagnostics,
  extractAlternative,
} from './diagnostics.js';
import { searchCatalog } from './catalog.js';
import type { Advisory, Registry, RegistrySearchHit } from './registry/npm.js';
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

class RichRegistry implements Registry {
  constructor(
    private readonly opts: {
      latest?: Record<string, string>;
      deprecated?: Record<string, string>;
      advisories?: Record<string, Advisory[]>;
    } = {},
  ) {}
  search(): Promise<RegistrySearchHit[]> {
    return Promise.resolve([]);
  }
  latestVersion(name: string): Promise<string | undefined> {
    return Promise.resolve(this.opts.latest?.[name]);
  }
  deprecation(name: string): Promise<string | undefined> {
    return Promise.resolve(this.opts.deprecated?.[name]);
  }
  advisories(query: Record<string, string[]>): Promise<Record<string, Advisory[]>> {
    const out: Record<string, Advisory[]> = {};
    for (const name of Object.keys(query)) {
      if (this.opts.advisories?.[name]) out[name] = this.opts.advisories[name]!;
    }
    return Promise.resolve(out);
  }
}

describe('extractAlternative', () => {
  it('pulls a named successor out of a deprecation message', () => {
    expect(extractAlternative('This package is deprecated. Use `@scope/new` instead.')).toBe(
      '@scope/new',
    );
    expect(extractAlternative('deprecated, replaced by date-fns')).toBe('date-fns');
    expect(extractAlternative('Please migrate to `undici`.')).toBe('undici');
  });
  it('returns undefined when no clear alternative is named', () => {
    expect(extractAlternative('This package is no longer maintained.')).toBeUndefined();
    expect(extractAlternative('use it carefully')).toBeUndefined();
  });
});

describe('computeDeprecations', () => {
  it('flags a deprecated dependency and extracts the alternative', async () => {
    const reg = new RichRegistry({ deprecated: { request: 'Deprecated. Use `got` instead.' } });
    const items = await computeDeprecations(
      project([{ name: 'request', range: '^2.88.0', type: 'prod' }]),
      reg,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('deprecation');
    expect(items[0]!.severity).toBe('warn');
    expect(items[0]!.data?.alternative).toBe('got');
  });

  it('is empty when the registry has no deprecation support', async () => {
    const reg = new StubRegistry({});
    const items = await computeDeprecations(
      project([{ name: 'zod', range: '^3', type: 'prod' }]),
      reg,
    );
    expect(items).toHaveLength(0);
  });
});

describe('computeVulnerabilities', () => {
  it('maps an advisory affecting the resolved version to a danger diagnostic', async () => {
    const reg = new RichRegistry({
      advisories: {
        lodash: [
          {
            id: 1523,
            title: 'Prototype Pollution',
            severity: 'high',
            url: 'https://github.com/advisories/GHSA-x',
            vulnerable_versions: '<4.17.21',
          },
        ],
      },
    });
    const items = await computeVulnerabilities(
      project([{ name: 'lodash', range: '^4.17.11', type: 'prod' }]),
      reg,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe('vulnerability');
    expect(items[0]!.severity).toBe('danger');
    expect(items[0]!.data?.level).toBe('high');
    expect(items[0]!.data?.url).toContain('advisories');
  });
});

describe('computeDiagnostics', () => {
  it('combines vulnerabilities, deprecations, and outdated (vulns first)', async () => {
    const reg = new RichRegistry({
      latest: { lodash: '4.17.21' },
      deprecated: { lodash: 'Use `lodash-es`.' },
      advisories: {
        lodash: [{ title: 'Prototype Pollution', severity: 'critical' }],
      },
    });
    const { items } = await computeDiagnostics(
      project([{ name: 'lodash', range: '^4.17.0', type: 'prod' }]),
      reg,
    );
    expect(items.map((i) => i.kind)).toEqual(['vulnerability', 'deprecation', 'outdated']);
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
