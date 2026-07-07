import type { Change, FileEdit, Operation, OperationContext, PackageManager } from '../types.js';
import { setJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

interface ToolScaffold {
  tool: string;
  title: string;
  /** npm packages to install as devDependencies. */
  packages: string[];
  configPath: string;
  /** Minimal, non-opinionated starter config (the tool works on its defaults). */
  configBody: string;
  /** Standard scripts to add to package.json (mechanical, tool-documented). */
  scripts: Record<string, string>;
}

/**
 * Mechanical setups — install the tool, create an empty/minimal config it accepts
 * on its own defaults, and add its standard scripts. No taste is encoded (the
 * config body carries no rule choices); opinions still come only from packs.
 */
const SCAFFOLDS: Record<string, ToolScaffold> = {
  prettier: {
    tool: 'prettier',
    title: 'Prettier',
    packages: ['prettier'],
    configPath: '.prettierrc',
    configBody: '{}\n',
    scripts: { format: 'prettier --write .', 'format:check': 'prettier --check .' },
  },
  biome: {
    tool: 'biome',
    title: 'Biome',
    packages: ['@biomejs/biome'],
    configPath: 'biome.json',
    configBody: '{}\n',
    scripts: { format: 'biome format --write .', lint: 'biome lint .' },
  },
  oxlint: {
    tool: 'oxlint',
    title: 'oxlint',
    packages: ['oxlint'],
    configPath: '.oxlintrc.json',
    configBody: '{}\n',
    scripts: { lint: 'oxlint' },
  },
};

export const SCAFFOLDABLE_TOOLS = Object.keys(SCAFFOLDS);

/** Public metadata for the scaffoldable tools (for UI/MCP setup affordances). */
export interface ScaffoldInfo {
  tool: string;
  title: string;
  configPath: string;
  packages: string[];
}

export function scaffoldCatalog(): ScaffoldInfo[] {
  return Object.values(SCAFFOLDS).map((s) => ({
    tool: s.tool,
    title: s.title,
    configPath: s.configPath,
    packages: s.packages,
  }));
}

export interface AddConfigInput {
  /** Which tool to set up. */
  tool: string;
}

/** Package-manager-specific "add a devDependency" invocation. */
function addDevCommand(pm: PackageManager, packages: string[]): { run: string; argv: string[] } {
  const table: Record<PackageManager, string[]> = {
    npm: ['npm', 'install', '-D'],
    pnpm: ['pnpm', 'add', '-D'],
    yarn: ['yarn', 'add', '-D'],
    bun: ['bun', 'add', '-d'],
  };
  const argv = [...table[pm], ...packages];
  return { run: argv.join(' '), argv };
}

/**
 * Set up a formatter/linter in one reviewed step: install it, create a minimal
 * config, and add its standard scripts. The installer resolves and pins the
 * version, so nothing is hard-coded here.
 */
export const addConfigOperation: Operation<AddConfigInput> = {
  id: 'add-config',
  title: 'Set up a tool',
  summary: 'Install a formatter/linter, create its config, and add its scripts',
  inputSchema: {
    type: 'object',
    required: ['tool'],
    additionalProperties: false,
    properties: {
      tool: {
        type: 'string',
        enum: SCAFFOLDABLE_TOOLS,
        description: 'Which tool to set up (prettier, biome, oxlint).',
      },
    },
  },
  risk: 'review',
  scope: {
    writes: [...Object.values(SCAFFOLDS).map((s) => s.configPath), 'package.json'],
    runs: 'package-manager',
    network: 'registry',
  },

  plan: (ctx, input) => planAddConfig(ctx, input),
};

async function planAddConfig(ctx: OperationContext, input: AddConfigInput): Promise<Change> {
  const spec = SCAFFOLDS[input?.tool];
  if (!spec) throw new Error(`add-config: unknown tool "${input?.tool}"`);
  if (await ctx.fileExists(spec.configPath)) {
    throw new Error(`add-config: ${spec.configPath} already exists — ${spec.title} is set up`);
  }

  const edits: FileEdit[] = [
    {
      path: spec.configPath,
      before: null,
      after: spec.configBody,
      diff: makeUnifiedDiff(spec.configPath, null, spec.configBody),
    },
  ];

  // Add the tool's scripts to package.json, if we can read it.
  if (await ctx.fileExists('package.json')) {
    const before = await ctx.readProjectFile('package.json');
    let after = before;
    for (const [name, command] of Object.entries(spec.scripts)) {
      after = setJsonProperty(after, ['scripts', name], command);
    }
    if (after !== before) {
      edits.push({
        path: 'package.json',
        before,
        after,
        diff: makeUnifiedDiff('package.json', before, after),
      });
    }
  }

  const cmd = addDevCommand(ctx.project.packageManager, spec.packages);

  return {
    id: ctx.nextChangeId(),
    operationId: 'add-config',
    summary: `Set up ${spec.title} (install ${spec.packages.join(', ')} + config + scripts)`,
    risk: 'review',
    edits,
    commands: [
      {
        run: cmd.run,
        argv: cmd.argv,
        reason: `Install ${spec.title} as a devDependency`,
      },
    ],
    notes: [
      {
        level: 'info',
        message: `Creates ${spec.configPath} with defaults; adjust it in the Config panel afterward.`,
      },
    ],
    reversible: true,
  };
}
