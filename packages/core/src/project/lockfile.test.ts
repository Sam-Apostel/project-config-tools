import { describe, it, expect } from 'vitest';
import { readInstalledVersions } from './lockfile.js';
import { InMemoryFileSystem } from '../fs.js';

describe('readInstalledVersions', () => {
  it('parses pnpm-lock.yaml v9 (importers root), stripping peer suffixes', async () => {
    const fs = new InMemoryFileSystem({
      '/p/pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      zod:',
        '        specifier: ^3.22.0',
        '        version: 3.23.8',
        '    devDependencies:',
        '      vitest:',
        '        specifier: ^2.1.8',
        '        version: 2.1.9(@types/node@22.20.0)',
        '      local:',
        '        specifier: workspace:*',
        '        version: link:../local',
        '',
      ].join('\n'),
    });
    const v = await readInstalledVersions(fs, '/p');
    expect(v).toEqual({ zod: '3.23.8', vitest: '2.1.9' }); // link: entry dropped
  });

  it('parses package-lock.json v3 (packages map), ignoring nested installs', async () => {
    const fs = new InMemoryFileSystem({
      '/p/package-lock.json': JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { name: 'root' },
          'node_modules/lodash': { version: '4.17.21' },
          'node_modules/semver': { version: '7.6.3' },
          'node_modules/a/node_modules/nested': { version: '1.0.0' },
        },
      }),
    });
    const v = await readInstalledVersions(fs, '/p');
    expect(v).toEqual({ lodash: '4.17.21', semver: '7.6.3' });
  });

  it('parses package-lock.json v1 (flat dependencies map)', async () => {
    const fs = new InMemoryFileSystem({
      '/p/package-lock.json': JSON.stringify({
        lockfileVersion: 1,
        dependencies: { lodash: { version: '4.17.20' }, chalk: { version: '5.3.0' } },
      }),
    });
    expect(await readInstalledVersions(fs, '/p')).toEqual({ lodash: '4.17.20', chalk: '5.3.0' });
  });

  it('parses classic yarn.lock (v1), including grouped and scoped descriptors', async () => {
    const fs = new InMemoryFileSystem({
      '/p/yarn.lock': [
        '# yarn lockfile v1',
        '',
        '"@babel/core@^7.0.0", "@babel/core@^7.20.0":',
        '  version "7.24.0"',
        '  resolved "https://…"',
        '',
        'lodash@^4.17.0:',
        '  version "4.17.21"',
        '',
      ].join('\n'),
    });
    expect(await readInstalledVersions(fs, '/p')).toEqual({
      '@babel/core': '7.24.0',
      lodash: '4.17.21',
    });
  });

  it('parses yarn berry (v2+) yaml lockfiles', async () => {
    const fs = new InMemoryFileSystem({
      '/p/yarn.lock': [
        '__metadata:',
        '  version: 8',
        '',
        '"lodash@npm:^4.17.0, lodash@npm:^4":',
        '  version: 4.17.21',
        '  resolution: "lodash@npm:4.17.21"',
        '',
      ].join('\n'),
    });
    expect(await readInstalledVersions(fs, '/p')).toEqual({ lodash: '4.17.21' });
  });

  it('returns {} when no lockfile is present', async () => {
    const fs = new InMemoryFileSystem({ '/p/package.json': '{}' });
    expect(await readInstalledVersions(fs, '/p')).toEqual({});
  });

  it('prefers pnpm over npm over yarn when several exist', async () => {
    const fs = new InMemoryFileSystem({
      '/p/pnpm-lock.yaml': [
        'importers:',
        '  .:',
        '    dependencies:',
        '      a:',
        '        specifier: ^1',
        '        version: 1.2.3',
      ].join('\n'),
      '/p/package-lock.json': JSON.stringify({
        packages: { 'node_modules/a': { version: '9.9.9' } },
      }),
    });
    expect(await readInstalledVersions(fs, '/p')).toEqual({ a: '1.2.3' });
  });
});
