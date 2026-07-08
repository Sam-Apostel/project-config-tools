import type { Change, Operation, OperationContext } from '../types.js';
import { setJsonProperty } from '../json/edit.js';
import { makeUnifiedDiff } from '../diff.js';

export interface FixVulnerabilitiesInput {
  /** Target versions per package (from the engine's remediation analysis). */
  fixes: Array<{ name: string; to: string }>;
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

/**
 * Bump the vulnerable dependencies to safe versions in one reviewed transaction.
 * Same mechanics as upgrade-dependencies, but scoped to security fixes so the
 * Change (and its journal entry) reads as what it is. Target versions come from
 * the engine's remediation analysis, which chooses the minimal safe version.
 */
export const fixVulnerabilitiesOperation: Operation<FixVulnerabilitiesInput> = {
  id: 'fix-vulnerabilities',
  title: 'Fix vulnerabilities',
  summary: 'Bump vulnerable dependencies to safe versions and install',
  inputSchema: {
    type: 'object',
    required: ['fixes'],
    additionalProperties: false,
    properties: {
      fixes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'to'],
          properties: { name: { type: 'string' }, to: { type: 'string' } },
        },
      },
    },
  },
  risk: 'review',
  scope: { writes: ['package.json'], runs: 'package-manager', network: 'registry' },

  plan: (ctx, input) => planFix(ctx, input),
};

async function planFix(ctx: OperationContext, input: FixVulnerabilitiesInput): Promise<Change> {
  const fixes = input?.fixes ?? [];
  if (fixes.length === 0) throw new Error('fix-vulnerabilities: no fixes provided');

  const before = await ctx.readProjectFile('package.json');
  let text = before;
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const fix of fixes) {
    const field = fieldOf(text, fix.name);
    if (!field) {
      skipped.push(fix.name);
      continue;
    }
    text = setJsonProperty(text, [field, fix.name], `^${fix.to}`);
    applied.push(`${fix.name}@^${fix.to}`);
  }

  if (applied.length === 0)
    throw new Error('fix-vulnerabilities: none of the packages were found in package.json');

  const pm = ctx.project.packageManager;
  return {
    id: ctx.nextChangeId(),
    operationId: 'fix-vulnerabilities',
    summary: `Fix ${applied.length} vulnerable ${applied.length === 1 ? 'dependency' : 'dependencies'}`,
    risk: 'review',
    edits: [
      {
        path: 'package.json',
        before,
        after: text,
        diff: makeUnifiedDiff('package.json', before, text),
      },
    ],
    commands: [{ run: `${pm} install`, argv: [pm, 'install'], reason: `Install fixes with ${pm}` }],
    notes: skipped.length
      ? [{ level: 'warn', message: `Skipped (not in package.json): ${skipped.join(', ')}` }]
      : [],
    reversible: true,
  };
}
