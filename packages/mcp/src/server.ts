import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { Engine } from '@visual-config/core';

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
  const server = new Server(
    { name: 'visual-config', version: '0.0.0' },
    { capabilities: { tools: {} } },
  );

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
