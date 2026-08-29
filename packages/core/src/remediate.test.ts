import { describe, it, expect } from 'vitest';
import { computeRemediation, pickSafeVersion } from './remediate.js';
import type { ProjectModel } from './types.js';
import type { Advisory, Registry, RegistrySearchHit } from './registry/npm.js';

describe('pickSafeVersion', () => {
  it('picks the lowest stable version above current that escapes every vulnerable range', () => {
    const versions = ['4.17.15', '4.17.20', '4.17.21', '4.18.0', '5.0.0-beta.1'];
    expect(pickSafeVersion('4.17.15', versions, ['<4.17.21'])).toBe('4.17.21');
  });

  it('honors multiple vulnerable ranges and skips prereleases', () => {
    const versions = ['1.0.0', '1.2.0', '2.0.0-rc.1', '2.0.0'];
    expect(pickSafeVersion('1.0.0', versions, ['<1.2.0', '>=1.2.0 <2.0.0'])).toBe('2.0.0');
  });

  it('returns undefined when nothing above current is safe', () => {
    expect(pickSafeVersion('1.0.0', ['1.0.0', '1.1.0'], ['*'])).toBeUndefined();
  });
});

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

class VulnRegistry implements Registry {
  constructor(
    private readonly adv: Record<string, Advisory[]>,
    private readonly vers: Record<string, string[]>,
  ) {}
  search(): Promise<RegistrySearchHit[]> {
    return Promise.resolve([]);
  }
  latestVersion(): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }
  advisories(query: Record<string, string[]>): Promise<Record<string, Advisory[]>> {
    const out: Record<string, Advisory[]> = {};
    for (const name of Object.keys(query)) if (this.adv[name]) out[name] = this.adv[name];
    return Promise.resolve(out);
  }
  versions(name: string): Promise<string[]> {
    return Promise.resolve(this.vers[name] ?? []);
  }
}

describe('computeRemediation', () => {
  it('produces a minimal safe fix per vulnerable dep and flags majors', async () => {
    const p = project([
      { name: 'lodash', range: '^4.17.15', type: 'prod', resolved: '4.17.15' },
      { name: 'minimist', range: '^0.2.0', type: 'prod', resolved: '0.2.0' },
    ]);
    const registry = new VulnRegistry(
      {
        lodash: [
          { title: 'Prototype Pollution', severity: 'high', vulnerable_versions: '<4.17.21' },
        ],
        minimist: [{ title: 'Proto', severity: 'critical', vulnerable_versions: '<1.2.6' }],
      },
      {
        lodash: ['4.17.15', '4.17.21'],
        minimist: ['0.2.0', '1.2.6'],
      },
    );

    const { fixes, unfixable } = await computeRemediation(p, registry);
    expect(unfixable).toEqual([]);
    expect(fixes).toEqual([
      {
        name: 'lodash',
        from: '4.17.15',
        to: '4.17.21',
        major: false,
        advisories: [expect.any(Object)],
      },
      {
        name: 'minimist',
        from: '0.2.0',
        to: '1.2.6',
        major: true,
        advisories: [expect.any(Object)],
      },
    ]);
  });

  it('reports a vulnerable package with no safe version as unfixable', async () => {
    const p = project([{ name: 'doomed', range: '^1.0.0', type: 'prod', resolved: '1.0.0' }]);
    const registry = new VulnRegistry(
      { doomed: [{ title: 'x', severity: 'high', vulnerable_versions: '*' }] },
      { doomed: ['1.0.0', '1.1.0'] },
    );
    const { fixes, unfixable } = await computeRemediation(p, registry);
    expect(fixes).toEqual([]);
    expect(unfixable.map((u) => u.name)).toEqual(['doomed']);
  });
});
