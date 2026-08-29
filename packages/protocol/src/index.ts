import type {
  ApplyResult,
  BumpAnalysis,
  CatalogQuery,
  CatalogResult,
  Change,
  ConfigKindSchema,
  ConfigOptionDoc,
  ConfigView,
  Diagnostics,
  FleetApplyResult,
  FleetPlan,
  FleetState,
  FleetTarget,
  Improvement,
  InstallSizes,
  JournalEntry,
  OperationInfo,
  PresetInfo,
  ProjectModel,
  ReleaseNotes,
  Remediation,
  ScaffoldInfo,
  WorkspacePackage,
} from '@apostel/visual-config-core';

/** A scaffoldable tool plus whether it's already set up in this project. */
export type ScaffoldStatus = ScaffoldInfo & { present: boolean };

/** A toolchain preset plus whether applying it would do anything here. */
export type PresetStatus = PresetInfo & { applicable: boolean; reason?: string };

/** One subdirectory in the fleet folder-browser. */
export interface DirEntry {
  name: string;
  path: string;
}

/** A directory's browsable subfolders, for picking a fleet parent folder. */
export interface DirListing {
  path: string;
  /** The parent directory, or undefined at the filesystem root. */
  parent?: string;
  entries: DirEntry[];
}

/** The npm projects a fleet scan turned up under a parent folder. */
export interface FleetDiscovery {
  parent: string;
  projects: FleetTarget[];
}

/** The workspace (monorepo) shape: its members and which one is active. */
export interface WorkspaceInfo {
  /** The workspace root's package name (or undefined if unnamed). */
  rootName?: string;
  /** Member packages resolved from the workspace globs. Empty for a single-package project. */
  packages: WorkspacePackage[];
  /** The active member's dir (relative to root), or '' when the root itself is active. */
  active: string;
}

/** Result of planning an operation, wrapped so the UI gets structured errors. */
export interface PlanResult {
  ok: boolean;
  change?: Change;
  error?: string;
}

/** A launched script task. */
export interface TaskHandle {
  taskId: string;
  script: string;
}

/** Methods the daemon exposes to every face (birpc server functions). */
export interface ServerFunctions {
  getProject(): Promise<ProjectModel>;
  listOperations(): Promise<OperationInfo[]>;
  planOperation(operationId: string, input: unknown): Promise<PlanResult>;
  applyChange(changeId: string): Promise<ApplyResult>;
  undo(entryId: string): Promise<ApplyResult>;
  listJournal(): Promise<JournalEntry[]>;
  runScript(name: string): Promise<TaskHandle>;
  stopScript(taskId: string): Promise<void>;
  searchCatalog(query: CatalogQuery): Promise<CatalogResult>;
  getDiagnostics(): Promise<Diagnostics>;
  getTsconfig(): Promise<TsconfigView>;
  getImprovements(): Promise<Improvement[]>;
  analyzeBump(pkg: string, to?: string): Promise<BumpAnalysis>;
  getChangelog(name: string, from?: string, to?: string): Promise<ReleaseNotes[]>;
  getConfigs(): Promise<ConfigView[]>;
  getConfig(path: string): Promise<ConfigView | undefined>;
  getScaffolds(): Promise<ScaffoldStatus[]>;
  /** Toolchain presets (curated baselines), each flagged for whether it applies here. */
  getPresets(): Promise<PresetStatus[]>;
  /** Per-dependency install-size footprint (unpacked size of each package's own files). */
  getInstallSizes(): Promise<InstallSizes>;
  /** Safe upgrade targets for vulnerable dependencies (apply via fix-vulnerabilities). */
  getRemediation(): Promise<Remediation>;
  /** The workspace members and which one is active (empty members for a single-package project). */
  getWorkspace(): Promise<WorkspaceInfo>;
  /** Switch the active workspace member; pass '' to return to the root. Returns the new active project. */
  setActivePackage(dir: string): Promise<ProjectModel>;

  // --- Cross-repo fan-out ("fleet") ---
  /** List the subfolders of a directory, for picking a parent folder to scan. Defaults to the user's home. */
  fleetBrowse(path?: string): Promise<DirListing>;
  /** Discover npm projects under a parent folder (+ any pinned ones); remembers the parent. */
  fleetDiscover(parent: string, depth?: number): Promise<FleetDiscovery>;
  /** Dry-run one operation across the discovered projects; the plan is held for a following apply. */
  fleetPlan(
    parent: string,
    operationId: string,
    input: unknown,
    depth?: number,
  ): Promise<FleetPlan>;
  /** Apply the plan from the last fleetPlan on this connection. */
  fleetApply(): Promise<FleetApplyResult>;
  /** Pin an npm project the walk can't guess (a monorepo child folder). Returns the new state. */
  fleetPin(path: string): Promise<FleetState>;
  /** Remove a pinned project. Returns the new state. */
  fleetUnpin(path: string): Promise<FleetState>;
  /** The remembered parents and pinned projects. */
  fleetGetState(): Promise<FleetState>;
}

export interface TsconfigView {
  present: boolean;
  options: Record<string, unknown>;
}

/** Methods a face exposes to the daemon (birpc client functions; server-pushed). */
export interface ClientFunctions {
  onProjectChanged(project: ProjectModel): void;
  onTaskOutput(taskId: string, chunk: string): void;
  onTaskExit(taskId: string, code: number): void;
}

/** Config injected into index.html so the SPA can reach its daemon. */
export interface FaceBootstrap {
  wsUrl: string;
  token: string;
}

export type {
  ProjectModel,
  OperationInfo,
  Change,
  ApplyResult,
  JournalEntry,
  CatalogQuery,
  CatalogResult,
  Diagnostics,
  Improvement,
  InstallSizes,
  Remediation,
  BumpAnalysis,
  ReleaseNotes,
  ConfigView,
  ConfigKindSchema,
  ConfigOptionDoc,
  ScaffoldInfo,
  PresetInfo,
  FleetTarget,
  FleetPlan,
  FleetApplyResult,
  FleetState,
  WorkspacePackage,
};
