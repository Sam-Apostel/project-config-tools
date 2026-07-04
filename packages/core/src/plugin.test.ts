import { describe, it, expect } from 'vitest';
import { openProject } from './index.js';
import { InMemoryFileSystem } from './fs.js';
import type { Plugin } from './plugin.js';
import type { Operation } from './types.js';

const ROOT = '/proj';

function makeFs(pkg: object): InMemoryFileSystem {
  return new InMemoryFileSystem({ '/proj/package.json': JSON.stringify(pkg, null, 2) + '\n' });
}

// A tiny third-party plugin that adds an operation and a detector.
const touchFileOperation: Operation<{ marker: string }> = {
  id: 'demo-touch',
  title: 'Demo touch',
  summary: 'Write a marker into package.json (demo)',
  inputSchema: { type: 'object', required: ['marker'], properties: { marker: { type: 'string' } } },
  risk: 'safe',
  scope: { writes: ['package.json'], runs: 'none', network: 'none' },
  plan: (ctx, input) =>
    ctx.readProjectFile('package.json').then((before) => ({
      id: ctx.nextChangeId(),
      operationId: 'demo-touch',
      summary: `marker ${input.marker}`,
      risk: 'safe' as const,
      edits: [{ path: 'package.json', before, after: before, diff: '' }],
      commands: [],
      notes: [],
      reversible: true,
    })),
};

const demoPlugin: Plugin = {
  id: 'demo',
  apiVersion: 1,
  setup(ctx) {
    ctx.registerOperation(touchFileOperation);
    ctx.registerDetector({
      id: 'demo-detector',
      detect: (project) =>
        project.dependencies.some((d) => d.name === 'react')
          ? { id: 'react', evidence: ['dep/react'] }
          : null,
    });
  },
};

describe('plugin system', () => {
  it('loads built-ins as a plugin (openProject exposes them)', async () => {
    const engine = await openProject(ROOT, { fs: makeFs({ name: 'demo' }) });
    const ids = engine.listOperations().map((o) => o.id);
    expect(ids).toContain('add-script');
    expect(ids).toContain('install-package');
  });

  it('lets a third-party plugin register a new operation', async () => {
    const engine = await openProject(ROOT, { fs: makeFs({ name: 'demo' }), plugins: [demoPlugin] });
    expect(engine.listOperations().map((o) => o.id)).toContain('demo-touch');
    const change = await engine.plan('demo-touch', { marker: 'x' });
    expect(change.operationId).toBe('demo-touch');
  });

  it('runs plugin detectors and populates project.detected', async () => {
    const engine = await openProject(ROOT, {
      fs: makeFs({ name: 'demo', dependencies: { react: '^18' } }),
      plugins: [demoPlugin],
    });
    expect(engine.getProject().detected).toContainEqual(
      expect.objectContaining({ id: 'react', pluginId: 'demo-detector' }),
    );
  });

  it('ships no improvements in the neutral base', async () => {
    const engine = await openProject(ROOT, { fs: makeFs({ name: 'demo' }) });
    expect(engine.getImprovements()).toEqual([]);
  });

  it('surfaces attributed improvements from an opinion plugin', async () => {
    const opinion: Plugin = {
      id: 'ts-strict-opinion',
      setup(ctx) {
        ctx.registerImprovement({
          id: 'strict',
          applies: (p) => p.configFiles.some((f) => f.kind === 'tsconfig'),
          suggest: () => ({
            id: 'enable-strict',
            title: 'Enable TypeScript strict mode',
            detail: 'strict catches many bugs at compile time.',
            author: { name: 'Example Author', kind: 'person', official: false },
            apply: { operationId: 'set-tsconfig-option', input: { key: 'strict', value: true } },
          }),
        });
      },
    };
    const fs = new InMemoryFileSystem({
      '/proj/package.json': JSON.stringify({ name: 'demo' }, null, 2),
      '/proj/tsconfig.json': '{}\n',
    });
    const engine = await openProject(ROOT, { fs, plugins: [opinion] });
    const improvements = engine.getImprovements();
    expect(improvements).toHaveLength(1);
    expect(improvements[0]!.author.name).toBe('Example Author');
    expect(improvements[0]!.apply?.operationId).toBe('set-tsconfig-option');
  });

  it('skips a plugin that needs a newer API version', async () => {
    const future: Plugin = { id: 'future', apiVersion: 99, setup: () => undefined };
    const engine = await openProject(ROOT, { fs: makeFs({ name: 'demo' }), plugins: [future] });
    // built-ins still load; the future plugin simply contributed nothing.
    expect(engine.listOperations().length).toBeGreaterThan(0);
  });
});
