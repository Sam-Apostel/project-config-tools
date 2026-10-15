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
import {
  NodeFileSystem,
  createFleet,
  resolveFleetTargets,
  loadFleetState,
  saveFleetState,
  rememberParent,
  pinProject,
  knownJsonConfig,
  configSchema,
  CONFIG_WRITE_SCOPE,
  type Engine,
  type FileSystem,
  type Fleet,
  type FleetOpener,
  type FleetPlan,
  type ConfigView,
  type ConfigKindSchema,
  type JsonValue,
} from '@apostel/visual-config-core';
import { join, resolve } from 'node:path';
import { APP_HTML, APP_MIME, APP_RESOURCE_URI } from './app-html.js';

function toolName(operationId: string): string {
  return `plan_${operationId.replace(/-/g, '_')}`;
}

/**
 * Ask the host's model a single question (MCP sampling). Returns just the text.
 * Injected in tests; the default calls the connected client's `createMessage`.
 */
export type SampleFn = (params: {
  messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>;
  systemPrompt?: string;
  maxTokens: number;
}) => Promise<{ text: string }>;

/** Injected filesystem/opener for the cross-repo fleet tools (defaults to the real ones). */
export interface McpServerDeps {
  fleet?: { fs?: FileSystem; open?: FleetOpener };
  /** Sampling implementation for propose_config_edit (defaults to the host via createMessage). */
  sample?: SampleFn;
}

/**
 * Build an MCP server that projects the engine's operations as tools. Each
 * operation becomes a `plan_*` tool whose inputSchema IS the operation's schema;
 * calling it returns a previewable Change. `apply_change` is the gated writer,
 * mirroring the human Diff Sheet's plan → confirm split (spec 05). Cross-repo
 * fan-out is exposed as fleet_* tools.
 */
