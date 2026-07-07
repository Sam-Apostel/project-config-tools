import { Engine, type EngineDeps } from './engine.js';
import { OperationRegistry } from './operations/registry.js';
import { addScriptOperation } from './operations/add-script.js';
import { removeScriptOperation } from './operations/remove-script.js';
import { installPackageOperation } from './operations/install-package.js';
import { removeDependencyOperation } from './operations/remove-dependency.js';
import { setTsconfigOptionOperation } from './operations/set-tsconfig-option.js';
import { setPackageFieldOperation } from './operations/set-package-field.js';
import { upgradeDependenciesOperation } from './operations/upgrade-dependencies.js';
import { addMcpConfigOperation } from './operations/add-mcp-config.js';
import { setConfigValueOperation } from './operations/set-config-value.js';
import { removeConfigValueOperation } from './operations/remove-config-value.js';
import { addConfigOperation } from './operations/add-config.js';
import { switchToBiomeOperation } from './operations/switch-to-biome.js';
import { homedir } from 'node:os';
import { join as joinPath, resolve as resolvePath } from 'node:path';
import { NodeFileSystem } from './fs.js';
import type { CommandRunner } from './runner.js';
import type { Registry } from './registry/npm.js';
import type { FileSystem, Operation } from './types.js';
import type { Plugin } from './plugin.js';

export * from './types.js';
export { Engine, type EngineDeps } from './engine.js';
export { OperationRegistry } from './operations/registry.js';
export { addScriptOperation, type AddScriptInput } from './operations/add-script.js';
export { removeScriptOperation, type RemoveScriptInput } from './operations/remove-script.js';
export { installPackageOperation, type InstallPackageInput } from './operations/install-package.js';
export {
  removeDependencyOperation,
  type RemoveDependencyInput,
} from './operations/remove-dependency.js';
export {
  setTsconfigOptionOperation,
  type SetTsconfigOptionInput,
} from './operations/set-tsconfig-option.js';
export {
  setPackageFieldOperation,
  type SetPackageFieldInput,
} from './operations/set-package-field.js';
export {
  upgradeDependenciesOperation,
  type UpgradeDependenciesInput,
} from './operations/upgrade-dependencies.js';
export {
  addMcpConfigOperation,
  type AddMcpConfigInput,
  type McpClient,
} from './operations/add-mcp-config.js';
export {
  setConfigValueOperation,
  type SetConfigValueInput,
} from './operations/set-config-value.js';
export {
  removeConfigValueOperation,
  type RemoveConfigValueInput,
} from './operations/remove-config-value.js';
export {
  addConfigOperation,
  scaffoldCatalog,
  SCAFFOLDABLE_TOOLS,
  type AddConfigInput,
  type ScaffoldInfo,
} from './operations/add-config.js';
export { switchToBiomeOperation, type SwitchToBiomeInput } from './operations/switch-to-biome.js';
export {
  configSchema,
  knownJsonConfig,
  KNOWN_JSON_CONFIGS,
  CONFIG_WRITE_SCOPE,
  type ConfigView,
  type ConfigKindSchema,
  type ConfigOptionDoc,
  type KnownJsonConfig,
} from './config/schema.js';
export { extractJsConfig, type JsConfigExtract } from './config/js-extract.js';
export { Journal, type JournalEntry, type Actor } from './journal.js';
export { NodeFileSystem, InMemoryFileSystem } from './fs.js';
export {
  NodeCommandRunner,
  type CommandRunner,
  type RunOptions,
  type RunResult,
} from './runner.js';
export { detectProject } from './project/detect.js';
export { discoverPlugins } from './discover.js';
export { setJsonProperty, removeJsonProperty } from './json/edit.js';
export { detectFormatting } from './json/format.js';
export { makeUnifiedDiff } from './diff.js';
export { enforceScope, matchesAnyGlob } from './scope.js';
export {
  NpmRegistry,
  type Registry,
  type RegistrySearchHit,
  type Advisory,
} from './registry/npm.js';
export {
  searchCatalog,
  type CatalogQuery,
  type CatalogResult,
  type CatalogPackage,
} from './catalog.js';
export {
  computeDiagnostics,
  computeOutdated,
  computeDeprecations,
  computeVulnerabilities,
  extractAlternative,
  type Diagnostics,
  type Diagnostic,
  type DiagnosticKind,
  type DiagnosticSeverity,
  type DiagnosticSource,
} from './diagnostics.js';
export { scanUsage } from './migration/usage.js';
export { analyzeBump } from './migration/analyze.js';
export {
  GithubChangelogSource,
  extractBreakingChanges,
  extractSymbols,
  parseGithubRepo,
} from './migration/changelog.js';
export type {
  BumpAnalysis,
  BumpFinding,
  BumpAssessment,
  BreakingChange,
  ReleaseNotes,
  ChangelogSource,
  UsageMap,
  UsageSite,
} from './migration/types.js';

