import type { Change, JsonValue, Operation, OperationContext } from '../types.js';
import { setJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

export interface SetTsconfigOptionInput {
  /** A compilerOptions key, e.g. 'strict'. */
  key: string;
  value: JsonValue;
}

/** Set a compilerOptions value in tsconfig.json (comment-preserving). */
export const setTsconfigOptionOperation: Operation<SetTsconfigOptionInput> = {
  id: 'set-tsconfig-option',
  title: 'Set TypeScript option',
  summary: 'Set a compilerOptions value in tsconfig.json',
  inputSchema: {
    type: 'object',
    required: ['key', 'value'],
    additionalProperties: false,
    properties: {
      key: { type: 'string', minLength: 1, description: 'A compilerOptions key, e.g. strict.' },
      value: { description: 'The value to set (any JSON value).' },
    },
  },
  risk: 'review',
  scope: { writes: ['tsconfig.json'], runs: 'none', network: 'none' },

  plan: (ctx, input) => planSetTsconfig(ctx, input),
};

async function planSetTsconfig(
  ctx: OperationContext,
  input: SetTsconfigOptionInput,
): Promise<Change> {
  if (!input?.key?.trim()) throw new Error('set-tsconfig-option: "key" is required');
  if (input.value === undefined) throw new Error('set-tsconfig-option: "value" is required');
  if (!(await ctx.fileExists('tsconfig.json'))) {
    throw new Error('No tsconfig.json in this project');
  }

  const before = await ctx.readProjectFile('tsconfig.json');
  const after = setJsonProperty(before, ['compilerOptions', input.key], input.value);

  return {
    id: ctx.nextChangeId(),
    operationId: 'set-tsconfig-option',
    summary: `Set compilerOptions.${input.key} = ${JSON.stringify(input.value)}`,
    risk: 'review',
    edits: [
      {
        path: 'tsconfig.json',
        before,
        after,
        diff: makeUnifiedDiff('tsconfig.json', before, after),
      },
    ],
    commands: [],
    notes: [
      {
        level: 'info',
        message: 'Changing tsconfig affects how your project type-checks and builds.',
      },
    ],
    reversible: true,
  };
}
