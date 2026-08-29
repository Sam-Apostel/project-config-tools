import type { Change } from '../types.js';
import type { Engine } from '../engine.js';

/** One repo to fan an operation across. */
export interface FleetTarget {
  root: string;
  name?: string;
}

/** Opens an engine for a project root (injected so this stays cycle- and IO-free). */
export type FleetOpener = (root: string) => Promise<Engine>;

export interface FleetPlanEntry {
  root: string;
  name?: string;
  /** `planned` when the operation produced a Change here; `skipped` when it doesn't apply. */
  status: 'planned' | 'skipped';
  /** The previewed Change (dry-run) when `planned`. */
  change?: Change;
  /** Why this repo was skipped (the operation's own message, e.g. "not in package.json"). */
  reason?: string;
}

export interface FleetPlan {
  operationId: string;
  entries: FleetPlanEntry[];
  planned: number;
  skipped: number;
}

export interface FleetApplyEntry {
  root: string;
  name?: string;
  ok: boolean;
  errors: string[];
}

export interface FleetApplyResult {
  entries: FleetApplyEntry[];
  applied: number;
  failed: number;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Fan one operation across many repos. Each target is its own {@link Engine} at
 * its own root — so each gets its own undo journal (openProject keys the journal
 * by root) and nothing bleeds between repos.
 *
 * The flow mirrors the single-repo one — **plan → present → apply-on-confirm** —
 * lifted to N repos: `planAcross` dry-runs the operation everywhere and returns a
 * Change per repo (repos where it doesn't apply are `skipped`, not errored);
 * `applyAcross` then writes only the repos that planned. Engines are opened once
 * and reused, so the same engine that produced a Change applies it.
 */
export class Fleet {
  private readonly engines = new Map<string, Engine>();

  constructor(
    private readonly targets: FleetTarget[],
    private readonly open: FleetOpener,
  ) {}

  private async engineFor(root: string): Promise<Engine> {
    let engine = this.engines.get(root);
    if (!engine) {
      engine = await this.open(root);
      this.engines.set(root, engine);
    }
    return engine;
  }

  /** Dry-run: plan `operationId` in every repo. Never writes. */
  async planAcross(operationId: string, input: unknown): Promise<FleetPlan> {
    const entries: FleetPlanEntry[] = [];
    for (const target of this.targets) {
      try {
        const engine = await this.engineFor(target.root);
        const change = await engine.plan(operationId, input);
        entries.push({ root: target.root, name: target.name, status: 'planned', change });
      } catch (err) {
        // Operations throw when they don't apply (dep absent, already set, …) —
        // that's a skip, not a fleet-level failure.
        entries.push({
          root: target.root,
          name: target.name,
          status: 'skipped',
          reason: message(err),
        });
      }
    }
    return {
      operationId,
      entries,
      planned: entries.filter((e) => e.status === 'planned').length,
      skipped: entries.filter((e) => e.status === 'skipped').length,
    };
  }

  /** Apply the planned Changes from a {@link FleetPlan}; skipped entries are no-ops. */
  async applyAcross(plan: FleetPlan): Promise<FleetApplyResult> {
    const entries: FleetApplyEntry[] = [];
    for (const entry of plan.entries) {
      if (entry.status !== 'planned' || !entry.change) continue;
      try {
        const engine = await this.engineFor(entry.root);
        const res = await engine.apply(entry.change.id);
        entries.push({ root: entry.root, name: entry.name, ok: res.ok, errors: res.errors });
      } catch (err) {
        entries.push({ root: entry.root, name: entry.name, ok: false, errors: [message(err)] });
      }
    }
    return {
      entries,
      applied: entries.filter((e) => e.ok).length,
      failed: entries.filter((e) => !e.ok).length,
    };
  }
}