export { PLUGIN_API_VERSION } from './plugin.js';
export type {
  Plugin,
  PluginContext,
  Detector,
  Improvement,
  ImprovementRule,
  OpinionAuthor,
} from './plugin.js';

/** The built-in (first-party) operations, defined once. */
export const builtinOperations: Operation<unknown>[] = [
  addScriptOperation as Operation<unknown>,
  removeScriptOperation as Operation<unknown>,
  installPackageOperation as Operation<unknown>,
  removeDependencyOperation as Operation<unknown>,
  setTsconfigOptionOperation as Operation<unknown>,
  setPackageFieldOperation as Operation<unknown>,
  upgradeDependenciesOperation as Operation<unknown>,
  addMcpConfigOperation as Operation<unknown>,
  setConfigValueOperation as Operation<unknown>,
  removeConfigValueOperation as Operation<unknown>,
  addConfigOperation as Operation<unknown>,
  switchToBiomeOperation as Operation<unknown>,
];

/**
 * The built-ins as a first-party plugin — we dogfood the exact API third
 * parties use, so it can't rot ("everything is a plugin, including built-ins").
 */
export const builtinPlugin: Plugin = {
  id: 'builtin',
  displayName: 'visual-config built-ins',
  apiVersion: 1,
  setup(context) {
    for (const op of builtinOperations) context.registerOperation(op);
  },
};

/** Registry preloaded with the built-in operations (used directly in tests). */
export function createDefaultRegistry(): OperationRegistry {
  const registry = new OperationRegistry();
  for (const op of builtinOperations) registry.register(op);
  return registry;
}

export interface OpenProjectOptions {
  fs?: FileSystem;
  runner?: CommandRunner;
  npm?: Registry;
  /** Additional plugins, loaded after the built-ins. */
  plugins?: Plugin[];
  /** Where to persist the undo journal. Defaults to a global cache dir (keeps the project clean). Pass null to disable. */
  journalPath?: string | null;
}

/** A stable, project-scoped journal path in the user's cache dir (not in the project). */
function defaultJournalPath(root: string): string {
  const key = Buffer.from(resolvePath(root)).toString('base64url');
  return joinPath(homedir(), '.cache', 'visual-config', `${key}.journal.json`);
}

/** Convenience: build an {@link Engine} for a project root, built-ins + plugins loaded. */
export function openProject(root: string, options: OpenProjectOptions = {}): Promise<Engine> {
  const deps: EngineDeps = {
    root,
    fs: options.fs ?? new NodeFileSystem(),
    registry: new OperationRegistry(),
    runner: options.runner,
    npm: options.npm,
    plugins: [builtinPlugin, ...(options.plugins ?? [])],
    journalPath:
      options.journalPath === null ? undefined : (options.journalPath ?? defaultJournalPath(root)),
  };
  return Engine.create(deps);
}
