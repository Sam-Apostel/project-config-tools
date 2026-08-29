import { describe, it, expect } from 'vitest';
import { Engine } from '../engine.js';
import { InMemoryFileSystem } from '../fs.js';
import { createDefaultRegistry } from '../index.js';
import type { CommandRunner, RunResult } from '../runner.js';

const ROOT = '/proj';

class StubRunner implements CommandRunner {
  calls: string[][] = [];
  run(argv: string[]): Promise<RunResult> {
    this.calls.push(argv);
    return Promise.resolve({ code: 0, output: '' });
  }
}

async function makeEngine(
  files: Record<string, string>,
): Promise<{ engine: Engine; fs: InMemoryFileSystem; runner: StubRunner }> {
  const withRoot = Object.fromEntries(Object.entries(files).map(([k, v]) => [`${ROOT}/${k}`, v]));
  const fs = new InMemoryFileSystem(withRoot);
  const runner = new StubRunner();
  const engine = await Engine.create({ root: ROOT, fs, registry: createDefaultRegistry(), runner });
  return { engine, fs, runner };
}

function pkg(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

describe('install-package', () => {
  it('adds a dependency and installs', async () => {
    const { engine, fs, runner } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    const change = await engine.plan('install-package', { name: 'zod', range: '^3.23.8' });
    expect(change.commands[0]!.argv).toEqual(['npm', 'install']);
    await engine.apply(change.id);
    expect(JSON.parse(await fs.readFile('/proj/package.json')).dependencies.zod).toBe('^3.23.8');
    expect(runner.calls).toEqual([['npm', 'install']]);
  });

  it('adds a devDependency when dev is true', async () => {
    const { engine, fs } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    const change = await engine.plan('install-package', { name: 'vitest', range: '^2', dev: true });
    await engine.apply(change.id);
    expect(JSON.parse(await fs.readFile('/proj/package.json')).devDependencies.vitest).toBe('^2');
  });

  it('notes when the package already exists', async () => {
    const { engine } = await makeEngine({
      'package.json': pkg({ dependencies: { zod: '^3.0.0' } }),
    });
    const change = await engine.plan('install-package', { name: 'zod', range: '^3.23.8' });
    expect(change.notes.some((n) => n.message.includes('already in'))).toBe(true);
  });
});

describe('remove-dependency', () => {
  it('removes an existing dependency', async () => {
    const { engine, fs } = await makeEngine({
      'package.json': pkg({ dependencies: { zod: '^3', lodash: '^4' } }),
    });
    const change = await engine.plan('remove-dependency', { name: 'zod' });
    await engine.apply(change.id);
    const parsed = JSON.parse(await fs.readFile('/proj/package.json'));
    expect(parsed.dependencies.zod).toBeUndefined();
    expect(parsed.dependencies.lodash).toBe('^4');
  });

  it('throws for a dependency that is not present', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}) });
    await expect(engine.plan('remove-dependency', { name: 'ghost' })).rejects.toThrow();
  });
});

describe('remove-script', () => {
  it('removes an existing script', async () => {
    const { engine, fs } = await makeEngine({
      'package.json': pkg({ scripts: { build: 'tsc', test: 'vitest' } }),
    });
    const change = await engine.plan('remove-script', { name: 'test' });
    expect(change.risk).toBe('safe');
    await engine.apply(change.id);
    const parsed = JSON.parse(await fs.readFile('/proj/package.json'));
    expect(parsed.scripts.test).toBeUndefined();
    expect(parsed.scripts.build).toBe('tsc');
  });

  it('throws when the script is missing', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}) });
    await expect(engine.plan('remove-script', { name: 'nope' })).rejects.toThrow();
  });
});

