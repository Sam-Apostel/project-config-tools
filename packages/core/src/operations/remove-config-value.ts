import type { Change, Operation, OperationContext } from '../types.js';
import { removeJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';
import { CONFIG_WRITE_SCOPE, knownJsonConfig } from '../config/schema.js';

export interface RemoveConfigValueInput {
  /** Project-relative path of a known JSON/JSONC config file. */
  path: string;
  /** Dotted key path to unset, e.g. "formatter.indentStyle". */
  key: string;
}

/** Unset a value in a known JSON/JSONC config file (format-preserving). */
export const removeConfigValueOperation: Operation<RemoveConfigValueInput> = {
  id: 'remove-config-value',
  title: 'Remove config value',
  summary: 'Unset a value in a JSON config file',
  inputSchema: {
    type: 'object',
    required: ['path', 'key'],
    additionalProperties: false,
    properties: {
      path: { type: 'string', enum: CONFIG_WRITE_SCOPE, description: 'Which config file to edit.' },
      key: { type: 'string', minLength: 1, description: 'Dotted key path to unset.' },
    },
  },
  risk: 'review',
  scope: { writes: CONFIG_WRITE_SCOPE, runs: 'none', network: 'none' },

  plan: (ctx, input) => planRemoveConfigValue(ctx, input),
};

async function planRemoveConfigValue(
  ctx: OperationContext,
  input: RemoveConfigValueInput,
): Promise<Change> {
  const known = knownJsonConfig(input?.path);
  if (!known) throw new Error(`remove-config-value: "${input?.path}" is not a known JSON config`);
  if (!input.key?.trim()) throw new Error('remove-config-value: "key" is required');
  if (!(await ctx.fileExists(input.path))) {
    throw new Error(`remove-config-value: ${input.path} does not exist`);
  }

  const before = await ctx.readProjectFile(input.path);
  const after = removeJsonProperty(before, input.key.split('.'));
  if (after === before) {
    throw new Error(`remove-config-value: "${input.key}" is not set in ${input.path}`);
  }

  return {
    id: ctx.nextChangeId(),
    operationId: 'remove-config-value',
    summary: `Unset ${input.key} in ${input.path}`,
    risk: 'review',
    edits: [{ path: input.path, before, after, diff: makeUnifiedDiff(input.path, before, after) }],
    commands: [],
    notes: [],
    reversible: true,
  };
}
