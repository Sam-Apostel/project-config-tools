import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createBirpc, type BirpcReturn } from 'birpc';
import {
  Engine,
  InMemoryFileSystem,
  OperationRegistry,
  addScriptOperation,
  type CommandRunner,
  type RunResult,
} from '@apostel/visual-config-core';
import type { ClientFunctions, ServerFunctions } from '@apostel/visual-config-protocol';
import { startDaemon, type Daemon } from './server.js';

class NoopRunner implements CommandRunner {
  run(): Promise<RunResult> {
    return Promise.resolve({ code: 0, output: '' });
  }
}

let daemon: Daemon | undefined;
let ws: WebSocket | undefined;

afterEach(async () => {
  ws?.close();
  await daemon?.close();
  daemon = undefined;
  ws = undefined;
});

async function connectClient(d: Daemon): Promise<BirpcReturn<ServerFunctions, ClientFunctions>> {
  const socket = new WebSocket(`ws://127.0.0.1:${d.port}/__rpc?token=${d.token}`);
  ws = socket;
  await new Promise<void>((resolve, reject) => {
    socket.on('open', () => resolve());
    socket.on('error', reject);
  });
  return createBirpc<ServerFunctions, ClientFunctions>(
    {
      onProjectChanged: () => undefined,
      onTaskOutput: () => undefined,
      onTaskExit: () => undefined,
    },
    {
      post: (data) => socket.send(data),
      on: (fn) => socket.on('message', (raw: Buffer) => fn(raw.toString())),
      serialize: (v) => JSON.stringify(v),
      deserialize: (v) => JSON.parse(v as string),
    },
  );
}

async function makeDaemon(pkg: object): Promise<Daemon> {
  const fs = new InMemoryFileSystem({ '/proj/package.json': JSON.stringify(pkg, null, 2) + '\n' });
  const registry = new OperationRegistry();
  registry.register(addScriptOperation);
  const engine = await Engine.create({ root: '/proj', fs, registry, runner: new NoopRunner() });
  return startDaemon({ engine });
}

describe('daemon over birpc/ws', () => {
  it('rejects a WebSocket connection without the token', async () => {
    daemon = await makeDaemon({ name: 'demo' });
    const bad = new WebSocket(`ws://127.0.0.1:${daemon.port}/__rpc?token=wrong`);
    bad.on('error', () => undefined); // a rejected upgrade surfaces as ECONNRESET
    const rejected = await new Promise<boolean>((resolve) => {
      bad.on('open', () => resolve(false));
      bad.on('close', () => resolve(true));
      bad.on('error', () => resolve(true));
    });
    bad.terminate();
    expect(rejected).toBe(true);
  });

  it('serves the project model and runs the plan → apply cycle', async () => {
    daemon = await makeDaemon({ name: 'demo', scripts: { build: 'tsc' } });
    const rpc = await connectClient(daemon);

    const project = await rpc.getProject();
    expect(project.name).toBe('demo');

    const plan = await rpc.planOperation('add-script', { name: 'test', command: 'vitest' });
    expect(plan.ok).toBe(true);
    expect(plan.change?.edits[0]?.after).toContain('"test": "vitest"');

    const applied = await rpc.applyChange(plan.change!.id);
    expect(applied.ok).toBe(true);

    const after = await rpc.getProject();
    expect(after.scripts.find((s) => s.name === 'test')?.command).toBe('vitest');

    const journal = await rpc.listJournal();
    const undo = await rpc.undo(journal[0]!.id);
    expect(undo.ok).toBe(true);
  });

  it('returns a structured error for a bad plan instead of rejecting', async () => {
    daemon = await makeDaemon({ name: 'demo' });
    const rpc = await connectClient(daemon);
    const plan = await rpc.planOperation('add-script', { name: '', command: 'x' });
    expect(plan.ok).toBe(false);
    expect(plan.error).toBeTruthy();
  });
});
