import type { Change, Operation, OperationContext } from '../types.js';
import { setJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

export interface UpgradeDependenciesInput {
  upgrades: Array<{ name: string; range: string }>;
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function fieldOf(pkgText: string, name: string): string | undefined {
  try {
    const pkg = JSON.parse(pkgText) as Record<string, Record<string, string> | undefined>;
    return DEP_FIELDS.find((f) => pkg[f]?.[name] !== undefined);
  } catch {
    return undefined;
  }
}

/** Bump several dependency ranges to new values in one reviewed transaction. */
export const upgradeDependenciesOperation: Operation<UpgradeDependenciesInput> = {
  id: 'upgrade-dependencies',
  title: 'Upgrade dependencies',
  summary: 'Bump several dependency ranges in package.json and install',
  inputSchema: {
    type: 'object',
    required: ['upgrades'],
    additionalProperties: false,
    properties: {
      upgrades: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'range'],
          properties: { name: { type: 'string' }, range: { type: 'string' } },
        },
      },
    },
  },
  risk: 'review',
  scope: { writes: ['package.json'], runs: 'package-manager', network: 'registry' },

  plan: (ctx, input) => planUpgrade(ctx, input),
};

async function planUpgrade(
  ctx: OperationContext,
  input: UpgradeDependenciesInput,
): Promise<Change> {
  const upgrades = input?.upgrades ?? [];
  if (upgrades.length === 0) throw new Error('upgrade-dependencies: no upgrades provided');

  const before = await ctx.readProjectFile('package.json');
  let text = before;
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const up of upgrades) {
    const field = fieldOf(text, up.name);
    if (!field) {
      skipped.push(up.name);
      continue;
    }
    text = setJsonProperty(text, [field, up.name], up.range);
    applied.push(`${up.name}@${up.range}`);
  }

  if (applied.length === 0)
    throw new Error('upgrade-dependencies: none of the packages were found');

  const pm = ctx.project.packageManager;
  return {
    id: ctx.nextChangeId(),
    operationId: 'upgrade-dependencies',
    summary: `Upgrade ${applied.length} ${applied.length === 1 ? 'dependency' : 'dependencies'}`,
    risk: 'review',
    edits: [
      {
        path: 'package.json',
        before,
        after: text,
        diff: makeUnifiedDiff('package.json', before, text),
      },
    ],
    commands: [
      { run: `${pm} install`, argv: [pm, 'install'], reason: `Install upgrades with ${pm}` },
    ],
    notes: skipped.length
      ? [{ level: 'warn', message: `Skipped (not found): ${skipped.join(', ')}` }]
      : [],
    reversible: true,
  };
}