export function createMcpServer(engine: Engine, deps: McpServerDeps = {}): Server {
  // Advertise the MCP Apps extension (SEP-1865) alongside tools/resources so
  // hosts that support interactive UIs know we ship an `text/html;profile=mcp-app`.
  const capabilities = {
    tools: {},
    resources: {},
    extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [APP_MIME] } },
  } as unknown as ServerCapabilities;

  const server = new Server({ name: 'visual-config', version: '0.0.0' }, { capabilities });

  // Cross-repo fan-out state, held for this stdio session so fleet_apply writes
  // exactly what the preceding fleet_plan previewed (like the daemon per-connection).
  const fleetFs = deps.fleet?.fs ?? new NodeFileSystem();
  const fleetOpen = deps.fleet?.open;
  let fleet: Fleet | null = null;
  let fleetPlan: FleetPlan | null = null;

  // Sampling (for propose_config_edit): use the injected sampler in tests, else
  // ask the connected host's model via createMessage. Support is only known once
  // the client has declared its capabilities (after initialize).
  const sample: SampleFn =
    deps.sample ??
    (async (params) => {
      const res = await server.createMessage(params);
      return { text: res.content.type === 'text' ? res.content.text : '' };
    });
  const samplingSupported = (): boolean =>
    deps.sample !== undefined || server.getClientCapabilities()?.sampling !== undefined;

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
    {
      name: 'get_changelog',
      description:
        'Release notes for a dependency between two versions (default: the installed range floor → latest), with breaking changes extracted. Read-only.',
      inputSchema: {
        type: 'object',
        required: ['package'],
        properties: {
          package: { type: 'string', description: 'Dependency name.' },
          from: { type: 'string', description: 'Start version (exclusive). Default: range floor.' },
          to: { type: 'string', description: 'End version (inclusive). Default: latest.' },
        },
      },
    },
    {
      name: 'get_config',
      description:
        'Read editable config files (Biome, Prettier, ESLint, oxlint, tsconfig, …): their current values plus documented options. Pass a path for one, omit for all present configs. Edit with plan_set_config_value / plan_remove_config_value. Read-only.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', description: 'A config file path; omit to list all.' },
        },
      },
    },
    {
      name: 'fleet_discover',
      description:
        'Cross-repo fan-out: discover the npm projects under a parent folder on this machine. No config needed — a monorepo whose package.json sits in a child folder is found by walking; pinned projects are included. Read-only.',
      inputSchema: {
        type: 'object',
        required: ['parent'],
        additionalProperties: false,
        properties: {
          parent: { type: 'string', description: 'Absolute path to the folder of repos.' },
          depth: { type: 'number', description: 'Directory levels to search (default 3).' },
        },
      },
    },
    {
      name: 'fleet_plan',
      description:
        'Dry-run ONE operation across every project under a parent folder — e.g. bump a shared dependency everywhere. Returns a previewable Change per repo; repos where it does not apply are skipped, not errored. Does NOT write — call fleet_apply to write the previewed plan.',
      inputSchema: {
        type: 'object',
        required: ['parent', 'operationId'],
        additionalProperties: false,
        properties: {
          parent: { type: 'string', description: 'Absolute path to the folder of repos.' },
          operationId: {
            type: 'string',
            description: 'An operation id, e.g. upgrade-dependencies (see list_operations).',
          },
          input: {
            type: 'object',
            description: "The operation's input — the same shape as its plan_* tool.",
          },
          depth: { type: 'number', description: 'Directory levels to search (default 3).' },
        },
      },
    },
    {
      name: 'fleet_apply',
      description:
        'Apply the plan from the most recent fleet_plan in this session. Writes each planned repo; each repo keeps its own undo journal. This writes files.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'fleet_pin',
      description:
        'Pin an npm project the folder walk cannot guess (e.g. a monorepo child folder) so future fleet_discover includes it.',
      inputSchema: {
        type: 'object',
        required: ['path'],
        additionalProperties: false,
        properties: { path: { type: 'string', description: 'Absolute path to the npm project.' } },
      },
    },
    {
      name: 'propose_config_edit',
      description:
        'Guided config editing: given a natural-language intent (e.g. "use single quotes and no semicolons") and a known JSON config file (Biome, Prettier, ESLint, oxlint, tsconfig), ask YOUR model (via MCP sampling) to turn it into concrete option edits, validated against the config\'s documented options, then return a previewable Change per edit. Does NOT write — apply with apply_change after review. JS/TS configs (next.config.js, …) are read-only and not supported here.',
      inputSchema: {
        type: 'object',
        required: ['path', 'intent'],
        additionalProperties: false,
        properties: {
          path: {
            type: 'string',
            enum: CONFIG_WRITE_SCOPE,
            description: 'Which known JSON config file to edit.',
          },
          intent: {
            type: 'string',
            minLength: 1,
            description: 'What you want changed, in plain language.',
          },
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
      case 'get_changelog':
        return JSON.stringify(
          await engine.getChangelog(
            String(args.package),
            args.from ? String(args.from) : undefined,
            args.to ? String(args.to) : undefined,
          ),
          null,
          2,
        );
      case 'get_config':
        return JSON.stringify(
          args.path ? await engine.getConfig(String(args.path)) : await engine.getConfigs(),
          null,
          2,
        );
      case 'fleet_discover': {
        const parent = resolve(String(args.parent));
        const depth = args.depth === undefined ? undefined : Number(args.depth);
        const projects = await resolveFleetTargets(fleetFs, parent, depth);
        await saveFleetState(fleetFs, rememberParent(await loadFleetState(fleetFs), parent));
        return JSON.stringify({ parent, projects }, null, 2);
      }
      case 'fleet_plan': {
        const parent = resolve(String(args.parent));
        const depth = args.depth === undefined ? undefined : Number(args.depth);
        const projects = await resolveFleetTargets(fleetFs, parent, depth);
        fleet = createFleet(projects, {}, fleetOpen);
        fleetPlan = await fleet.planAcross(String(args.operationId), args.input ?? {});
        return JSON.stringify(fleetPlan, null, 2);
      }
      case 'fleet_apply': {
        if (!fleet || !fleetPlan)
          throw new Error('No fleet plan to apply — call fleet_plan first.');
        const result = await fleet.applyAcross(fleetPlan);
        fleetPlan = null; // consumed
        return JSON.stringify(result, null, 2);
      }
      case 'fleet_pin': {
        const root = resolve(String(args.path));
        if (!(await fleetFs.exists(join(root, 'package.json')))) {
          throw new Error(`No package.json at ${root} — nothing to pin.`);
        }
        const state = pinProject(await loadFleetState(fleetFs), root);
        await saveFleetState(fleetFs, state);
        return JSON.stringify(state, null, 2);
      }
      case 'propose_config_edit':
        return proposeConfigEdit(String(args.path ?? ''), String(args.intent ?? ''));
      default: {
        const operationId = toolToOperation.get(name);
        if (!operationId) throw new Error(`Unknown tool: ${name}`);
        return JSON.stringify(await engine.plan(operationId, args), null, 2);
      }
    }
  }

  /**
   * Guided config editing via sampling: ask the host model to turn a plain-language
   * intent into concrete option edits, validate them against the config's documented
   * options (facts, not taste), then plan each as a previewable set-config-value
   * Change. Never writes — the caller applies with apply_change.
   */
  async function proposeConfigEdit(path: string, intent: string): Promise<string> {
    if (!intent.trim()) throw new Error('propose_config_edit: "intent" is required.');
    if (!samplingSupported()) {
      throw new Error(
        'This MCP host does not support sampling, so propose_config_edit cannot ask your model for a proposal. ' +
          'Use plan_set_config_value directly with a concrete key and value instead.',
      );
    }
    const known = knownJsonConfig(path);
    if (!known) {
      return JSON.stringify(
        {
          error: `"${path}" is not an editable JSON config. This tool edits: ${CONFIG_WRITE_SCOPE.join(', ')}. JS/TS configs (next.config.js, vite.config.ts, …) are read-only here — guided AST rewrites aren't supported yet.`,
        },
        null,
        2,
      );
    }

    const view = await engine.getConfig(path);
    const schema = view?.schema ?? configSchema(known.kind);
    const values = view?.values ?? {};

    const { text } = await sample({
      systemPrompt: PROPOSE_SYSTEM,
      maxTokens: 800,
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: proposalPrompt(path, intent, values, schema) },
        },
      ],
    });

    const edits = parseProposalEdits(text);
    if (edits.length === 0) {
      return JSON.stringify(
        {
          path,
          intent,
          error: 'The model did not return any concrete edit for that intent.',
          raw: text,
        },
        null,
        2,
      );
    }

    const changes = [];
    const rejected: Array<{ key: string; reason: string }> = [];
    for (const e of edits) {
      const problem = validateEdit(e, schema);
      if (problem) {
        rejected.push({ key: e.key, reason: problem });
        continue;
      }
      changes.push(await engine.plan('set-config-value', { path, key: e.key, value: e.value }));
    }

    return JSON.stringify(
      {
        path,
        intent,
        changes,
        rejected: rejected.length ? rejected : undefined,
        next: changes.length
          ? 'Review each change, then apply the ones you want with apply_change(changeId).'
          : 'No valid edits — nothing to apply.',
      },
      null,
      2,
    );
  }

  return server;
}

