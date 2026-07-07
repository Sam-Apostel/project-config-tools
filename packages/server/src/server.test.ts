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

function makeRegistry(): OperationRegistry {
  const registry = new OperationRegistry();
  registry.register(addScriptOperation);
  return registry;
}

async function makeDaemon(pkg: object): Promise<Daemon> {
  const fs = new InMemoryFileSystem({ '/proj/package.json': JSON.stringify(pkg, null, 2) + '\n' });
  const engine = await Engine.create({
    root: '/proj',
    fs,
    registry: makeRegistry(),
    runner: new NoopRunner(),
  });
  return startDaemon({ engine });
}

async function makeWorkspaceDaemon(files: Record<string, object>): Promise<Daemon> {
  const fs = new InMemoryFileSystem(
    Object.fromEntries(
      Object.entries(files).map(([path, obj]) => [path, JSON.stringify(obj, null, 2) + '\n']),
    ),
  );
  const openAt = (root: string): Promise<Engine> =>
    Engine.create({ root, fs, registry: makeRegistry(), runner: new NoopRunner() });
  const engine = await openAt('/proj');
  return startDaemon({ engine, openAt });
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

  it('lists workspace members and switches the active package', async () => {
    daemon = await makeWorkspaceDaemon({
      '/proj/package.json': { name: 'root', private: true, workspaces: ['packages/*'] },
      '/proj/packages/core/package.json': { name: '@acme/core', scripts: { build: 'tsc' } },
      '/proj/packages/ui/package.json': { name: '@acme/ui' },
    });
    const rpc = await connectClient(daemon);

    const ws = await rpc.getWorkspace();
    expect(ws.rootName).toBe('root');
    expect(ws.active).toBe('');
    expect(ws.packages.map((p) => p.dir)).toEqual(['packages/core', 'packages/ui']);

    // Switching makes getProject reflect the member, and edits target the member.
    const active = await rpc.setActivePackage('packages/core');
    expect(active.name).toBe('@acme/core');
    expect((await rpc.getWorkspace()).active).toBe('packages/core');

    const plan = await rpc.planOperation('add-script', { name: 'test', command: 'vitest' });
    const applied = await rpc.applyChange(plan.change!.id);
    expect(applied.ok).toBe(true);

    // Back at the root, the member's edit is not visible on the root package.
    const root = await rpc.setActivePackage('');
    expect(root.name).toBe('root');
    expect(root.scripts.find((s) => s.name === 'test')).toBeUndefined();
  });

  it('rejects switching to an unknown workspace package', async () => {
    daemon = await makeWorkspaceDaemon({
      '/proj/package.json': { name: 'root', workspaces: ['packages/*'] },
      '/proj/packages/core/package.json': { name: '@acme/core' },
    });
    const rpc = await connectClient(daemon);
    // The message is lost over birpc (Error.message is non-enumerable), but the
    // call must reject rather than silently switching to a non-existent member.
    await expect(rpc.setActivePackage('packages/nope')).rejects.toBeTruthy();
    expect((await rpc.getWorkspace()).active).toBe('');
  });
});
