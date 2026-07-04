import { describe, it, expect } from 'vitest';
import { InMemoryFileSystem } from '../fs.js';
import { scanUsage } from './usage.js';
import { analyzeBump } from './analyze.js';
import { extractBreakingChanges, extractSymbols, parseGithubRepo } from './changelog.js';
import type { ChangelogSource, ReleaseNotes, UsageMap } from './types.js';

const ROOT = '/proj';

describe('scanUsage', () => {
  it('finds named, default, and namespace imports', async () => {
    const fs = new InMemoryFileSystem({
      '/proj/src/a.ts': `import { z } from 'zod';\nimport React from 'react';\n`,
      '/proj/src/b.tsx': `import * as ns from 'zod';\n`,
      '/proj/node_modules/zod/index.js': `import { internal } from 'zod';`,
    });
    const usage = await scanUsage(fs, ROOT, 'zod');
    expect(usage.used).toBe(true);
    expect(usage.symbols).toContain('z');
    expect(usage.symbols).toContain('*');
    // node_modules is skipped by walk
    expect(usage.symbols).not.toContain('internal');
    expect(usage.sites).toHaveLength(2);
  });

  it('reports unused when the package is not imported', async () => {
    const fs = new InMemoryFileSystem({ '/proj/src/a.ts': `import { z } from 'zod';\n` });
    const usage = await scanUsage(fs, ROOT, 'lodash');
    expect(usage.used).toBe(false);
    expect(usage.sites).toHaveLength(0);
  });

  it('parses subpath imports and require', async () => {
    const fs = new InMemoryFileSystem({
      '/proj/a.js': `const { readFile } = require('fs-extra');\nimport merge from 'lodash/merge';\n`,
    });
    const usage = await scanUsage(fs, ROOT, 'lodash');
    expect(usage.sites[0]!.kind).toBe('subpath-import');
  });
});

function stubChangelog(releases: ReleaseNotes[]): ChangelogSource {
  return { fetch: () => Promise.resolve(releases) };
}

function usageMap(partial: Partial<UsageMap>): UsageMap {
  return { package: 'pkg', used: false, symbols: [], sites: [], ...partial };
}

describe('analyzeBump', () => {
  it('is breaking when the app uses a removed symbol', async () => {
    const changelog = stubChangelog([
      {
        version: '2.0.0',
        body: '',
        breakingChanges: [
          {
            version: '2.0.0',
            summary: 'Removed createStore',
            kind: 'removed-api',
            symbols: ['createStore'],
          },
        ],
      },
    ]);
    const usage = usageMap({
      used: true,
      symbols: ['createStore'],
      sites: [{ file: 'src/a.ts', line: 1, imported: ['createStore'], kind: 'import' }],
    });
    const result = await analyzeBump({ pkg: 'pkg', from: '1.0.0', to: '2.0.0', changelog, usage });
    expect(result.verdict).toBe('breaking');
    expect(result.reasons[0]!.assessment).toBe('used-affected');
    expect(result.reasons[0]!.hits).toHaveLength(1);
  });

  it('is safe when the breaking change touches an unused symbol', async () => {
    const changelog = stubChangelog([
      {
        version: '2.0.0',
        body: '',
        breakingChanges: [
          {
            version: '2.0.0',
            summary: 'Removed legacy()',
            kind: 'removed-api',
            symbols: ['legacy'],
          },
        ],
      },
    ]);
    const usage = usageMap({
      used: true,
      symbols: ['modern'],
      sites: [{ file: 'src/a.ts', line: 1, imported: ['modern'], kind: 'import' }],
    });
    const result = await analyzeBump({ pkg: 'pkg', from: '1.0.0', to: '2.0.0', changelog, usage });
    expect(result.verdict).toBe('safe');
    expect(result.reasons[0]!.assessment).toBe('not-used');
  });

  it('is review when a prose-only breaking change touches used code', async () => {
    const changelog = stubChangelog([
      {
        version: '2.0.0',
        body: '',
        breakingChanges: [
          { version: '2.0.0', summary: 'Changed default behavior', kind: 'behavior' },
        ],
      },
    ]);
    const usage = usageMap({
      used: true,
      symbols: ['x'],
      sites: [{ file: 'a.ts', line: 1, imported: ['x'], kind: 'import' }],
    });
    const result = await analyzeBump({ pkg: 'pkg', from: '1.0.0', to: '2.0.0', changelog, usage });
    expect(result.verdict).toBe('review');
    expect(result.unknowns).toHaveLength(1);
  });

  it('is review when no changelog is found', async () => {
    const result = await analyzeBump({
      pkg: 'pkg',
      from: '1.0.0',
      to: '2.0.0',
      changelog: stubChangelog([]),
      usage: usageMap({ used: true, symbols: ['x'] }),
    });
    expect(result.verdict).toBe('review');
  });

  it('treats namespace imports as using everything', async () => {
    const changelog = stubChangelog([
      {
        version: '2.0.0',
        body: '',
        breakingChanges: [
          { version: '2.0.0', summary: 'Removed foo', kind: 'removed-api', symbols: ['foo'] },
        ],
      },
    ]);
    const usage = usageMap({
      used: true,
      symbols: ['*'],
      sites: [{ file: 'a.ts', line: 1, imported: ['*'], kind: 'import' }],
    });
    const result = await analyzeBump({ pkg: 'pkg', from: '1.0.0', to: '2.0.0', changelog, usage });
    expect(result.verdict).toBe('breaking');
  });
});

describe('changelog parsing', () => {
  it('extracts breaking bullets under a Breaking heading', () => {
    const body = [
      '## Breaking Changes',
      '- Removed `createStore`',
      '- Renamed `opts` to `options`',
      '',
      '## Features',
      '- Added `thing`',
    ].join('\n');
    const changes = extractBreakingChanges('2.0.0', body);
    expect(changes).toHaveLength(2);
    expect(changes[0]!.symbols).toContain('createStore');
    expect(changes[1]!.kind).toBe('renamed');
  });

  it('extracts inline BREAKING bullets', () => {
    const changes = extractBreakingChanges('2.0.0', '- **BREAKING:** dropped `node 16` support');
    expect(changes).toHaveLength(1);
  });

  it('extracts backticked symbols', () => {
    expect(extractSymbols('Removed `createStore` and `store.get()`')).toEqual([
      'createStore',
      'store',
    ]);
  });

  it('parses github repo urls', () => {
    expect(parseGithubRepo('git+https://github.com/colinhacks/zod.git')).toBe('colinhacks/zod');
  });
});