/** Start the MCP server over stdio (the local-agent transport). */
export async function startStdioMcpServer(engine: Engine): Promise<void> {
  const server = createMcpServer(engine);
  await server.connect(new StdioServerTransport());
}

interface ProposedEdit {
  key: string;
  value: JsonValue;
}

const PROPOSE_SYSTEM =
  'You translate a natural-language configuration intent into concrete edits to a known ' +
  'JSON config file. Reply with ONLY a JSON object of the form ' +
  '{"edits":[{"key":"<dotted option key>","value":<json value>}]} — no prose, no code fences. ' +
  'Prefer the documented option keys and types given to you; use a value that matches the ' +
  "documented type (and one of the allowed values for an enum). Don't invent options you can't " +
  'justify from the documentation. If the intent needs no change, return {"edits":[]}.';

/** The grounding prompt: the config path, its current values, and its documented options. */
function proposalPrompt(
  path: string,
  intent: string,
  values: Record<string, unknown>,
  schema: ConfigKindSchema | undefined,
): string {
  const options = (schema?.options ?? [])
    .map((o) => {
      const allowed = o.values ? ` one of [${o.values.join(', ')}]` : '';
      const def = o.default !== undefined ? ` default ${JSON.stringify(o.default)}` : '';
      return `- ${o.key} (${o.type}${allowed}${def}): ${o.description}`;
    })
    .join('\n');
  return [
    `Config file: ${path}${schema ? ` (${schema.title})` : ''}`,
    `Current values:\n${JSON.stringify(values, null, 2)}`,
    options
      ? `Documented options:\n${options}`
      : 'No documented options are available for this file.',
    `Intent: ${intent}`,
    'Return the JSON object of edits.',
  ].join('\n\n');
}

/** Parse the model's reply into edits, tolerating code fences and surrounding prose. */
function parseProposalEdits(text: string): ProposedEdit[] {
  const stripped = text.replace(/```(?:json)?/gi, '').trim();
  // Grab the first {...} block so stray prose doesn't break JSON.parse.
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return [];
  }
  const raw = (parsed as { edits?: unknown }).edits;
  if (!Array.isArray(raw)) return [];
  const edits: ProposedEdit[] = [];
  for (const e of raw) {
    const key = (e as { key?: unknown }).key;
    const value = (e as { value?: unknown }).value;
    if (typeof key === 'string' && key.trim() && value !== undefined) {
      edits.push({ key: key.trim(), value: value as JsonValue });
    }
  }
  return edits;
}

/** Validate a proposed edit against the documented option, when the key is documented. */
function validateEdit(
  edit: ProposedEdit,
  schema: ConfigKindSchema | undefined,
): string | undefined {
  const doc = schema?.options.find((o) => o.key === edit.key);
  if (!doc) return undefined; // curated schema isn't exhaustive — allow undocumented keys
  const v = edit.value;
  switch (doc.type) {
    case 'boolean':
      return typeof v === 'boolean' ? undefined : `expected a boolean for ${edit.key}`;
    case 'number':
      return typeof v === 'number' ? undefined : `expected a number for ${edit.key}`;
    case 'string':
      return typeof v === 'string' ? undefined : `expected a string for ${edit.key}`;
    case 'enum':
      if (typeof v !== 'string' || (doc.values && !doc.values.includes(v))) {
        return `expected one of [${doc.values?.join(', ')}] for ${edit.key}`;
      }
      return undefined;
    default:
      return undefined; // array/object: trust the model's shape
  }
}
