import { join, resolve } from 'node:path';
import {
  NodeFileSystem,
  discoverProjects,
  createFleet,
  loadFleetState,
  saveFleetState,
  rememberParent,
  pinProject,
  type FleetTarget,
  type FleetPlan,
} from '@apostel/visual-config-core';

/**
 * `visual-config fleet <parent> --pin <path>` — pin an npm project the walk
 * can't guess (e.g. a monorepo child folder). Stored in the user's config dir.
 * Returns an exit code (0 ok, 2 the path has no package.json).
 */
export async function pinFleetProject(path: string): Promise<number> {
  const fs = new NodeFileSystem();
  const root = resolve(path);
  if (!(await fs.exists(join(root, 'package.json')))) {
    console.error(`No package.json at ${root} — nothing to pin.`);
    return 2;
  }
  const state = pinProject(await loadFleetState(fs), root);
  await saveFleetState(fs, state);
  console.log(`Pinned ${root}`);
  return 0;
}

export interface FleetCliOptions {
  depth?: number;
  /** Operation id to fan out (dry-run unless `apply`). */
  op?: string;
  /** JSON string for the operation's input. Default `{}`. */
  input?: string;
  /** Actually write the planned changes. Default false (dry-run). */
  apply?: boolean;
  json?: boolean;
}

/**
 * `visual-config fleet <parent>` — discover npm projects under a folder and,
 * optionally, fan one operation across them. Dry-run by default: you see every
 * repo's plan before `--apply` writes anything. Discovery needs no config; the
 * scanned parent and any `--pin`ned projects are remembered in the user's
 * config dir, never in a scanned repo.
 *
 * Returns a process exit code (0 ok, 1 an apply failed, 2 bad input).
 */
export async function runFleet(parent: string, opts: FleetCliOptions = {}): Promise<number> {
  const fs = new NodeFileSystem();
  const parentDir = resolve(parent);

  let input: unknown = {};
  if (opts.op && opts.input) {
    try {
      input = JSON.parse(opts.input);
    } catch {
      console.error(`--input is not valid JSON: ${opts.input}`);
      return 2;
    }
  }

  // Discover under the parent, then fold in globally-pinned projects that still
  // exist and aren't already covered by discovery.
  const discovered = await discoverProjects(fs, parentDir, { depth: opts.depth });
  const state = rememberParent(await loadFleetState(fs), parentDir);
  const seen = new Set(discovered.map((d) => d.root));
  const pinnedTargets: FleetTarget[] = [];
  for (const root of state.pinned) {
    if (seen.has(root)) continue;
    if (await fs.exists(join(root, 'package.json'))) pinnedTargets.push({ root });
  }
  await saveFleetState(fs, state);

  const targets: FleetTarget[] = [
    ...discovered.map((d) => ({ root: d.root, name: d.name })),
    ...pinnedTargets,
  ];

  // No operation → just list what we'd fan out across.
  if (!opts.op) {
    if (opts.json) {
      console.log(JSON.stringify({ parent: parentDir, targets }, null, 2));
    } else if (targets.length === 0) {
      console.log(`No npm projects found under ${parentDir} (try --depth).`);
    } else {
      console.log(`Found ${targets.length} project(s) under ${parentDir}:`);
      for (const t of targets) console.log(`  ${t.name ?? '(unnamed)'}  ${t.root}`);
    }
    return 0;
  }

  const fleet = createFleet(targets);
  const plan = await fleet.planAcross(opts.op, input);

  if (!opts.apply) {
    if (opts.json) {
      console.log(JSON.stringify(planToJson(plan), null, 2));
    } else {
      printPlan(plan);
      console.log(`\n(dry run — re-run with --apply to write ${plan.planned} change(s))`);
    }
    return 0;
  }

  const result = await fleet.applyAcross(plan);
  if (opts.json) {
    console.log(JSON.stringify({ plan: planToJson(plan), result }, null, 2));
  } else {
    printPlan(plan);
    console.log(`\nApplied ${result.applied} change(s), ${result.failed} failed:`);
    for (const e of result.entries) {
      console.log(
        `  ${e.ok ? '✓' : '✗'} ${e.name ?? e.root}${e.ok ? '' : ` — ${e.errors.join('; ')}`}`,
      );
    }
  }
  return result.failed > 0 ? 1 : 0;
}

// Keep the JSON payload stable and light — summaries, not the heavy Change bodies.
function planToJson(plan: FleetPlan): unknown {
  return {
    operationId: plan.operationId,
    planned: plan.planned,
    skipped: plan.skipped,
    entries: plan.entries.map((e) => ({
      root: e.root,
      name: e.name,
      status: e.status,
      summary: e.change?.summary,
      reason: e.reason,
    })),
  };
}

function printPlan(plan: FleetPlan): void {
  console.log(`Fan-out "${plan.operationId}" — ${plan.planned} planned, ${plan.skipped} skipped:`);
  for (const e of plan.entries) {
    if (e.status === 'planned') console.log(`  ✓ ${e.name ?? e.root} — ${e.change?.summary}`);
    else console.log(`  – ${e.name ?? e.root} — ${e.reason}`);
  }
}
