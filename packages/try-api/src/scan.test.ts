import { describe, it, expect } from 'vitest';
import {
  InMemoryFileSystem,
  openProject,
  type Registry,
  type RegistrySearchHit,
} from '@apostel/visual-config-core';
import { parseRepo, diffStat, scanProject } from './scan.js';

describe('parseRepo', () => {
  it('accepts owner/repo, github.com/…, and full https URLs', () => {
    expect(parseRepo('sindresorhus/got')).toEqual({
      owner: 'sindresorhus',
      repo: 'got',
      url: 'https://github.com/sindresorhus/got.git',
    });
    expect(parseRepo('github.com/vercel/next.js').owner).toBe('vercel');
    expect(parseRepo('https://github.com/acme/store.git').url).toBe(
      'https://github.com/acme/store.git',
    );
  });

  it('rejects input without an owner/repo pair', () => {
    expect(() => parseRepo('not-a-repo')).toThrow(/owner\/repo/);
    expect(() => parseRepo('')).toThrow();
    expect(() => parseRepo('/')).toThrow();
  });

  it('always rebuilds a canonical github.com URL, so a caller cannot reach another host', () => {
    // A traversal-shaped string can only ever resolve to a github.com path, never a
    // local file or internal host — the cloner receives this URL verbatim.
    expect(parseRepo('../../etc/passwd').url).toBe('https://github.com/etc/passwd.git');
    expect(parseRepo('http://169.254.169.254/latest').url).toBe(
      'https://github.com/169.254.169.254/latest.git',
    );
  });
});

describe('diffStat', () => {
  it('counts +/- lines but not the +++/--- headers', () => {
    const patch = ['--- a/package.json', '+++ b/package.json', '-  "x": "1",', '+  "x": "2",'].join(
      '\n',
    );
    expect(diffStat(patch)).toEqual({ additions: 1, deletions: 1 });
  });
});

class StubRegistry implements Registry {
  constructor(
    private readonly latest: Record<string, string>,
    private readonly deprecations: Record<string, string> = {},
  ) {}
  search(): Promise<RegistrySearchHit[]> {
    return Promise.resolve([]);
  }
  latestVersion(name: string): Promise<string | undefined> {
    return Promise.resolve(this.latest[name]);
  }
  deprecation(name: string): Promise<string | undefined> {
    return Promise.resolve(this.deprecations[name]);
  }
}

describe('scanProject', () => {
  it('reports findings and builds an upgrade diff, without touching the network', async () => {
    const fs = new InMemoryFileSystem({
      '/proj/package.json':
        JSON.stringify(
          {
            name: 'storefront',
            dependencies: { zod: '^3.22.0', request: '^2.88.2' },
          },
          null,
          2,
        ) + '\n',
    });
    const npm = new StubRegistry(
      { zod: '3.23.8', request: '2.88.2' },
      { request: 'request has been deprecated, use `got` instead' },
    );
    const engine = await openProject('/proj', { fs, npm, plugins: [], journalPath: null });

    const result = await scanProject(engine, 'acme/storefront');

    expect(result.repo).toBe('acme/storefront');
    expect(result.name).toBe('storefront');
    expect(result.counts.outdated).toBe(1);
    expect(result.counts.deprecated).toBe(1);

    const dep = result.findings.find((f) => f.kind === 'deprecation');
    expect(dep?.target).toBe('request');
    expect(dep?.alternative).toBe('got');

    expect(result.upgrade.available).toBe(true);
    expect(result.upgrade.patch).toContain('zod');
    expect(result.upgrade.patch).toContain('3.23.8');
    expect(result.upgrade.stat.files).toBe(1);
    expect(result.upgrade.stat.additions).toBeGreaterThan(0);
  });

  it('marks upgrade unavailable when everything is current', async () => {
    const fs = new InMemoryFileSystem({
      '/proj/package.json':
        JSON.stringify({ name: 'fresh', dependencies: { zod: '^3.23.8' } }, null, 2) + '\n',
    });
    const npm = new StubRegistry({ zod: '3.23.8' });
    const engine = await openProject('/proj', { fs, npm, plugins: [], journalPath: null });

    const result = await scanProject(engine, 'acme/fresh');
    expect(result.counts.outdated).toBe(0);
    expect(result.upgrade.available).toBe(false);
    expect(result.upgrade.patch).toBe('');
  });
});
