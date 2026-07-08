import { basename, dirname, join, relative, sep } from 'node:path';
import { matchesAnyGlob } from '../scope.js';
import { readInstalledVersions } from './lockfile.js';
import type {
  ConfigFileRef,
  DependencyEntry,
  FileSystem,
  PackageManager,
  ProjectModel,
  ScriptEntry,
  WorkspacePackage,
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

/**
 * Extract the `packages:` list from a pnpm-workspace.yaml. Deliberately a small,
 * dependency-free reader for the one shape that matters (a `packages:` block of
 * `- glob` items, quoted or not, comments allowed) rather than a full YAML parser.
 */
function parsePnpmWorkspaceGlobs(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const globs: string[] = [];
  let inPackages = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '');
    if (/^packages:\s*$/.test(line.trimEnd())) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const item = line.match(/^\s*-\s*(.+?)\s*$/);
    if (item?.[1]) {
      globs.push(item[1].replace(/^['"]|['"]$/g, ''));
      continue;
    }
    // A non-list, non-blank line ends the block (e.g. the next top-level key).
    if (line.trim() !== '') break;
  }
  return globs;
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/');
}

/**
 * Resolve workspace globs to the member packages that actually exist on disk by
 * walking for `package.json` files and matching their directory against the
 * globs. Supports pnpm/yarn `!`-prefixed exclusion patterns.
 */
async function resolveWorkspacePackages(
  fs: FileSystem,
  root: string,
  globs: string[],
): Promise<WorkspacePackage[]> {
  if (globs.length === 0) return [];
  const include = globs.filter((g) => !g.startsWith('!'));
  const exclude = globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1));
  if (include.length === 0) return [];

  const packages: WorkspacePackage[] = [];
  for (const file of await fs.walk(root)) {
    if (basename(file) !== 'package.json') continue;
    const dirAbs = dirname(file);
    if (dirAbs === root) continue; // the root package.json is not a member
    const rel = toPosix(relative(root, dirAbs));
    if (!matchesAnyGlob(rel, include)) continue;
    if (exclude.length > 0 && matchesAnyGlob(rel, exclude)) continue;

    let name: string | undefined;
    try {
      const parsed = JSON.parse(await fs.readFile(file)) as { name?: unknown };
      if (typeof parsed.name === 'string') name = parsed.name;
    } catch {
      // A member with unreadable package.json is still a member; leave name blank.
    }
    packages.push({ name, dir: rel });
  }
  packages.sort((a, b) => a.dir.localeCompare(b.dir));
  return packages;
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

  // Pin each dep to its exact installed version from the lockfile, when present,
  // so diagnostics reflect what's actually installed rather than the range floor.
  const installed = await readInstalledVersions(fs, root);
  for (const dep of dependencies) {
    const version = installed[dep.name];
    if (version) dep.resolved = version;
  }

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

  // Workspace globs come from package.json (npm/yarn) or pnpm-workspace.yaml (pnpm).
  let workspaces = normalizeWorkspaces(pkg.workspaces);
  const pnpmWorkspacePath = join(root, 'pnpm-workspace.yaml');
  if (workspaces.length === 0 && (await fs.exists(pnpmWorkspacePath))) {
    workspaces = parsePnpmWorkspaceGlobs(await fs.readFile(pnpmWorkspacePath));
    if (workspaces.length > 0) {
      configFiles.push({
        path: 'pnpm-workspace.yaml',
        kind: 'pnpm-workspace',
        format: 'yaml',
        editable: 'read-only',
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
    workspaces,
    workspacePackages: await resolveWorkspacePackages(fs, root, workspaces),
  };
}
