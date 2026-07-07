import type { Change, FileEdit, Operation, OperationContext, PackageManager } from '../types.js';
import { setJsonProperty, removeJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/** Config-file kinds this swap tears down (detected by the project scanner). */
const REPLACED_KINDS = new Set(['eslint-legacy', 'eslint-flat', 'prettier']);

/** Every config path the swap may delete — also its static write scope. */
const REPLACEABLE_CONFIG_PATHS = [
  '.eslintrc.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.json',
];

/** Does a dependency name belong to the ESLint/Prettier ecosystem we're removing? */
function isReplacedDep(name: string): boolean {
  return (
    name === 'eslint' ||
    name === 'prettier' ||
    name.startsWith('@typescript-eslint/') ||
    name.startsWith('@eslint/') ||
    name.startsWith('eslint-') ||
    name.startsWith('prettier-') ||
    name.startsWith('@prettier/')
  );
}

const BIOME_SCRIPTS: Record<string, string> = {
  format: 'biome format --write .',
  lint: 'biome lint .',
  check: 'biome check .',
};

/** Package-manager "add a devDependency" invocation. */
function addDevCommand(pm: PackageManager, pkg: string): { run: string; argv: string[] } {
  const table: Record<PackageManager, string[]> = {
    npm: ['npm', 'install', '-D'],
    pnpm: ['pnpm', 'add', '-D'],
    yarn: ['yarn', 'add', '-D'],
    bun: ['bun', 'add', '-d'],
  };
  const argv = [...table[pm], pkg];
  return { run: argv.join(' '), argv };
}

export interface SwitchToBiomeInput {
  /** Reserved for future options (e.g. keeping some scripts). */
  _?: never;
}

/**
 * Replace ESLint + Prettier with Biome, as one previewed, reversible Change:
 * create biome.json, delete the ESLint/Prettier config files, drop their
 * dependencies and scripts, and add Biome's. Rule/format *settings* are NOT
 * translated — Biome starts on its defaults (noted on the Change).
 */
export const switchToBiomeOperation: Operation<SwitchToBiomeInput> = {
  id: 'switch-to-biome',
  title: 'Switch to Biome',
  summary: 'Replace ESLint + Prettier with Biome (configs, deps, and scripts)',
  inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  risk: 'breaking',
  scope: {
    writes: ['biome.json', 'package.json', ...REPLACEABLE_CONFIG_PATHS],
    runs: 'package-manager',
    network: 'registry',
  },

  plan: (ctx) => planSwitchToBiome(ctx),
};

async function planSwitchToBiome(ctx: OperationContext): Promise<Change> {
  const edits: FileEdit[] = [];
  const notes: Change['notes'] = [];

  // 1. Create biome.json (defaults) — refuse if Biome is already set up.
  if (await ctx.fileExists('biome.json')) {
    throw new Error('switch-to-biome: biome.json already exists');
  }
  edits.push({
    path: 'biome.json',
    before: null,
    after: '{}\n',
    diff: makeUnifiedDiff('biome.json', null, '{}\n'),
  });

  // 2. Delete detected ESLint/Prettier config files.
  const configTargets = ctx.project.configFiles.filter((f) => REPLACED_KINDS.has(f.kind));
  for (const cfg of configTargets) {
    if (!(await ctx.fileExists(cfg.path))) continue;
    const before = await ctx.readProjectFile(cfg.path);
    edits.push({
      path: cfg.path,
      before,
      after: null,
      diff: makeUnifiedDiff(cfg.path, before, null),
    });
  }

  // 3. Rewrite package.json: drop ESLint/Prettier deps + scripts, add Biome scripts.
  if (!(await ctx.fileExists('package.json'))) {
    throw new Error('switch-to-biome: no package.json');
  }
  const pkgBefore = await ctx.readProjectFile('package.json');
  const pkg = JSON.parse(pkgBefore) as Record<string, Record<string, string> | undefined>;

  const removedDeps: string[] = [];
  let pkgAfter = pkgBefore;
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (isReplacedDep(name)) {
        pkgAfter = removeJsonProperty(pkgAfter, [field, name]);
        removedDeps.push(name);
      }
    }
  }
  // Remove a "prettier" config block embedded in package.json, if any.
  if (pkg.prettier !== undefined) pkgAfter = removeJsonProperty(pkgAfter, ['prettier']);

  // Drop scripts that invoke eslint/prettier, then add Biome's.
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  for (const [name, command] of Object.entries(scripts)) {
    if (/\b(eslint|prettier)\b/.test(command))
      pkgAfter = removeJsonProperty(pkgAfter, ['scripts', name]);
  }
  for (const [name, command] of Object.entries(BIOME_SCRIPTS)) {
    pkgAfter = setJsonProperty(pkgAfter, ['scripts', name], command);
  }

  if (pkgAfter !== pkgBefore) {
    edits.push({
      path: 'package.json',
      before: pkgBefore,
      after: pkgAfter,
      diff: makeUnifiedDiff('package.json', pkgBefore, pkgAfter),
    });
  }

  if (configTargets.length === 0 && removedDeps.length === 0) {
    throw new Error('switch-to-biome: no ESLint/Prettier config or dependencies found to replace');
  }

  const pm = ctx.project.packageManager;
  const add = addDevCommand(pm, '@biomejs/biome');

  notes.push({
    level: 'warn',
    message:
      'Your ESLint/Prettier rule and format settings are NOT translated — Biome starts on its ' +
      'defaults. Review biome.json (and the Config panel) after applying.',
  });
  if (removedDeps.length) {
    notes.push({ level: 'info', message: `Removes: ${removedDeps.join(', ')}.` });
  }

  return {
    id: ctx.nextChangeId(),
    operationId: 'switch-to-biome',
    summary: `Switch to Biome — replace ESLint + Prettier (${configTargets.length} config file(s), ${removedDeps.length} dep(s))`,
    risk: 'breaking',
    edits,
    commands: [
      { run: add.run, argv: add.argv, reason: 'Install Biome' },
      { run: `${pm} install`, argv: [pm, 'install'], reason: 'Prune the removed dependencies' },
    ],
    notes,
    reversible: true,
  };
}
