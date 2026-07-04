import type { Change, FileEdit, JsonValue, Operation, OperationContext } from '../types.js';
import { setJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

export type McpClient = 'claude' | 'cursor' | 'vscode';

export interface AddMcpConfigInput {
  /** Which agent tools to write config for. Defaults to all three. */
  clients?: McpClient[];
}

/** The stdio server entry every client understands. */
const SERVER_ENTRY: JsonValue = {
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'visual-config', 'mcp'],
};

const CLIENTS: Record<McpClient, { path: string; key: string[] }> = {
  // Claude Code (and the shared shape Cursor uses).
  claude: { path: '.mcp.json', key: ['mcpServers', 'visual-config'] },
  cursor: { path: '.cursor/mcp.json', key: ['mcpServers', 'visual-config'] },
  // VS Code / Copilot uses `servers`, not `mcpServers`.
  vscode: { path: '.vscode/mcp.json', key: ['servers', 'visual-config'] },
};

const ALL_CLIENTS: McpClient[] = ['claude', 'cursor', 'vscode'];

/**
 * Register visual-config's MCP server in the repo's agent config files, so a
 * teammate or cloud agent opening the project auto-loads `npx visual-config mcp`.
 * Merges into existing files, preserving any other servers.
 */
export const addMcpConfigOperation: Operation<AddMcpConfigInput> = {
  id: 'add-mcp-config',
  title: 'Add MCP server config',
  summary: 'Register the visual-config MCP server in agent config files (.mcp.json, …)',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      clients: {
        type: 'array',
        items: { type: 'string', enum: ALL_CLIENTS },
        description: 'Which agent tools to configure (default: all).',
      },
    },
  },
  risk: 'safe',
  scope: {
    writes: ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json'],
    runs: 'none',
    network: 'none',
  },

  plan: (ctx, input) => planAddMcpConfig(ctx, input),
};

async function planAddMcpConfig(ctx: OperationContext, input: AddMcpConfigInput): Promise<Change> {
  const clients = input?.clients?.length ? input.clients : ALL_CLIENTS;
  const edits: FileEdit[] = [];

  for (const client of clients) {
    const target = CLIENTS[client];
    if (!target) continue;
    const exists = await ctx.fileExists(target.path);
    const before = exists ? await ctx.readProjectFile(target.path) : null;
    const after = setJsonProperty(before ?? '{}\n', target.key, SERVER_ENTRY);
    edits.push({
      path: target.path,
      before,
      after,
      diff: makeUnifiedDiff(target.path, before, after),
    });
  }

  if (edits.length === 0) throw new Error('add-mcp-config: no valid clients specified');

  return {
    id: ctx.nextChangeId(),
    operationId: 'add-mcp-config',
    summary: `Register the visual-config MCP server for: ${clients.join(', ')}`,
    risk: 'safe',
    edits,
    commands: [],
    notes: [
      {
        level: 'info',
        message: 'Agents that read these files will be able to run `npx visual-config mcp`.',
      },
    ],
    reversible: true,
  };
}
