import type { Change, Operation, OperationContext } from '../types.js';
import { removeJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

export interface RemoveScriptInput {
  name: string;
}

/** Remove a script from package.json. */
export const removeScriptOperation: Operation<RemoveScriptInput> = {
  id: 'remove-script',
  title: 'Remove script',
  summary: 'Remove a script from package.json',
  inputSchema: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: { name: { type: 'string', minLength: 1 } },
  },
  risk: 'safe',
  scope: { writes: ['package.json'], runs: 'none', network: 'none' },

  plan: (ctx, input) => planRemoveScript(ctx, input),
};

async function planRemoveScript(ctx: OperationContext, input: RemoveScriptInput): Promise<Change> {
  if (!input?.name?.trim()) throw new Error('remove-script: "name" is required');
  const before = await ctx.readProjectFile('package.json');
  let exists = false;
  try {
    exists =
      (JSON.parse(before) as { scripts?: Record<string, string> }).scripts?.[input.name] !==
      undefined;
  } catch {
    /* ignore */
  }
  if (!exists) throw new Error(`Script "${input.name}" does not exist`);

  const after = removeJsonProperty(before, ['scripts', input.name]);
  return {
    id: ctx.nextChangeId(),
    operationId: 'remove-script',
    summary: `Remove script "${input.name}"`,
    risk: 'safe',
    edits: [
      { path: 'package.json', before, after, diff: makeUnifiedDiff('package.json', before, after) },
    ],
    commands: [],
    notes: [],
    reversible: true,
  };
}
