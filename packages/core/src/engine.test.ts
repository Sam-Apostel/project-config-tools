import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { OperationRegistry } from './operations/registry.js';
import { addScriptOperation } from './operations/add-script.js';
import { InMemoryFileSystem } from './fs.js';

const ROOT = '/proj';

function pkg(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

async function makeEngine(initialPkg: string): Promise<{ engine: Engine; fs: InMemoryFileSystem }> {
  const fs = new InMemoryFileSystem({ '/proj/package.json': initialPkg });
  const registry = new OperationRegistry();
  registry.register(addScriptOperation);
  const engine = await Engine.create({ root: ROOT, fs, registry });
  return { engine, fs };
}

describe('Engine', () => {
  it('detects the project model', async () => {
    const { engine } = await makeEngine(
      pkg({
        name: 'demo',
        version: '1.0.0',
        scripts: { build: 'tsc' },
        dependencies: { zod: '^3' },
      }),
    );
    const project = engine.getProject();
    expect(project.name).toBe('demo');
    expect(project.scripts).toEqual([{ name: 'build', command: 'tsc' }]);
    expect(project.dependencies).toContainEqual({ name: 'zod', range: '^3', type: 'prod' });
  });

  it('plans without writing, then applies and refreshes', async () => {
    const initial = pkg({ name: 'demo', scripts: { build: 'tsc' } });
    const { engine, fs } = await makeEngine(initial);

    const change = await engine.plan('add-script', { name: 'test', command: 'vitest' });
    expect(change.risk).toBe('safe');
    expect(change.edits[0]!.after).toContain('"test": "vitest"');
    // plan must not have written anything
    expect(await fs.readFile('/proj/package.json')).toBe(initial);

    const result = await engine.apply(change.id);
    expect(result.ok).toBe(true);
    const written = await fs.readFile('/proj/package.json');
    expect(JSON.parse(written).scripts.test).toBe('vitest');
    expect(JSON.parse(written).scripts.build).toBe('tsc');
    expect(engine.getProject().scripts.find((s) => s.name === 'test')?.command).toBe('vitest');
  });

  it('undo restores the file byte-for-byte', async () => {
    const initial = pkg({ name: 'demo', scripts: { build: 'tsc' } });
    const { engine, fs } = await makeEngine(initial);
    const change = await engine.plan('add-script', { name: 'test', command: 'vitest' });
    await engine.apply(change.id);

    const entry = engine.listJournal()[0]!;
    const undo = await engine.undo(entry.id);
    expect(undo.ok).toBe(true);
    expect(await fs.readFile('/proj/package.json')).toBe(initial);
  });

  it('flags an overwrite as review risk with a warning note', async () => {
    const { engine } = await makeEngine(pkg({ scripts: { test: 'old-runner' } }));
    const change = await engine.plan('add-script', { name: 'test', command: 'vitest' });
    expect(change.risk).toBe('review');
    expect(change.notes.some((n) => n.level === 'warn')).toBe(true);
  });

  it('rejects an unknown operation', async () => {
    const { engine } = await makeEngine(pkg({}));
    await expect(engine.plan('does-not-exist', {})).rejects.toThrow(/Unknown operation/);
  });

  it('rejects invalid input', async () => {
    const { engine } = await makeEngine(pkg({}));
    await expect(engine.plan('add-script', { name: '', command: 'x' })).rejects.toThrow();
  });

  it('does not apply the same change twice', async () => {
    const { engine } = await makeEngine(pkg({}));
    const change = await engine.plan('add-script', { name: 'a', command: 'b' });
    await engine.apply(change.id);
    const second = await engine.apply(change.id);
    expect(second.ok).toBe(false);
  });
});
