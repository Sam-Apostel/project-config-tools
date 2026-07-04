import type {
  ApplyResult,
  BumpAnalysis,
  CatalogQuery,
  CatalogResult,
  Change,
  Diagnostics,
  Improvement,
  JournalEntry,
  OperationInfo,
  ProjectModel,
} from '@visual-config/core';

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
  BumpAnalysis,
};
