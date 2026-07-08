import { join } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import type {
  ApplyResult,
  Change,
  DetectedTool,
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
import { NpmRegistry, type Registry } from './registry/npm.js';
import { searchCatalog, type CatalogQuery, type CatalogResult } from './catalog.js';
import { computeDiagnostics, type Diagnostics } from './diagnostics.js';
import { computeInstallSizes, type InstallSizes } from './project/sizes.js';
import { configSchema, type ConfigView } from './config/schema.js';
import { extractJsConfig } from './config/js-extract.js';
import { scaffoldCatalog, type ScaffoldInfo } from './operations/add-config.js';
import { scanUsage } from './migration/usage.js';
import { analyzeBump } from './migration/analyze.js';
import { GithubChangelogSource } from './migration/changelog.js';
import type { BumpAnalysis, ChangelogSource, ReleaseNotes } from './migration/types.js';
import semver from 'semver';
import {
  PLUGIN_API_VERSION,
  type Detector,
  type Improvement,
  type ImprovementRule,
  type Plugin,
  type PluginContext,
} from './plugin.js';

export interface EngineDeps {
  root: string;
  fs: FileSystem;
  registry: OperationRegistry;
  runner?: CommandRunner;
  npm?: Registry;
  changelog?: ChangelogSource;
  plugins?: Plugin[];
  /** Absolute path to persist the undo journal (kept OUT of the project). */
  journalPath?: string;
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
  private npm: Registry;
  private changelog: ChangelogSource;
  private journalFile?: string;
  private journal = new Journal();
  private pending = new Map<string, Change>();
  private detectors: Detector[] = [];
  private improvementRules: ImprovementRule[] = [];
  private changeSeq = 0;
  private journalSeq = 0;
  private project!: ProjectModel;

  private constructor(deps: EngineDeps) {
    this.root = deps.root;
    this.fs = deps.fs;
    this.registry = deps.registry;
    this.runner = deps.runner ?? new NodeCommandRunner();
    this.npm = deps.npm ?? new NpmRegistry();
    this.changelog = deps.changelog ?? new GithubChangelogSource();
    this.journalFile = deps.journalPath;
  }

  static async create(deps: EngineDeps): Promise<Engine> {
    const engine = new Engine(deps);
    engine.project = await detectProject(engine.fs, engine.root);
    await engine.loadPlugins(deps.plugins ?? []);
    engine.applyDetectors();
    await engine.loadJournal();
    return engine;
  }

  private async loadJournal(): Promise<void> {
    if (!this.journalFile) return;
    try {
      const entries = JSON.parse(await this.fs.readFile(this.journalFile)) as JournalEntry[];
      this.journal.load(entries);
      this.journalSeq = entries.reduce((max, e) => {
        const n = Number(e.id.replace('jrn_', ''));
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);
    } catch {
      /* no journal yet, or unreadable — start fresh */
    }
  }

  private async saveJournal(): Promise<void> {
    if (!this.journalFile) return;
    try {
      await this.fs.writeFile(this.journalFile, JSON.stringify(this.journal.all(), null, 2));
    } catch {
      /* persistence is best-effort; never block an operation on it */
    }
  }

  private async loadPlugins(plugins: Plugin[]): Promise<void> {
    for (const plugin of plugins) {
      if (plugin.apiVersion && plugin.apiVersion > PLUGIN_API_VERSION) {
        // eslint-disable-next-line no-console
        console.warn(
          `Skipping plugin "${plugin.id}": needs API v${plugin.apiVersion}, this build is v${PLUGIN_API_VERSION}`,
        );
        continue;
      }
      const context: PluginContext = {
        project: this.project,
        registerOperation: (op) => this.registry.register(op),
        registerDetector: (detector) => this.detectors.push(detector),
        registerImprovement: (rule) => this.improvementRules.push(rule),
        log: () => undefined,
      };
      await plugin.setup(context);
    }
  }

  private applyDetectors(): void {
    const detected: DetectedTool[] = [];
    for (const detector of this.detectors) {
      try {
        const tool = detector.detect(this.project);
        if (tool) detected.push({ ...tool, pluginId: tool.pluginId ?? detector.id });
      } catch {
        /* a bad detector must not sink detection */
      }
    }
    this.project.detected = detected;
  }

  async refresh(): Promise<ProjectModel> {
    this.project = await detectProject(this.fs, this.root);
    this.applyDetectors();
    return this.project;
  }

  getProject(): ProjectModel {
    return this.project;
  }

  listOperations(): OperationInfo[] {
    return this.registry.list();
  }

  /** Search the npm registry for the package catalog. */
  searchCatalog(query: CatalogQuery): Promise<CatalogResult> {
    return searchCatalog(this.npm, query);
  }

  /** Compute fact-based diagnostics (outdated, deprecated, vulnerable deps). */
  getDiagnostics(): Promise<Diagnostics> {
    return computeDiagnostics(this.project, this.npm);
  }

  /** Per-dependency install-size footprint (unpacked size of each package's own files). */
  getInstallSizes(): Promise<InstallSizes> {
    return computeInstallSizes(this.project, this.npm);
  }

  /**
   * Release notes for `name` between two versions (default: the range floor →
   * latest), so a human or agent can read what actually changed before upgrading.
   * Best-effort: returns [] when the changelog can't be resolved (offline, no
   * GitHub releases, unresolved repo).
   */
  async getChangelog(name: string, from?: string, to?: string): Promise<ReleaseNotes[]> {
    const dep = this.project.dependencies.find((d) => d.name === name);
    const base = from ?? (dep ? semver.minVersion(dep.range)?.version : undefined);
    let target = to;
    if (!target) {
      try {
        target = (await this.npm.latestVersion(name)) ?? undefined;
      } catch {
        /* offline */
      }
    }
    if (!base || !target) return [];
    return this.changelog.fetch(name, base, target);
  }

  /**
   * Is bumping `name` to `to` (default: latest) safe for THIS codebase? Ingests
   * the changelog, extracts breaking changes, and cross-references them against
   * the app's actual usage of the package.
   */
  async analyzeBump(name: string, to?: string): Promise<BumpAnalysis> {
    const dep = this.project.dependencies.find((d) => d.name === name);
    if (!dep) throw new Error(`"${name}" is not a dependency of this project`);
    const from = semver.minVersion(dep.range)?.version;
    if (!from) throw new Error(`Cannot resolve a base version from range "${dep.range}"`);

    const usage = await scanUsage(this.fs, this.root, name);

    let target = to;
    if (!target) {
      try {
        target = (await this.npm.latestVersion(name)) ?? undefined;
      } catch {
        /* offline — handled below */
      }
    }
    if (!target) {
      return {
        package: name,
        from,
        to: from,
        verdict: 'review',
        reasons: [],
        usage,
        unknowns: [],
        notes: ['Could not resolve the latest version (offline?). Review this bump manually.'],
      };
    }

    return analyzeBump({ pkg: name, from, to: target, changelog: this.changelog, usage });
  }

  /**
   * Attributed recommendations from installed opinion packs. The base ships
   * none — this is empty unless an opinion plugin registered rules.
   */
  getImprovements(): Improvement[] {
    const out: Improvement[] = [];
    for (const rule of this.improvementRules) {
      try {
        if (rule.applies(this.project)) out.push(rule.suggest(this.project));
      } catch {
        /* a bad rule must not sink the rest */
      }
    }
    return out;
  }

  /**
   * Read views of every config we can present: editable JSON/JSONC configs (full
   * data views) plus JS/TS configs (read-only, statically extracted).
   */
  async getConfigs(): Promise<ConfigView[]> {
    const shown = this.project.configFiles.filter(
      (f) =>
        (f.editable === 'full' && (f.format === 'json' || f.format === 'jsonc')) ||
        (f.editable === 'static-subset' && (f.format === 'js' || f.format === 'ts')),
    );
    const views = await Promise.all(shown.map((f) => this.getConfig(f.path)));
    return views.filter((v): v is ConfigView => v !== undefined);
  }

  /** Tools that can be scaffolded, flagged by whether they're already set up. */
  getScaffolds(): Array<ScaffoldInfo & { present: boolean }> {
    const paths = new Set(this.project.configFiles.map((f) => f.path));
    return scaffoldCatalog().map((s) => ({ ...s, present: paths.has(s.configPath) }));
  }

  /** A read view of one config file (parsed/extracted values + documented options). */
  async getConfig(path: string): Promise<ConfigView | undefined> {
    const ref = this.project.configFiles.find((f) => f.path === path);
    if (!ref) return undefined;

    let text = '';
    try {
      text = await this.fs.readFile(join(this.root, path));
    } catch {
      return { path, kind: ref.kind, format: ref.format, present: false, values: {} };
    }

    // JS/TS configs are code — statically extract their top-level literals.
    if (ref.format === 'js' || ref.format === 'ts') {
      const { values, dynamicKeys } = extractJsConfig(text);
      return {
        path,
        kind: ref.kind,
        format: ref.format,
        present: true,
        values,
        readOnly: true,
        dynamicKeys,
        schema: configSchema(ref.kind),
      };
    }

    // JSON/JSONC configs are data.
    let values: Record<string, unknown> = {};
    try {
      const parsed = parseJsonc(text) as Record<string, unknown> | undefined;
      if (parsed && typeof parsed === 'object') values = parsed;
    } catch {
      /* unparseable — empty view */
    }
    return {
      path,
      kind: ref.kind,
      format: ref.format,
      present: true,
      values,
      schema: configSchema(ref.kind),
    };
  }

  /** The compilerOptions this project's tsconfig.json literally sets (owned view). */
  async getTsconfig(): Promise<{ present: boolean; options: Record<string, unknown> }> {
    if (!this.project.configFiles.some((f) => f.path === 'tsconfig.json')) {
      return { present: false, options: {} };
    }
    try {
      const text = await this.fs.readFile(join(this.root, 'tsconfig.json'));
      const parsed = parseJsonc(text) as { compilerOptions?: Record<string, unknown> } | undefined;
      return { present: true, options: parsed?.compilerOptions ?? {} };
    } catch {
      return { present: false, options: {} };
    }
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
    await this.saveJournal();
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
    await this.saveJournal();
    await this.refresh();

    const errors =
      entry.ranCommands.length > 0
        ? [`Note: commands were not reversed: ${entry.ranCommands.join(', ')}`]
        : [];
    return { ok: true, changeId: entry.changeId, journalEntryId: entryId, ranCommands: [], errors };
  }
}
