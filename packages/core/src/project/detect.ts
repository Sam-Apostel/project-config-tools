import { join } from 'node:path';
import type {
  ConfigFileRef,
  DependencyEntry,
  FileSystem,
  PackageManager,
  ProjectModel,
  ScriptEntry,
} from '../types.js';

async function detectPackageManager(fs: FileSystem, root: string): Promise<PackageManager> {
  if (await fs.exists(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fs.exists(join(root, 'yarn.lock'))) return 'yarn';
  if ((await fs.exists(join(root, 'bun.lockb'))) || (await fs.exists(join(root, 'bun.lock')))) {
    return 'bun';
  }
  return 'npm';
}

interface KnownConfig {
  path: string;
  kind: string;
  format: ConfigFileRef['format'];
  editable: ConfigFileRef['editable'];
}

const KNOWN_CONFIGS: KnownConfig[] = [
  { path: 'package.json', kind: 'package.json', format: 'json', editable: 'full' },
  { path: 'tsconfig.json', kind: 'tsconfig', format: 'jsonc', editable: 'full' },
  { path: 'jsconfig.json', kind: 'jsconfig', format: 'jsonc', editable: 'full' },
  { path: 'biome.json', kind: 'biome', format: 'json', editable: 'full' },
  { path: 'biome.jsonc', kind: 'biome', format: 'jsonc', editable: 'full' },
  { path: '.prettierrc', kind: 'prettier', format: 'json', editable: 'full' },
  { path: '.prettierrc.json', kind: 'prettier', format: 'json', editable: 'full' },
  { path: '.eslintrc.json', kind: 'eslint-legacy', format: 'json', editable: 'full' },
  { path: 'eslint.config.js', kind: 'eslint-flat', format: 'js', editable: 'static-subset' },
  { path: 'eslint.config.mjs', kind: 'eslint-flat', format: 'js', editable: 'static-subset' },
  { path: 'eslint.config.ts', kind: 'eslint-flat', format: 'ts', editable: 'static-subset' },
  { path: '.oxlintrc.json', kind: 'oxlint', format: 'json', editable: 'full' },
  { path: 'next.config.js', kind: 'next', format: 'js', editable: 'static-subset' },
  { path: 'next.config.mjs', kind: 'next', format: 'js', editable: 'static-subset' },
  { path: 'next.config.ts', kind: 'next', format: 'ts', editable: 'static-subset' },
  { path: 'vite.config.js', kind: 'vite', format: 'js', editable: 'static-subset' },
  { path: 'vite.config.ts', kind: 'vite', format: 'ts', editable: 'static-subset' },
  { path: '.npmrc', kind: 'npmrc', format: 'toml', editable: 'full' },
];

function collectDeps(
  record: Record<string, string> | undefined,
  type: DependencyEntry['type'],
): DependencyEntry[] {
  if (!record) return [];
  return Object.entries(record).map(([name, range]) => ({ name, range, type }));
}

function normalizeWorkspaces(workspaces: unknown): string[] {
  if (Array.isArray(workspaces))
    return workspaces.filter((w): w is string => typeof w === 'string');
  if (workspaces && typeof workspaces === 'object') {
    const packages = (workspaces as { packages?: unknown }).packages;
    if (Array.isArray(packages)) return packages.filter((w): w is string => typeof w === 'string');
  }
  return [];
}

interface RawPackageJson {
  name?: string;
  version?: string;
  description?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: unknown;
}

/** Parse the real files into a {@link ProjectModel}. Throws if there is no package.json. */
export async function detectProject(fs: FileSystem, root: string): Promise<ProjectModel> {
  const pkgPath = join(root, 'package.json');
  if (!(await fs.exists(pkgPath))) {
    throw new Error(`No package.json found in ${root}`);
  }
  const raw = await fs.readFile(pkgPath);
  let pkg: RawPackageJson;
  try {
    pkg = JSON.parse(raw) as RawPackageJson;
  } catch (err) {
    throw new Error(`package.json is not valid JSON: ${(err as Error).message}`);
  }

  const scripts: ScriptEntry[] = Object.entries(pkg.scripts ?? {}).map(([name, command]) => ({
    name,
    command,
  }));

  const dependencies: DependencyEntry[] = [
    ...collectDeps(pkg.dependencies, 'prod'),
    ...collectDeps(pkg.devDependencies, 'dev'),
    ...collectDeps(pkg.peerDependencies, 'peer'),
    ...collectDeps(pkg.optionalDependencies, 'optional'),
  ];

  const configFiles: ConfigFileRef[] = [];
  for (const candidate of KNOWN_CONFIGS) {
    if (await fs.exists(join(root, candidate.path))) {
      configFiles.push({
        path: candidate.path,
        kind: candidate.kind,
        format: candidate.format,
        editable: candidate.editable,
      });
    }
  }

  return {
    root,
    packageManager: await detectPackageManager(fs, root),
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    private: pkg.private,
    scripts,
    dependencies,
    configFiles,
    detected: [],
    workspaces: normalizeWorkspaces(pkg.workspaces),
  };
}
