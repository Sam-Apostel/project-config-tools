/**
 * Core domain types for visual-config.
 *
 * The two load-bearing nouns are {@link Operation} (a named, schema-validated
 * capability) and {@link Change} (the previewable, reversible result of planning
 * one). Every mutation in the product flows through this pair. See
 * docs/spec/01-core-engine.md.
 */

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** How much disclosure/gating an action needs. */
export type Risk = 'safe' | 'review' | 'breaking';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** A single, minimal, format-preserving edit to one file. */
export interface FileEdit {
  path: string;
  /** Original text, or null when the file is being created. */
  before: string | null;
  /** New text, or null when the file is being deleted. */
  after: string | null;
  /** Unified diff for display in the Diff Sheet. */
  diff: string;
}

/** A command an operation intends to run, shown verbatim before it executes. */
export interface PlannedCommand {
  /** Human-readable form for display, e.g. `npm install zod`. */
  run: string;
  /** argv executed directly (no shell), e.g. ['npm','install','zod']. Omit for display-only. */
  argv?: string[];
  reason: string;
  /** Working directory relative to the project root (defaults to root). */
  cwd?: string;
  /** Whether to run install lifecycle scripts. Defaults to 'skip' for safety. */
  installScripts?: 'run' | 'skip';
}

export interface ChangeNote {
  level: 'info' | 'warn' | 'danger';
  message: string;
  docUrl?: string;
}

/** The previewable, reversible result of planning an operation. */
export interface Change {
  id: string;
  operationId: string;
  summary: string;
  risk: Risk;
  edits: FileEdit[];
  commands: PlannedCommand[];
  notes: ChangeNote[];
  /** false only when we genuinely cannot undo (rare; always disclosed). */
  reversible: boolean;
}

/** Declares (and, via the engine, bounds) what an operation may touch. */
export interface OperationScope {
  /** Globs of files it may edit, e.g. ['package.json']. */
  writes?: string[];
  runs?: 'none' | 'package-manager' | 'declared';
  network?: 'none' | 'registry';
}

export interface ApplyResult {
  ok: boolean;
  changeId: string;
  journalEntryId?: string;
  ranCommands: string[];
  errors: string[];
}

/** A JSON Schema (kept loose here; validated at the operation boundary). */
export type JSONSchema = Record<string, unknown>;

/**
 * A named, schema-validated capability. Operations implement `plan` only; the
 * engine applies the resulting {@link Change} generically (write edits, run
 * commands, journal), so every operation gets identical apply/undo semantics.
 */
export interface Operation<Input = unknown> {
  id: string;
  title: string;
  summary: string;
  inputSchema: JSONSchema;
  risk: Risk;
  scope: OperationScope;
  /** Read project + input, produce a preview. MUST NOT write files. */
  plan(ctx: OperationContext, input: Input): Promise<Change> | Change;
}

/** Lightweight description of an operation for menus / MCP tool discovery. */
export interface OperationInfo {
  id: string;
  title: string;
  summary: string;
  inputSchema: JSONSchema;
  risk: Risk;
}

/** What an operation's `plan` is handed. */
export interface OperationContext {
  root: string;
  project: ProjectModel;
  /** Read a file by project-relative path (e.g. 'package.json'). */
  readProjectFile(relPath: string): Promise<string>;
  /** Whether a project-relative path exists. */
  fileExists(relPath: string): Promise<boolean>;
  /** Allocate a stable id for a Change. */
  nextChangeId(): string;
}

// ---------------------------------------------------------------------------
// Project model (a derived read of the real files; never authoritative).
// ---------------------------------------------------------------------------

export type DependencyType = 'prod' | 'dev' | 'peer' | 'optional';

export interface DependencyEntry {
  name: string;
  range: string;
  type: DependencyType;
}

export interface ScriptEntry {
  name: string;
  command: string;
}

export interface ConfigFileRef {
  /** Path relative to the project root. */
  path: string;
  kind: string;
  format: 'json' | 'jsonc' | 'js' | 'ts' | 'yaml' | 'toml';
  editable: 'full' | 'static-subset' | 'read-only';
}

/** A tool/framework a detector recognized in the project. */
export interface DetectedTool {
  id: string;
  version?: string;
  /** Why we think so (dep present, config file, script). */
  evidence: string[];
  /** Plugin that claimed it. */
  pluginId?: string;
}

export interface ProjectModel {
  root: string;
  packageManager: PackageManager;
  name?: string;
  version?: string;
  description?: string;
  private?: boolean;
  scripts: ScriptEntry[];
  dependencies: DependencyEntry[];
  configFiles: ConfigFileRef[];
  detected: DetectedTool[];
  workspaces: string[];
}

// ---------------------------------------------------------------------------
// File system abstraction (so the engine is testable without touching disk).
// ---------------------------------------------------------------------------

export interface ReadableFileSystem {
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

export interface FileSystem extends ReadableFileSystem {
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
}