describe('upgrade-dependencies', () => {
  it('bumps several ranges in one edit and installs once', async () => {
    const { engine, fs, runner } = await makeEngine({
      'package.json': pkg({
        dependencies: { zod: '^3.20.0' },
        devDependencies: { vitest: '^2.0.0' },
      }),
    });
    const change = await engine.plan('upgrade-dependencies', {
      upgrades: [
        { name: 'zod', range: '^3.24.0' },
        { name: 'vitest', range: '^2.1.8' },
      ],
    });
    expect(change.edits).toHaveLength(1);
    await engine.apply(change.id);
    const parsed = JSON.parse(await fs.readFile('/proj/package.json'));
    expect(parsed.dependencies.zod).toBe('^3.24.0');
    expect(parsed.devDependencies.vitest).toBe('^2.1.8');
    expect(runner.calls).toEqual([['npm', 'install']]);
  });

  it('notes packages it could not find, upgrades the rest', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({ dependencies: { zod: '^3' } }) });
    const change = await engine.plan('upgrade-dependencies', {
      upgrades: [
        { name: 'zod', range: '^3.24.0' },
        { name: 'ghost', range: '^1' },
      ],
    });
    expect(change.notes.some((n) => n.message.includes('ghost'))).toBe(true);
  });

  it('throws when none are found', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}) });
    await expect(
      engine.plan('upgrade-dependencies', { upgrades: [{ name: 'ghost', range: '^1' }] }),
    ).rejects.toThrow();
  });
});

describe('add-mcp-config', () => {
  it('creates .mcp.json / .cursor / .vscode with the server entry', async () => {
    const { engine, fs } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    const change = await engine.plan('add-mcp-config', { clients: ['claude', 'cursor', 'vscode'] });
    expect(change.risk).toBe('safe');
    expect(change.edits).toHaveLength(3);
    await engine.apply(change.id);

    const claude = JSON.parse(await fs.readFile('/proj/.mcp.json'));
    expect(claude.mcpServers['visual-config']).toMatchObject({ command: 'npx' });
    expect(claude.mcpServers['visual-config'].args).toContain('mcp');

    // VS Code uses `servers`, not `mcpServers`.
    const vscode = JSON.parse(await fs.readFile('/proj/.vscode/mcp.json'));
    expect(vscode.servers['visual-config'].command).toBe('npx');
  });

  it('merges into an existing .mcp.json, preserving other servers', async () => {
    const existing = JSON.stringify({ mcpServers: { other: { command: 'x' } } }, null, 2) + '\n';
    const { engine, fs } = await makeEngine({
      'package.json': pkg({}),
      '.mcp.json': existing,
    });
    const change = await engine.plan('add-mcp-config', { clients: ['claude'] });
    await engine.apply(change.id);
    const config = JSON.parse(await fs.readFile('/proj/.mcp.json'));
    expect(config.mcpServers.other).toBeDefined();
    expect(config.mcpServers['visual-config']).toBeDefined();
  });
});

describe('set-config-value', () => {
  it('sets a nested value in biome.json (format-preserving)', async () => {
    const { engine, fs } = await makeEngine({ 'package.json': pkg({}), 'biome.json': '{}\n' });
    const change = await engine.plan('set-config-value', {
      path: 'biome.json',
      key: 'formatter.indentStyle',
      value: 'space',
    });
    expect(change.risk).toBe('review');
    await engine.apply(change.id);
    const parsed = JSON.parse(await fs.readFile('/proj/biome.json'));
    expect(parsed.formatter.indentStyle).toBe('space');
  });

  it('creates the config file when it does not exist yet', async () => {
    const { engine, fs } = await makeEngine({ 'package.json': pkg({}) });
    const change = await engine.plan('set-config-value', {
      path: '.prettierrc',
      key: 'singleQuote',
      value: true,
    });
    expect(change.notes.some((n) => n.message.includes("doesn't exist"))).toBe(true);
    await engine.apply(change.id);
    expect(JSON.parse(await fs.readFile('/proj/.prettierrc')).singleQuote).toBe(true);
  });

  it('rejects a path that is not a known config file', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}) });
    await expect(
      engine.plan('set-config-value', { path: 'secrets.json', key: 'x', value: 1 }),
    ).rejects.toThrow(/not a known/);
  });
});

describe('remove-config-value', () => {
  it('unsets a key, preserving the rest', async () => {
    const { engine, fs } = await makeEngine({
      'package.json': pkg({}),
      '.prettierrc': pkg({ semi: false, tabWidth: 2 }),
    });
    const change = await engine.plan('remove-config-value', { path: '.prettierrc', key: 'semi' });
    await engine.apply(change.id);
    const parsed = JSON.parse(await fs.readFile('/proj/.prettierrc'));
    expect(parsed.semi).toBeUndefined();
    expect(parsed.tabWidth).toBe(2);
  });

  it('throws when the key is not set', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}), '.prettierrc': '{}\n' });
    await expect(
      engine.plan('remove-config-value', { path: '.prettierrc', key: 'semi' }),
    ).rejects.toThrow();
  });
});

