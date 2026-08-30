import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Engine } from '@apostel/visual-config-core';
import {
  InMemoryFileSystem,
  createDefaultRegistry,
  type CommandRunner,
  type FleetOpener,
  type RunResult,
} from '@apostel/visual-config-core';
import { createMcpServer, type McpServerDeps } from './server.js';
import { APP_MIME, APP_RESOURCE_URI } from './app-html.js';

class NoopRunner implements CommandRunner {
  run(): Promise<RunResult> {
    return Promise.resolve({ code: 0, output: '' });
  }
}

async function connect(deps?: McpServerDeps): Promise<Client> {
  const fs = new InMemoryFileSystem({
    '/proj/package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2) + '\n',
  });
  const engine = await Engine.create({ root: '/proj', fs, registry: createDefaultRegistry() });
  const server = createMcpServer(engine, deps);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

/** A fleet-enabled client whose fan-out scans an injected in-memory fs of repos. */
async function connectFleet(
  files: Record<string, object>,
): Promise<{ client: Client; fs: InMemoryFileSystem }> {
  const fs = new InMemoryFileSystem(
    Object.fromEntries(
      Object.entries(files).map(([p, o]) => [p, JSON.stringify(o, null, 2) + '\n']),
    ),
  );
  const open: FleetOpener = (root) =>
    Engine.create({ root, fs, registry: createDefaultRegistry(), runner: new NoopRunner() });
  const client = await connect({ fleet: { fs, open } });
  return { client, fs };
}

function textOf(result: unknown): string {
  return String((result as { content: { text?: string }[] }).content[0]?.text ?? '');
}

describe('MCP Apps (SEP-1865) wiring', () => {
  it('exposes open_config_ui with a ui:// resourceUri in _meta', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const openUi = tools.find((t) => t.name === 'open_config_ui');
    expect(openUi).toBeDefined();
    // The host reads this to know which UI template to render.
    expect((openUi as { _meta?: { ui?: { resourceUri?: string } } })._meta?.ui?.resourceUri).toBe(
      APP_RESOURCE_URI,
    );
    // The read-only diagnostics tool the app calls also exists.
    expect(tools.some((t) => t.name === 'get_diagnostics')).toBe(true);
    await client.close();
  });

  it('lists and reads the app resource as HTML with the mcp-app profile', async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    const app = resources.find((r) => r.uri === APP_RESOURCE_URI);
    expect(app?.mimeType).toBe(APP_MIME);

    const read = await client.readResource({ uri: APP_RESOURCE_URI });
    const content = read.contents[0] as { mimeType?: string; text?: string };
    expect(content.mimeType).toBe(APP_MIME);
    const html = String(content.text ?? '');
    expect(html).toContain('<!doctype html>');
    // The bridge handshake must be present (ui/initialize -> tools/call).
    expect(html).toContain('ui/initialize');
    expect(html).toContain('tools/call');
    await client.close();
  });
});

describe('MCP cross-repo fan-out tools', () => {
  const REPOS = {
    '/proj/package.json': { name: 'host' },
    '/work/app-a/package.json': { name: 'app-a', dependencies: { '@acme/ui-lib': '^1.0.0' } },
    '/work/app-b/package.json': { name: 'app-b', dependencies: { zod: '^3.0.0' } },
  };

  it('exposes the fleet tools', async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['fleet_discover', 'fleet_plan', 'fleet_apply', 'fleet_pin']),
    );
    await client.close();
  });

  it('discovers, plans across (skipping repos without the dep), and applies only the planned', async () => {
    const { client, fs } = await connectFleet(REPOS);

    const disc = JSON.parse(
      textOf(await client.callTool({ name: 'fleet_discover', arguments: { parent: '/work' } })),
    );
    expect(disc.projects.map((p: { name: string }) => p.name).sort()).toEqual(['app-a', 'app-b']);

    const plan = JSON.parse(
      textOf(
        await client.callTool({
          name: 'fleet_plan',
          arguments: {
            parent: '/work',
            operationId: 'upgrade-dependencies',
            input: { upgrades: [{ name: '@acme/ui-lib', range: '^2.0.0' }] },
          },
        }),
      ),
    );
    expect(plan.planned).toBe(1);
    expect(plan.skipped).toBe(1);

    const result = JSON.parse(
      textOf(await client.callTool({ name: 'fleet_apply', arguments: {} })),
    );
    expect(result.applied).toBe(1);
    expect(
      JSON.parse(await fs.readFile('/work/app-a/package.json')).dependencies['@acme/ui-lib'],
    ).toBe('^2.0.0');
    expect(JSON.parse(await fs.readFile('/work/app-b/package.json')).dependencies.zod).toBe(
      '^3.0.0',
    );
    await client.close();
  });

  it('fleet_apply without a prior plan reports an error', async () => {
    const { client } = await connectFleet(REPOS);
    const res = await client.callTool({ name: 'fleet_apply', arguments: {} });
    expect((res as { isError?: boolean }).isError).toBe(true);
    await client.close();
  });
});
