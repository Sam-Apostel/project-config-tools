import { describe, it, expect } from 'vitest';
import { Engine } from '../engine.js';
import { InMemoryFileSystem } from '../fs.js';
import { createDefaultRegistry } from '../index.js';
import type { CommandRunner, RunResult } from '../runner.js';

const ROOT = '/proj';

class StubRunner implements CommandRunner {
  calls: string[][] = [];
  run(argv: string[]): Promise<RunResult> {
    this.calls.push(argv);
    return Promise.resolve({ code: 0, output: '' });
  }
}

async function makeEngine(
  files: Record<string, string>,
): Promise<{ engine: Engine; fs: InMemoryFileSystem; runner: StubRunner }> {
  const withRoot = Object.fromEntries(Object.entries(files).map(([k, v]) => [`${ROOT}/${k}`, v]));
  const fs = new InMemoryFileSystem(withRoot);
  const runner = new StubRunner();
  const engine = await Engine.create({ root: ROOT, fs, registry: createDefaultRegistry(), runner });
  return { engine, fs, runner };
}

function pkg(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

describe('install-package', () => {
  it('adds a dependency and installs', async () => {
    const { engine, fs, runner } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    const change = await engine.plan('install-package', { name: 'zod', range: '^3.23.8' });
    expect(change.commands[0]!.argv).toEqual(['npm', 'install']);
    await engine.apply(change.id);
    expect(JSON.parse(await fs.readFile('/proj/package.json')).dependencies.zod).toBe('^3.23.8');
    expect(runner.calls).toEqual([['npm', 'install']]);
  });

  it('adds a devDependency when dev is true', async () => {
    const { engine, fs } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    const change = await engine.plan('install-package', { name: 'vitest', range: '^2', dev: true });
    await engine.apply(change.id);
    expect(JSON.parse(await fs.readFile('/proj/package.json')).devDependencies.vitest).toBe('^2');
  });

  it('notes when the package already exists', async () => {
    const { engine } = await makeEngine({
      'package.json': pkg({ dependencies: { zod: '^3.0.0' } }),
    });
    const change = await engine.plan('install-package', { name: 'zod', range: '^3.23.8' });
    expect(change.notes.some((n) => n.message.includes('already in'))).toBe(true);
  });
});

describe('remove-dependency', () => {
  it('removes an existing dependency', async () => {
    const { engine, fs } = await makeEngine({
      'package.json': pkg({ dependencies: { zod: '^3', lodash: '^4' } }),
    });
    const change = await engine.plan('remove-dependency', { name: 'zod' });
    await engine.apply(change.id);
    const parsed = JSON.parse(await fs.readFile('/proj/package.json'));
    expect(parsed.dependencies.zod).toBeUndefined();
    expect(parsed.dependencies.lodash).toBe('^4');
  });

  it('throws for a dependency that is not present', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}) });
    await expect(engine.plan('remove-dependency', { name: 'ghost' })).rejects.toThrow();
  });
});

describe('remove-script', () => {
  it('removes an existing script', async () => {
    const { engine, fs } = await makeEngine({
      'package.json': pkg({ scripts: { build: 'tsc', test: 'vitest' } }),
    });
    const change = await engine.plan('remove-script', { name: 'test' });
    expect(change.risk).toBe('safe');
    await engine.apply(change.id);
    const parsed = JSON.parse(await fs.readFile('/proj/package.json'));
    expect(parsed.scripts.test).toBeUndefined();
    expect(parsed.scripts.build).toBe('tsc');
  });

  it('throws when the script is missing', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}) });
    await expect(engine.plan('remove-script', { name: 'nope' })).rejects.toThrow();
  });
});

describe('upgrade-dependencies', () => {
  it('bumps several ranges in one edit and installs once', async () => {
    const { engine, fs, runner } = await makeEngine({
      'package.json': pkg({
        dependencies: { zod: '^3.20.0' },
        devDependencies: { vitest: '^2.0.0' },
      }),
    });
    const change = await engine.plan('upgrade-dependencies', {
      upgrades: [
        { name: 'zod', range: '^3.24.0' },
        { name: 'vitest', range: '^2.1.8' },
      ],
    });
    expect(change.edits).toHaveLength(1);
    await engine.apply(change.id);
    const parsed = JSON.parse(await fs.readFile('/proj/package.json'));
    expect(parsed.dependencies.zod).toBe('^3.24.0');
    expect(parsed.devDependencies.vitest).toBe('^2.1.8');
    expect(runner.calls).toEqual([['npm', 'install']]);
  });

  it('notes packages it could not find, upgrades the rest', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({ dependencies: { zod: '^3' } }) });
    const change = await engine.plan('upgrade-dependencies', {
      upgrades: [
        { name: 'zod', range: '^3.24.0' },
        { name: 'ghost', range: '^1' },
      ],
    });
    expect(change.notes.some((n) => n.message.includes('ghost'))).toBe(true);
  });

  it('throws when none are found', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}) });
    await expect(
      engine.plan('upgrade-dependencies', { upgrades: [{ name: 'ghost', range: '^1' }] }),
    ).rejects.toThrow();
  });
});

describe('set-package-field', () => {
  it('sets an allowed metadata field', async () => {
    const { engine, fs } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    const change = await engine.plan('set-package-field', {
      field: 'description',
      value: 'a demo',
    });
    expect(change.risk).toBe('safe');
    await engine.apply(change.id);
    expect(JSON.parse(await fs.readFile('/proj/package.json')).description).toBe('a demo');
  });

  it('rejects a non-allowed field (e.g. dependencies)', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    await expect(
      engine.plan('set-package-field', { field: 'dependencies', value: {} }),
    ).rejects.toThrow(/not an allowed/);
  });
});

describe('set-tsconfig-option', () => {
  it('sets a compilerOptions value preserving comments', async () => {
    const tsconfig =
      '{\n  // keep this comment\n  "compilerOptions": {\n    "target": "ES2022"\n  }\n}\n';
    const { engine, fs } = await makeEngine({ 'package.json': pkg({}), 'tsconfig.json': tsconfig });
    const change = await engine.plan('set-tsconfig-option', { key: 'strict', value: true });
    await engine.apply(change.id);
    const written = await fs.readFile('/proj/tsconfig.json');
    expect(written).toContain('// keep this comment');
    expect(written).toContain('"strict": true');
    expect(written).toContain('"target": "ES2022"');
  });

  it('throws when there is no tsconfig.json', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}) });
    await expect(
      engine.plan('set-tsconfig-option', { key: 'strict', value: true }),
    ).rejects.toThrow(/No tsconfig/);
  });
});