describe('add-config', () => {
  it('scaffolds Prettier: config + scripts edits and an install command', async () => {
    const { engine, fs, runner } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    const change = await engine.plan('add-config', { tool: 'prettier' });
    // Creates .prettierrc and edits package.json (scripts).
    expect(change.edits.map((e) => e.path).sort()).toEqual(['.prettierrc', 'package.json']);
    expect(change.commands[0]!.argv).toEqual(['npm', 'install', '-D', 'prettier']);
    await engine.apply(change.id);
    expect(await fs.readFile('/proj/.prettierrc')).toBe('{}\n');
    const parsed = JSON.parse(await fs.readFile('/proj/package.json'));
    expect(parsed.scripts.format).toBe('prettier --write .');
    expect(runner.calls).toEqual([['npm', 'install', '-D', 'prettier']]);
  });

  it('uses the project package manager for the install command', async () => {
    const { engine } = await makeEngine({
      'package.json': pkg({ name: 'demo', packageManager: 'pnpm@10.0.0' }),
      'pnpm-lock.yaml': '',
    });
    const change = await engine.plan('add-config', { tool: 'biome' });
    expect(change.commands[0]!.argv).toEqual(['pnpm', 'add', '-D', '@biomejs/biome']);
  });

  it('refuses when the tool is already configured', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}), 'biome.json': '{}\n' });
    await expect(engine.plan('add-config', { tool: 'biome' })).rejects.toThrow(/already/);
  });
});

describe('switch-to-biome', () => {
  it('creates biome.json, deletes eslint/prettier configs, drops deps + scripts', async () => {
    const { engine, fs } = await makeEngine({
      'package.json': pkg({
        name: 'demo',
        devDependencies: { eslint: '^9', prettier: '^3', '@typescript-eslint/parser': '^8' },
        dependencies: { zod: '^3' },
        scripts: { lint: 'eslint .', format: 'prettier --write .', test: 'vitest' },
      }),
      '.eslintrc.json': '{ "root": true }\n',
      '.prettierrc': '{ "semi": false }\n',
    });
    const change = await engine.plan('switch-to-biome', {});
    expect(change.risk).toBe('breaking');
    const paths = change.edits.map((e) => e.path).sort();
    expect(paths).toEqual(['.eslintrc.json', '.prettierrc', 'biome.json', 'package.json']);
    // The config files are deletions.
    expect(change.edits.find((e) => e.path === '.eslintrc.json')!.after).toBeNull();
    expect(change.edits.find((e) => e.path === '.prettierrc')!.after).toBeNull();
    expect(change.commands.map((c) => c.argv)).toEqual([
      ['npm', 'install', '-D', '@biomejs/biome'],
      ['npm', 'install'],
    ]);

    await engine.apply(change.id);
    expect(await fs.exists('/proj/.eslintrc.json')).toBe(false);
    expect(await fs.exists('/proj/.prettierrc')).toBe(false);
    expect(await fs.readFile('/proj/biome.json')).toBe('{}\n');
    const parsed = JSON.parse(await fs.readFile('/proj/package.json'));
    expect(parsed.devDependencies.eslint).toBeUndefined();
    expect(parsed.devDependencies.prettier).toBeUndefined();
    expect(parsed.devDependencies['@typescript-eslint/parser']).toBeUndefined();
    expect(parsed.dependencies.zod).toBe('^3'); // unrelated dep kept
    expect(parsed.scripts.lint).toBe('biome lint .'); // replaced
    expect(parsed.scripts.format).toBe('biome format --write .');
    expect(parsed.scripts.test).toBe('vitest'); // unrelated script kept
  });

  it('refuses when there is no ESLint/Prettier to replace', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    await expect(engine.plan('switch-to-biome', {})).rejects.toThrow(/no ESLint\/Prettier/);
  });
});

