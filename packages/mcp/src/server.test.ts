import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Engine } from '@apostel/visual-config-core';
import { InMemoryFileSystem, createDefaultRegistry } from '@apostel/visual-config-core';
import { createMcpServer } from './server.js';
import { APP_MIME, APP_RESOURCE_URI } from './app-html.js';

async function connect(): Promise<Client> {
  const fs = new InMemoryFileSystem({
    '/proj/package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2) + '\n',
  });
  const engine = await Engine.create({ root: '/proj', fs, registry: createDefaultRegistry() });
  const server = createMcpServer(engine);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
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
