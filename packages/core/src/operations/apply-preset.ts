import type {
  Change,
  FileEdit,
  JsonValue,
  Operation,
  OperationContext,
  PackageManager,
  PlannedCommand,
} from '../types.js';
import { setJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

/**
 * A sane, widely-shared editor baseline. Not tool-specific taste — the values
 * here (utf-8, LF, final newline, 2-space) are the near-universal defaults
 * editorconfig exists to encode.
 */
const EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
`;

/** The strict TypeScript compiler-option family a preset opts a project into. */
const STRICT_TSCONFIG: Record<string, JsonValue> = {
  strict: true,
  noUncheckedIndexedAccess: true,
  noImplicitOverride: true,
  noFallthroughCasesInSwitch: true,
  forceConsistentCasingInFileNames: true,
};

/** Biome's standard scripts (same set switch-to-biome installs). */
const BIOME_SCRIPTS: Record<string, string> = {
  format: 'biome format --write .',
  lint: 'biome lint .',
  check: 'biome check .',
};

/**
 * A preset is a named bundle of mechanical setup facets. Applying one composes
 * every facet into a single previewed, reversible Change. Presets are the
 * opt-in place for taste: unlike base diagnostics (facts only), a preset is a
 * curated baseline the user explicitly selects and reviews before applying.
 */
interface PresetSpec {
  id: string;
  title: string;
  description: string;
  /** devDependencies to install (the installer resolves and pins versions). */
  packages: string[];
  /** Config files to create verbatim; an existing file is kept, not clobbered. */
  files: Record<string, string>;
  /** compilerOptions to set in tsconfig.json (skipped, with a note, if absent). */
  tsconfig: Record<string, JsonValue>;
  /** package.json scripts to add (an existing script of the same name is kept). */
  scripts: Record<string, string>;
}

const PRESETS: Record<string, PresetSpec> = {
  'strict-ts': {
    id: 'strict-ts',
    title: 'Strict TypeScript',
    description:
      'Turn on the strict compiler-option family (strict, noUncheckedIndexedAccess, …) and add an .editorconfig baseline.',
    packages: [],
    files: { '.editorconfig': EDITORCONFIG },
    tsconfig: STRICT_TSCONFIG,
    scripts: {},
  },
  biome: {
    id: 'biome',
    title: 'Biome baseline',
    description:
      'Install Biome, create biome.json + .editorconfig, and add format/lint/check scripts.',
    packages: ['@biomejs/biome'],
    files: { 'biome.json': '{}\n', '.editorconfig': EDITORCONFIG },
    tsconfig: {},
    scripts: BIOME_SCRIPTS,
  },
  'ts-biome': {
    id: 'ts-biome',
    title: 'Strict TypeScript + Biome',
    description:
      'The full baseline: strict compiler options, Biome (config + scripts), and an .editorconfig.',
    packages: ['@biomejs/biome'],
    files: { 'biome.json': '{}\n', '.editorconfig': EDITORCONFIG },
    tsconfig: STRICT_TSCONFIG,
    scripts: BIOME_SCRIPTS,
  },
};

export const PRESET_IDS = Object.keys(PRESETS);

/** Public metadata for a preset (for UI/MCP discovery). */
export interface PresetInfo {
  id: string;
  title: string;
  description: string;
  /** Config files the preset creates. */
  creates: string[];
  /** Packages the preset installs. */
  installs: string[];
  /** Whether the preset sets tsconfig compiler options (needs tsconfig.json). */
  touchesTsconfig: boolean;
  /** package.json scripts the preset adds. */
  scripts: string[];
}

export function presetCatalog(): PresetInfo[] {
  return Object.values(PRESETS).map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    creates: Object.keys(p.files),
    installs: p.packages,
    touchesTsconfig: Object.keys(p.tsconfig).length > 0,
    scripts: Object.keys(p.scripts),
  }));
}

/** Every path any preset may write — the operation's static write scope. */
const ALL_PRESET_FILES = [...new Set(Object.values(PRESETS).flatMap((p) => Object.keys(p.files)))];

export interface ApplyPresetInput {
  /** Which preset to apply. */
  preset: string;
}

/** Package-manager "add a devDependency" invocation. */
function addDevCommand(pm: PackageManager, packages: string[]): PlannedCommand {
  const table: Record<PackageManager, string[]> = {
    npm: ['npm', 'install', '-D'],
    pnpm: ['pnpm', 'add', '-D'],
    yarn: ['yarn', 'add', '-D'],
    bun: ['bun', 'add', '-d'],
  };
  const argv = [...table[pm], ...packages];
  return { run: argv.join(' '), argv, reason: `Install ${packages.join(', ')} as devDependencies` };
}

function edit(path: string, before: string | null, after: string): FileEdit {
  return { path, before, after, diff: makeUnifiedDiff(path, before, after) };
}

/**
 * Apply a toolchain preset — a curated baseline — as one previewed, reversible
 * Change that composes several mechanical facets (tsconfig strictness, config
 * files, scripts, installs). Idempotent: existing files and scripts are kept
 * rather than clobbered, already-set options and installed packages are no-ops,
 * so re-applying only fills what's missing.
 */
export const applyPresetOperation: Operation<ApplyPresetInput> = {
  id: 'apply-preset',
  title: 'Apply a toolchain preset',
  summary:
    'Apply a curated toolchain baseline (tsconfig, configs, scripts, installs) in one change',
  inputSchema: {
    type: 'object',
    required: ['preset'],
    additionalProperties: false,
    properties: {
      preset: {
        type: 'string',
        enum: PRESET_IDS,
        description: 'Which preset to apply (strict-ts, biome, ts-biome).',
      },
    },
  },
  risk: 'review',
  scope: {
    writes: [...ALL_PRESET_FILES, 'tsconfig.json', 'package.json'],
    runs: 'package-manager',
    network: 'registry',
  },

  plan: (ctx, input) => planPreset(ctx, input),
};

async function planPreset(ctx: OperationContext, input: ApplyPresetInput): Promise<Change> {
  const spec = PRESETS[input?.preset];
  if (!spec) throw new Error(`apply-preset: unknown preset "${input?.preset}"`);

  const edits: FileEdit[] = [];
  const notes: Change['notes'] = [];

  // 1. tsconfig strictness — only when there's a tsconfig.json to edit.
  if (Object.keys(spec.tsconfig).length > 0) {
    if (await ctx.fileExists('tsconfig.json')) {
      const before = await ctx.readProjectFile('tsconfig.json');
      let after = before;
      for (const [key, value] of Object.entries(spec.tsconfig)) {
        after = setJsonProperty(after, ['compilerOptions', key], value);
      }
      if (after !== before) {
        edits.push(edit('tsconfig.json', before, after));
        notes.push({
          level: 'warn',
          message:
            'Enabling stricter compiler options may surface new type errors — run typecheck.',
        });
      }
    } else {
      notes.push({
        level: 'warn',
        message: 'Skipped strict compiler options — no tsconfig.json in this project.',
      });
    }
  }

  // 2. Config files — create the ones that don't exist; keep any the user has.
  for (const [path, body] of Object.entries(spec.files)) {
    if (await ctx.fileExists(path)) {
      notes.push({ level: 'info', message: `Kept your existing ${path}.` });
      continue;
    }
    edits.push(edit(path, null, body));
  }

  // 3. Scripts — add missing ones; never overwrite a script the user defined.
  if ((await ctx.fileExists('package.json')) && Object.keys(spec.scripts).length > 0) {
    const before = await ctx.readProjectFile('package.json');
    let after = before;
    let existing: Record<string, string> = {};
    try {
      existing = (JSON.parse(before).scripts ?? {}) as Record<string, string>;
    } catch {
      existing = {};
    }
    for (const [name, command] of Object.entries(spec.scripts)) {
      if (existing[name] === undefined) {
        after = setJsonProperty(after, ['scripts', name], command);
      } else if (existing[name] !== command) {
        notes.push({ level: 'info', message: `Kept your existing "${name}" script.` });
      }
    }
    if (after !== before) edits.push(edit('package.json', before, after));
  }

  // 4. Installs — only packages that aren't already dependencies.
  const installed = new Set(ctx.project.dependencies.map((d) => d.name));
  const toInstall = spec.packages.filter((p) => !installed.has(p));
  const commands = toInstall.length ? [addDevCommand(ctx.project.packageManager, toInstall)] : [];

  if (edits.length === 0 && commands.length === 0) {
    throw new Error(`apply-preset: "${spec.id}" is already fully applied — nothing to do`);
  }

  notes.unshift({
    level: 'info',
    message: `"${spec.title}" is an opinionated baseline you're opting into — review the diff before applying.`,
  });

  return {
    id: ctx.nextChangeId(),
    operationId: 'apply-preset',
    summary: `Apply preset: ${spec.title}`,
    risk: 'review',
    edits,
    commands,
    notes,
    reversible: true,
  };
}
