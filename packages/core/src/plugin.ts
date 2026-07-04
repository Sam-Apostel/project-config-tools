import type { DetectedTool, Operation, ProjectModel } from './types.js';

/** A detector teaches the project model to recognize a tool/framework. */
export interface Detector {
  id: string;
  detect(project: ProjectModel): DetectedTool | null;
}

/**
 * The typed contribution registry handed to a plugin's `setup`. This is the
 * only surface a plugin gets — no filesystem, no shell. Mutations happen only
 * through registered {@link Operation}s the engine mediates. (First pass:
 * operations + detectors; more contribution points to come — see
 * docs/spec/02-plugin-api.md.)
 */
export interface PluginContext {
  /** Read-only snapshot of the project at load time. */
  readonly project: ProjectModel;
  registerOperation<I>(operation: Operation<I>): void;
  registerDetector(detector: Detector): void;
  log(message: string): void;
}

/** A plugin: an npm package (or built-in) that contributes against the API. */
export interface Plugin {
  id: string;
  displayName?: string;
  apiVersion?: number;
  setup(context: PluginContext): void | Promise<void>;
}

/** The plugin API version this build implements. */
export const PLUGIN_API_VERSION = 1;
