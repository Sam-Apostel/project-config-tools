import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type Resource,
  type ServerCapabilities,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { Engine } from '@apostel/visual-config-core';
import { APP_HTML, APP_MIME, APP_RESOURCE_URI } from './app-html.js';

function toolName(operationId: string): string {
  return `plan_${operationId.replace(/-/g, '_')}`;
}

/**
 * Build an MCP server that projects the engine's operations as tools. Each
 * operation becomes a `plan_*` tool whose inputSchema IS the operation's schema;
 * calling it returns a previewable Change. `apply_change` is the gated writer,
 * mirroring the human Diff Sheet's plan → confirm split (spec 05).
 */
export function createMcpServer(engine: Engine): Server {
  // Advertise the MCP Apps extension (SEP-1865) alongside tools/resources so
  // hosts that support interactive UIs know we ship an `text/html;profile=mcp-app`.
  const capabilities = {
    tools: {},
    resources: {},
    extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [APP_MIME] } },
  } as unknown as ServerCapabilities;

  const server = new Server({ name: 'visual-config', version: '0.0.0' }, { capabilities });

  const planTools = engine.listOperations().map((op) => ({
    name: toolName(op.id),
    operationId: op.id,
    tool: {
      name: toolName(op.id),
      description: `Plan: ${op.summary}. Returns a previewable Change (call apply_change to apply). Risk: ${op.risk}.`,
      inputSchema: op.inputSchema as Tool['inputSchema'],
    } satisfies Tool,
  }));

  const toolToOperation = new Map(planTools.map((t) => [t.name, t.operationId]));

  const staticTools: Tool[] = [
    {
      name: 'get_project',
      description: 'Get the current project model (dependencies, scripts, config files).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'list_operations',
      description: 'List the available config operations.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'apply_change',
      description: 'Apply a previously-planned Change by id. This writes files.',
      inputSchema: {
        type: 'object',
        required: ['changeId'],
        properties: { changeId: { type: 'string' } },
      },
    },
    {
      name: 'undo',
      description: 'Undo a journalled change by its entry id.',
      inputSchema: {
        type: 'object',
        required: ['entryId'],
        properties: { entryId: { type: 'string' } },
      },
    },
    {
      name: 'list_journal',
      description: 'List applied changes (the undo history).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'get_diagnostics',
      description:
        'Fact-based diagnostics for the project (currently: outdated dependencies with current→latest).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      // MCP Apps (SEP-1865): calling this asks the host to render the interactive
      // visual-config panel, so the user can browse and apply changes themselves.
      name: 'open_config_ui',
      description:
        'Open the visual-config UI in this session so the user can browse dependencies and apply config changes themselves (each change is previewed as a diff and confirmed). Prefer this over hand-rendering a table when the user wants to drive.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      _meta: { ui: { resourceUri: APP_RESOURCE_URI, visibility: ['model', 'app'] } },
    } as Tool,
    {
      name: 'analyze_bump',
      description:
        'Is upgrading a dependency safe for THIS codebase? Reads the changelog and cross-references breaking changes against how the app actually uses the package. Read-only.',
      inputSchema: {
        type: 'object',
        required: ['package'],
        properties: {
          package: { type: 'string', description: 'Dependency name.' },
          to: { type: 'string', description: 'Target version (default: latest).' },
        },
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [...staticTools, ...planTools.map((t) => t.tool)],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      const text = await dispatch(name, args);
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });

  // Read-only project context, so agents can read instead of scraping files.
  const resources: Resource[] = [
    {
      uri: 'project://model',
      name: 'Project model',
      description: 'Parsed dependencies, scripts, config files, detected tools.',
      mimeType: 'application/json',
    },
    {
      uri: 'diagnostics://outdated',
      name: 'Diagnostics',
      description: 'Fact-based diagnostics (outdated dependencies).',
      mimeType: 'application/json',
    },
    {
      uri: 'tsconfig://options',
      name: 'tsconfig compilerOptions',
      description: 'The compilerOptions tsconfig.json literally sets.',
      mimeType: 'application/json',
    },
    {
      uri: APP_RESOURCE_URI,
      name: 'visual-config UI',
      description: 'Interactive MCP App (SEP-1865): the visual-config panel, rendered in-session.',
      mimeType: APP_MIME,
    },
  ];

  server.setRequestHandler(ListResourcesRequestSchema, () => ({ resources }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    // The MCP App is HTML; every other resource is JSON project context.
    if (uri === APP_RESOURCE_URI) {
      return { contents: [{ uri, mimeType: APP_MIME, text: APP_HTML }] };
    }
    const text = await readResource(uri);
    return { contents: [{ uri, mimeType: 'application/json', text }] };
  });

  async function readResource(uri: string): Promise<string> {
    switch (uri) {
      case 'project://model':
        return JSON.stringify(engine.getProject(), null, 2);
      case 'diagnostics://outdated':
        return JSON.stringify(await engine.getDiagnostics(), null, 2);
      case 'tsconfig://options':
        return JSON.stringify(await engine.getTsconfig(), null, 2);
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  async function dispatch(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case 'get_project':
        return JSON.stringify(engine.getProject(), null, 2);
      case 'list_operations':
        return JSON.stringify(engine.listOperations(), null, 2);
      case 'apply_change':
        return JSON.stringify(await engine.apply(String(args.changeId)), null, 2);
      case 'undo':
        return JSON.stringify(await engine.undo(String(args.entryId)), null, 2);
      case 'list_journal':
        return JSON.stringify(engine.listJournal(), null, 2);
      case 'get_diagnostics':
        return JSON.stringify(await engine.getDiagnostics(), null, 2);
      case 'open_config_ui':
        // The app itself is delivered as the linked ui:// resource; return the
        // project model so hosts without app support still get useful context.
        return JSON.stringify(engine.getProject(), null, 2);
      case 'analyze_bump':
        return JSON.stringify(
          await engine.analyzeBump(String(args.package), args.to ? String(args.to) : undefined),
          null,
          2,
        );
      default: {
        const operationId = toolToOperation.get(name);
        if (!operationId) throw new Error(`Unknown tool: ${name}`);
        return JSON.stringify(await engine.plan(operationId, args), null, 2);
      }
    }
  }

  return server;
}

/** Start the MCP server over stdio (the local-agent transport). */
export async function startStdioMcpServer(engine: Engine): Promise<void> {
  const server = createMcpServer(engine);
  await server.connect(new StdioServerTransport());
}
