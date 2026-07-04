import type { Change, Operation, OperationContext } from '../types.js';
import { setJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

export interface AddScriptInput {
  name: string;
  command: string;
}

function getExistingScript(pkgText: string, name: string): string | undefined {
  try {
    const pkg = JSON.parse(pkgText) as { scripts?: Record<string, string> };
    return pkg.scripts?.[name];
  } catch {
    return undefined;
  }
}

/** Add or update a script in package.json. The first mutating operation. */
export const addScriptOperation: Operation<AddScriptInput> = {
  id: 'add-script',
  title: 'Add script',
  summary: 'Add or update a script in package.json',
  inputSchema: {
    type: 'object',
    required: ['name', 'command'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, description: 'Script name (the key under "scripts").' },
      command: { type: 'string', minLength: 1, description: 'The command to run.' },
    },
  },
  risk: 'safe',
  scope: { writes: ['package.json'], runs: 'none', network: 'none' },

  plan(ctx: OperationContext, input: AddScriptInput): Promise<Change> {
    return planAddScript(ctx, input);
  },
};

async function planAddScript(ctx: OperationContext, input: AddScriptInput): Promise<Change> {
  if (typeof input?.name !== 'string' || input.name.trim() === '') {
    throw new Error('add-script: "name" is required');
  }
  if (typeof input?.command !== 'string' || input.command.trim() === '') {
    throw new Error('add-script: "command" is required');
  }

  const before = await ctx.readProjectFile('package.json');
  const existing = getExistingScript(before, input.name);
  const after = setJsonProperty(before, ['scripts', input.name], input.command);
  const diff = makeUnifiedDiff('package.json', before, after);

  const overwrites = existing !== undefined && existing !== input.command;

  return {
    id: ctx.nextChangeId(),
    operationId: 'add-script',
    summary: `${existing === undefined ? 'Add' : 'Update'} script "${input.name}": ${input.command}`,
    risk: overwrites ? 'review' : 'safe',
    edits: [{ path: 'package.json', before, after, diff }],
    commands: [],
    notes: overwrites
      ? [
          {
            level: 'warn',
            message: `Overwrites existing script "${input.name}" (was: ${existing})`,
          },
        ]
      : [],
    reversible: true,
  };
}
