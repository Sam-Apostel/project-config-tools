import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { InMemoryFileSystem } from './fs.js';
import { createDefaultRegistry } from './index.js';
import type { CommandRunner, RunResult } from './runner.js';

const ROOT = '/proj';
const JOURNAL = '/cache/proj.journal.json';

class NoopRunner implements CommandRunner {
  run(): Promise<RunResult> {
    return Promise.resolve({ code: 0, output: '' });
  }
}

function makeEngine(fs: InMemoryFileSystem): Promise<Engine> {
  return Engine.create({
    root: ROOT,
    fs,
    registry: createDefaultRegistry(),
    runner: new NoopRunner(),
    journalPath: JOURNAL,
  });
}

describe('journal persistence', () => {
  it('survives a restart and can undo across it', async () => {
    const fs = new InMemoryFileSystem({
      '/proj/package.json': JSON.stringify({ name: 'demo' }, null, 2) + '\n',
    });

    // Session 1: apply a change.
    const engine1 = await makeEngine(fs);
    const change = await engine1.plan('add-script', { name: 'test', command: 'vitest' });
    await engine1.apply(change.id);
    expect(JSON.parse(await fs.readFile('/proj/package.json')).scripts.test).toBe('vitest');
    // journal was written outside the project
    expect(await fs.exists(JOURNAL)).toBe(true);

    // Session 2: a fresh engine on the same fs loads the journal and can undo.
    const engine2 = await makeEngine(fs);
    const entries = engine2.listJournal();
    expect(entries).toHaveLength(1);
    const undo = await engine2.undo(entries[0]!.id);
    expect(undo.ok).toBe(true);
    expect(JSON.parse(await fs.readFile('/proj/package.json')).scripts?.test).toBeUndefined();
  });

  it('does not persist when no journalPath is given', async () => {
    const fs = new InMemoryFileSystem({
      '/proj/package.json': JSON.stringify({ name: 'demo' }, null, 2) + '\n',
    });
    const engine = await Engine.create({
      root: ROOT,
      fs,
      registry: createDefaultRegistry(),
      runner: new NoopRunner(),
    });
    const change = await engine.plan('add-script', { name: 'a', command: 'b' });
    await engine.apply(change.id);
    expect(await fs.exists(JOURNAL)).toBe(false);
  });
});
