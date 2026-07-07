import type { Change, JsonValue, Operation, OperationContext } from '../types.js';
import { setJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';
import { CONFIG_WRITE_SCOPE, knownJsonConfig } from '../config/schema.js';

export interface SetConfigValueInput {
  /** Project-relative path of a known JSON/JSONC config file. */
  path: string;
  /** Dotted key path into the config object, e.g. "formatter.indentStyle". */
  key: string;
  value: JsonValue;
}

/**
 * Set a value in any known JSON/JSONC config file (Biome, Prettier, ESLint,
 * oxlint, tsconfig, …) — format- and comment-preserving. Creates the file if it
 * doesn't exist yet. One operation covers every JSON config the adapter knows.
 */
export const setConfigValueOperation: Operation<SetConfigValueInput> = {
  id: 'set-config-value',
  title: 'Set config value',
  summary: 'Set a value in a JSON config file (Biome, Prettier, ESLint, oxlint, tsconfig, …)',
  inputSchema: {
    type: 'object',
    required: ['path', 'key', 'value'],
    additionalProperties: false,
    properties: {
      path: {
        type: 'string',
        enum: CONFIG_WRITE_SCOPE,
        description: 'Which config file to edit.',
      },
      key: {
        type: 'string',
        minLength: 1,
        description: 'Dotted key path, e.g. "singleQuote" or "formatter.indentStyle".',
      },
      value: { description: 'The value to set (any JSON value).' },
    },
  },
  risk: 'review',
  scope: { writes: CONFIG_WRITE_SCOPE, runs: 'none', network: 'none' },

  plan: (ctx, input) => planSetConfigValue(ctx, input),
};

async function planSetConfigValue(
  ctx: OperationContext,
  input: SetConfigValueInput,
): Promise<Change> {
  const known = knownJsonConfig(input?.path);
  if (!known) throw new Error(`set-config-value: "${input?.path}" is not a known JSON config file`);
  if (!input.key?.trim()) throw new Error('set-config-value: "key" is required');
  if (input.value === undefined) throw new Error('set-config-value: "value" is required');

  const exists = await ctx.fileExists(input.path);
  const before = exists ? await ctx.readProjectFile(input.path) : null;
  const after = setJsonProperty(before ?? '{}\n', input.key.split('.'), input.value);

  return {
    id: ctx.nextChangeId(),
    operationId: 'set-config-value',
    summary: `Set ${input.key} = ${JSON.stringify(input.value)} in ${input.path}`,
    risk: 'review',
    edits: [
      {
        path: input.path,
        before,
        after,
        diff: makeUnifiedDiff(input.path, before, after),
      },
    ],
    commands: [],
    notes: exists
      ? []
      : [{ level: 'info', message: `Creates ${input.path} (it doesn't exist yet).` }],
    reversible: true,
  };
}