describe('engine.getConfig', () => {
  it('returns a parsed view with documented schema for a detected config', async () => {
    const { engine } = await makeEngine({
      'package.json': pkg({}),
      'biome.json': pkg({ formatter: { indentStyle: 'space' } }),
    });
    const view = await engine.getConfig('biome.json');
    expect(view?.kind).toBe('biome');
    expect(view?.schema?.title).toBe('Biome');
    expect((view?.values.formatter as { indentStyle?: string }).indentStyle).toBe('space');
  });

  it('statically reads a JS/TS config as a read-only view', async () => {
    const { engine } = await makeEngine({
      'package.json': pkg({}),
      'next.config.ts':
        'export default { reactStrictMode: true, webpack(c) { return c } } satisfies NextConfig\n',
    });
    const view = await engine.getConfig('next.config.ts');
    expect(view?.kind).toBe('next');
    expect(view?.readOnly).toBe(true);
    expect(view?.values).toEqual({ reactStrictMode: true });
    expect(view?.dynamicKeys).toEqual(['webpack']);
  });
});

describe('set-package-field', () => {
  it('sets an allowed metadata field', async () => {
    const { engine, fs } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    const change = await engine.plan('set-package-field', {
      field: 'description',
      value: 'a demo',
    });
    expect(change.risk).toBe('safe');
    await engine.apply(change.id);
    expect(JSON.parse(await fs.readFile('/proj/package.json')).description).toBe('a demo');
  });

  it('rejects a non-allowed field (e.g. dependencies)', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    await expect(
      engine.plan('set-package-field', { field: 'dependencies', value: {} }),
    ).rejects.toThrow(/not an allowed/);
  });
});

describe('set-tsconfig-option', () => {
  it('sets a compilerOptions value preserving comments', async () => {
    const tsconfig =
      '{\n  // keep this comment\n  "compilerOptions": {\n    "target": "ES2022"\n  }\n}\n';
    const { engine, fs } = await makeEngine({ 'package.json': pkg({}), 'tsconfig.json': tsconfig });
    const change = await engine.plan('set-tsconfig-option', { key: 'strict', value: true });
    await engine.apply(change.id);
    const written = await fs.readFile('/proj/tsconfig.json');
    expect(written).toContain('// keep this comment');
    expect(written).toContain('"strict": true');
    expect(written).toContain('"target": "ES2022"');
  });

  it('throws when there is no tsconfig.json', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({}) });
    await expect(
      engine.plan('set-tsconfig-option', { key: 'strict', value: true }),
    ).rejects.toThrow(/No tsconfig/);
  });
});

describe('fix-vulnerabilities', () => {
  it('bumps vulnerable deps to safe versions and installs', async () => {
    const { engine, fs, runner } = await makeEngine({
      'package.json': pkg({
        name: 'demo',
        dependencies: { lodash: '^4.17.15' },
        devDependencies: { vitest: '^2.1.0' },
      }),
    });
    const change = await engine.plan('fix-vulnerabilities', {
      fixes: [
        { name: 'lodash', to: '4.17.21' },
        { name: 'vitest', to: '2.1.9' },
      ],
    });
    expect(change.summary).toMatch(/Fix 2 vulnerable/);
    await engine.apply(change.id);
    const written = JSON.parse(await fs.readFile('/proj/package.json'));
    expect(written.dependencies.lodash).toBe('^4.17.21');
    expect(written.devDependencies.vitest).toBe('^2.1.9');
    expect(runner.calls).toEqual([['npm', 'install']]);
  });

  it('notes packages that are not in package.json', async () => {
    const { engine } = await makeEngine({
      'package.json': pkg({ name: 'demo', dependencies: { lodash: '^4.17.15' } }),
    });
    const change = await engine.plan('fix-vulnerabilities', {
      fixes: [
        { name: 'lodash', to: '4.17.21' },
        { name: 'ghost', to: '1.0.0' },
      ],
    });
    expect(change.notes.some((n) => n.message.includes('ghost'))).toBe(true);
  });

  it('throws when no fix applies', async () => {
    const { engine } = await makeEngine({ 'package.json': pkg({ name: 'demo' }) });
    await expect(
      engine.plan('fix-vulnerabilities', { fixes: [{ name: 'x', to: '1.0.0' }] }),
    ).rejects.toThrow(/none of the packages/);
  });
});
