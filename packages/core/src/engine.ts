import { join } from 'node:path';
import type {
  ApplyResult,
  Change,
  FileSystem,
  OperationContext,
  OperationInfo,
  ProjectModel,
} from './types.js';
import { OperationRegistry } from './operations/registry.js';
import { Journal, type Actor, type JournalEntry } from './journal.js';
import { detectProject } from './project/detect.js';
import { enforceScope } from './scope.js';
import { NodeCommandRunner, type CommandRunner, type RunOptions } from './runner.js';

export interface EngineDeps {
  root: string;
  fs: FileSystem;
  registry: OperationRegistry;
  runner?: CommandRunner;
}

/**
 * The headless engine: holds the project model, plans operations into Changes,
 * applies them (the only place writes happen), and journals for undo.
 */
export class Engine {
  readonly root: string;
  private fs: FileSystem;
  private registry: OperationRegistry;
  private runner: CommandRunner;
  private journal = new Journal();
  private pending = new Map<string, Change>();
  private changeSeq = 0;
  private journalSeq = 0;
  private project!: ProjectModel;

  private constructor(deps: EngineDeps) {
    this.root = deps.root;
    this.fs = deps.fs;
    this.registry = deps.registry;
    this.runner = deps.runner ?? new NodeCommandRunner();
  }

  static async create(deps: EngineDeps): Promise<Engine> {
    const engine = new Engine(deps);
    await engine.refresh();
    return engine;
  }

  async refresh(): Promise<ProjectModel> {
    this.project = await detectProject(this.fs, this.root);
    return this.project;
  }

  getProject(): ProjectModel {
    return this.project;
  }

  listOperations(): OperationInfo[] {
    return this.registry.list();
  }

  private makeContext(): OperationContext {
    return {
      root: this.root,
      project: this.project,
      readProjectFile: (rel) => this.fs.readFile(join(this.root, rel)),
      fileExists: (rel) => this.fs.exists(join(this.root, rel)),
      nextChangeId: () => `chg_${++this.changeSeq}`,
    };
  }

  /** Plan an operation into a previewable Change. Never writes. */
  async plan(operationId: string, input: unknown): Promise<Change> {
    const op = this.registry.get(operationId);
    if (!op) throw new Error(`Unknown operation: ${operationId}`);
    const change = await op.plan(this.makeContext(), input);
    enforceScope(change, op.scope);
    this.pending.set(change.id, change);
    return change;
  }

  getPendingChange(changeId: string): Change | undefined {
    return this.pending.get(changeId);
  }

  /** Apply a previously-planned Change: write edits, run commands, journal. */
  async apply(changeId: string, actor: Actor = 'user'): Promise<ApplyResult> {
    const change = this.pending.get(changeId);
    if (!change) {
      return {
        ok: false,
        changeId,
        ranCommands: [],
        errors: [`Unknown or already-applied change: ${changeId}`],
      };
    }

    const errors: string[] = [];

    for (const edit of change.edits) {
      const abs = join(this.root, edit.path);
      if (edit.after === null) await this.fs.deleteFile(abs);
      else await this.fs.writeFile(abs, edit.after);
    }

    const ranCommands: string[] = [];
    for (const cmd of change.commands) {
      if (!cmd.argv || cmd.argv.length === 0) continue;
      const opts: RunOptions = { cwd: join(this.root, cmd.cwd ?? '.') };
      try {
        const result = await this.runner.run(cmd.argv, opts);
        ranCommands.push(cmd.run);
        if (result.code !== 0) errors.push(`Command exited ${result.code}: ${cmd.run}`);
      } catch (err) {
        errors.push(`Command error (${cmd.run}): ${(err as Error).message}`);
      }
    }

    const entry: JournalEntry = {
      id: `jrn_${++this.journalSeq}`,
      changeId,
      operationId: change.operationId,
      actor,
      appliedAt: Date.now(),
      summary: change.summary,
      edits: change.edits,
      ranCommands,
      undone: false,
    };
    this.journal.add(entry);
    this.pending.delete(changeId);
    await this.refresh();

    return { ok: errors.length === 0, changeId, journalEntryId: entry.id, ranCommands, errors };
  }

  listJournal(): JournalEntry[] {
    return this.journal.list();
  }

  /** Reverse a journalled Change's file edits. Commands are not time-travelled. */
  async undo(entryId: string): Promise<ApplyResult> {
    const entry = this.journal.get(entryId);
    if (!entry) {
      return {
        ok: false,
        changeId: '',
        ranCommands: [],
        errors: [`Unknown journal entry: ${entryId}`],
      };
    }
    if (entry.undone) {
      return { ok: false, changeId: entry.changeId, ranCommands: [], errors: ['Already undone'] };
    }

    for (const edit of entry.edits) {
      const abs = join(this.root, edit.path);
      if (edit.before === null) await this.fs.deleteFile(abs);
      else await this.fs.writeFile(abs, edit.before);
    }

    this.journal.markUndone(entryId);
    await this.refresh();

    const errors =
      entry.ranCommands.length > 0
        ? [`Note: commands were not reversed: ${entry.ranCommands.join(', ')}`]
        : [];
    return { ok: true, changeId: entry.changeId, journalEntryId: entryId, ranCommands: [], errors };
  }
}
