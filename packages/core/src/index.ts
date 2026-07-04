import { Engine, type EngineDeps } from './engine.js';
import { OperationRegistry } from './operations/registry.js';
import { addScriptOperation } from './operations/add-script.js';
import { removeScriptOperation } from './operations/remove-script.js';
import { installPackageOperation } from './operations/install-package.js';
import { removeDependencyOperation } from './operations/remove-dependency.js';
import { setTsconfigOptionOperation } from './operations/set-tsconfig-option.js';
import { NodeFileSystem } from './fs.js';
import type { CommandRunner } from './runner.js';
import type { FileSystem } from './types.js';

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
export { Journal, type JournalEntry, type Actor } from './journal.js';
export { NodeFileSystem, InMemoryFileSystem } from './fs.js';
export {
  NodeCommandRunner,
  type CommandRunner,
  type RunOptions,
  type RunResult,
} from './runner.js';
export { detectProject } from './project/detect.js';
export { setJsonProperty, removeJsonProperty } from './json/edit.js';
export { detectFormatting } from './json/format.js';
export { makeUnifiedDiff } from './diff.js';
export { enforceScope, matchesAnyGlob } from './scope.js';

/** Registry preloaded with the built-in (first-party) operations. */
export function createDefaultRegistry(): OperationRegistry {
  const registry = new OperationRegistry();
  registry.register(addScriptOperation);
  registry.register(removeScriptOperation);
  registry.register(installPackageOperation);
  registry.register(removeDependencyOperation);
  registry.register(setTsconfigOptionOperation);
  return registry;
}

export interface OpenProjectOptions {
  fs?: FileSystem;
  registry?: OperationRegistry;
  runner?: CommandRunner;
}

/** Convenience: build an {@link Engine} for a project root with built-ins registered. */
export function openProject(root: string, options: OpenProjectOptions = {}): Promise<Engine> {
  const deps: EngineDeps = {
    root,
    fs: options.fs ?? new NodeFileSystem(),
    registry: options.registry ?? createDefaultRegistry(),
    runner: options.runner,
  };
  return Engine.create(deps);
}
