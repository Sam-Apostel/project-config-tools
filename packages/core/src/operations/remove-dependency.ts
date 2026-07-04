import type { Change, Operation, OperationContext } from '../types.js';
import { removeJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

export interface RemoveDependencyInput {
  name: string;
}

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function findField(pkgText: string, name: string): string | undefined {
  try {
    const pkg = JSON.parse(pkgText) as Record<string, Record<string, string> | undefined>;
    return DEP_FIELDS.find((field) => pkg[field]?.[name] !== undefined);
  } catch {
    return undefined;
  }
}

/** Remove a dependency from package.json and prune it. */
export const removeDependencyOperation: Operation<RemoveDependencyInput> = {
  id: 'remove-dependency',
  title: 'Remove dependency',
  summary: 'Remove a dependency from package.json',
  inputSchema: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: { name: { type: 'string', minLength: 1 } },
  },
  risk: 'review',
  scope: { writes: ['package.json'], runs: 'package-manager', network: 'registry' },

  plan: (ctx, input) => planRemove(ctx, input),
};

async function planRemove(ctx: OperationContext, input: RemoveDependencyInput): Promise<Change> {
  if (!input?.name?.trim()) throw new Error('remove-dependency: "name" is required');
  const before = await ctx.readProjectFile('package.json');
  const field = findField(before, input.name);
  if (!field) throw new Error(`"${input.name}" is not a dependency of this project`);

  const after = removeJsonProperty(before, [field, input.name]);
  const pm = ctx.project.packageManager;

  return {
    id: ctx.nextChangeId(),
    operationId: 'remove-dependency',
    summary: `Remove ${input.name} (from ${field})`,
    risk: 'review',
    edits: [
      { path: 'package.json', before, after, diff: makeUnifiedDiff('package.json', before, after) },
    ],
    commands: [{ run: `${pm} install`, argv: [pm, 'install'], reason: `Prune with ${pm}` }],
    notes: [],
    reversible: true,
  };
}
