import type { Change, JsonValue, Operation, OperationContext } from '../types.js';
import { setJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

export interface SetPackageFieldInput {
  field: string;
  value: JsonValue;
}

/**
 * Metadata fields this operation may set. Dependencies/scripts are deliberately
 * excluded — use install-package / add-script so those go through their proper,
 * guarded flows (this keeps a generic setter from being a footgun for agents).
 */
const ALLOWED = new Set([
  'name',
  'version',
  'description',
  'license',
  'author',
  'type',
  'private',
  'homepage',
  'sideEffects',
  'keywords',
  'repository',
  'engines',
  'packageManager',
]);

/** Set a top-level metadata field in package.json. */
export const setPackageFieldOperation: Operation<SetPackageFieldInput> = {
  id: 'set-package-field',
  title: 'Set package field',
  summary: 'Set a top-level metadata field in package.json',
  inputSchema: {
    type: 'object',
    required: ['field', 'value'],
    additionalProperties: false,
    properties: {
      field: {
        type: 'string',
        enum: [...ALLOWED],
        description: 'A top-level package.json metadata field.',
      },
      value: { description: 'The value to set (any JSON value).' },
    },
  },
  risk: 'safe',
  scope: { writes: ['package.json'], runs: 'none', network: 'none' },

  plan: (ctx, input) => planSetField(ctx, input),
};

async function planSetField(ctx: OperationContext, input: SetPackageFieldInput): Promise<Change> {
  if (!input?.field || !ALLOWED.has(input.field)) {
    throw new Error(`set-package-field: "${input?.field}" is not an allowed metadata field`);
  }
  if (input.value === undefined) throw new Error('set-package-field: "value" is required');

  const before = await ctx.readProjectFile('package.json');
  const after = setJsonProperty(before, [input.field], input.value);

  return {
    id: ctx.nextChangeId(),
    operationId: 'set-package-field',
    summary: `Set ${input.field} = ${JSON.stringify(input.value)}`,
    risk: 'safe',
    edits: [
      { path: 'package.json', before, after, diff: makeUnifiedDiff('package.json', before, after) },
    ],
    commands: [],
    notes: [],
    reversible: true,
  };
}
