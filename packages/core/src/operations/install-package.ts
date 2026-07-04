import type { Change, Operation, OperationContext } from '../types.js';
import { setJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

export interface InstallPackageInput {
  name: string;
  /** Semver range to record, e.g. '^3.23.8'. Supplied by the catalog. */
  range: string;
  /** Install as a devDependency. */
  dev?: boolean;
}

function findExisting(pkgText: string, name: string): { field: string; range: string } | undefined {
  try {
    const pkg = JSON.parse(pkgText) as Record<string, Record<string, string> | undefined>;
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const range = pkg[field]?.[name];
      if (range !== undefined) return { field, range };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Install (or move/rerange) a package by selecting it — the catalog's action. */
export const installPackageOperation: Operation<InstallPackageInput> = {
  id: 'install-package',
  title: 'Install package',
  summary: 'Add a dependency to package.json and install',
  inputSchema: {
    type: 'object',
    required: ['name', 'range'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, description: 'Package name.' },
      range: { type: 'string', minLength: 1, description: 'Semver range, e.g. ^3.23.8.' },
      dev: { type: 'boolean', description: 'Install as a devDependency.' },
    },
  },
  risk: 'review',
  scope: { writes: ['package.json'], runs: 'package-manager', network: 'registry' },

  plan: (ctx, input) => planInstall(ctx, input),
};

async function planInstall(ctx: OperationContext, input: InstallPackageInput): Promise<Change> {
  if (!input?.name?.trim()) throw new Error('install-package: "name" is required');
  if (!input?.range?.trim()) throw new Error('install-package: "range" is required');

  const field = input.dev ? 'devDependencies' : 'dependencies';
  const before = await ctx.readProjectFile('package.json');
  const existing = findExisting(before, input.name);
  const after = setJsonProperty(before, [field, input.name], input.range);
  const pm = ctx.project.packageManager;

  const notes = existing
    ? [
        {
          level: 'info' as const,
          message: `${input.name} is already in ${existing.field} (${existing.range}); updating.`,
        },
      ]
    : [];

  return {
    id: ctx.nextChangeId(),
    operationId: 'install-package',
    summary: `Install ${input.name}@${input.range}${input.dev ? ' (dev)' : ''}`,
    risk: 'review',
    edits: [
      { path: 'package.json', before, after, diff: makeUnifiedDiff('package.json', before, after) },
    ],
    commands: [
      {
        run: `${pm} install`,
        argv: [pm, 'install'],
        reason: `Install the new dependency with ${pm}`,
      },
    ],
    notes,
    reversible: true,
  };
}
