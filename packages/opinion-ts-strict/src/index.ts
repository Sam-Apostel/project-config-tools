import { definePlugin, type ProjectModel } from '@visual-config/kit';

/**
 * An example opinion pack. It demonstrates the shape of an attributed
 * recommendation set — the base tool ships none of these. The author here is a
 * placeholder and the pack is clearly marked community/unofficial; a real pack
 * would be published under its author's own scope and verified (see
 * docs/spec/07-opinions.md §5).
 */
const AUTHOR = {
  name: 'visual-config example',
  kind: 'org' as const,
  url: 'https://github.com/sam-apostel/project-config-tools',
  official: false,
};

const hasTsconfig = (project: ProjectModel): boolean =>
  project.configFiles.some((f) => f.kind === 'tsconfig');

export default definePlugin({
  id: 'opinion-ts-strict',
  displayName: 'TypeScript strictness (example opinion)',
  apiVersion: 1,
  setup(ctx) {
    ctx.registerImprovement({
      id: 'strict',
      applies: hasTsconfig,
      suggest: () => ({
        id: 'enable-strict',
        title: 'Enable TypeScript `strict`',
        detail: 'Turns on all strict type-checking options — catches many bugs at compile time.',
        author: AUTHOR,
        docUrl: 'https://www.typescriptlang.org/tsconfig#strict',
        apply: { operationId: 'set-tsconfig-option', input: { key: 'strict', value: true } },
      }),
    });

    ctx.registerImprovement({
      id: 'no-unchecked-indexed-access',
      applies: hasTsconfig,
      suggest: () => ({
        id: 'enable-noUncheckedIndexedAccess',
        title: 'Enable `noUncheckedIndexedAccess`',
        detail: 'Adds undefined to indexed access, catching a common class of bugs.',
        author: AUTHOR,
        docUrl: 'https://www.typescriptlang.org/tsconfig#noUncheckedIndexedAccess',
        apply: {
          operationId: 'set-tsconfig-option',
          input: { key: 'noUncheckedIndexedAccess', value: true },
        },
      }),
    });
  },
});
