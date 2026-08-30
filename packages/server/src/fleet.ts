import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  Fleet,
  NodeFileSystem,
  resolveFleetTargets,
  loadFleetState,
  saveFleetState,
  rememberParent,
  pinProject,
  unpinProject,
  openProject,
  type FileSystem,
  type FleetOpener,
  type FleetPlan,
  type FleetApplyResult,
  type FleetState,
} from '@apostel/visual-config-core';
import type { DirListing, FleetDiscovery } from '@apostel/visual-config-protocol';

export interface FleetServiceDeps {
  /** Filesystem for discovery + state (default: the real one). Injected in tests. */
  fs?: FileSystem;
  /** How to open an engine per repo (default: openProject with a per-root journal). */
  open?: FleetOpener;
}

/**
 * The daemon's cross-repo surface. Holds the last plan per connection so a
 * `fleetApply` writes exactly what a preceding `fleetPlan` previewed — the same
 * plan → present → apply-on-confirm contract as the single-repo flow, lifted to
 * many repos. Discovery, state, and the file browser are otherwise stateless.
 */
export function createFleetService(deps: FleetServiceDeps = {}) {
  const fs = deps.fs ?? new NodeFileSystem();
  const open = deps.open ?? ((root: string) => openProject(root));

  let fleet: Fleet | null = null;
  let plan: FleetPlan | null = null;

  return {
    // The file browser lists real directories, so it always uses the OS fs
    // (not the injected one) — it's for picking a folder on this machine.
    async fleetBrowse(path?: string): Promise<DirListing> {
      const dir = path ? resolve(path) : homedir();
      let entries: DirListing['entries'] = [];
      try {
        const dirents = await readdir(dir, { withFileTypes: true });
        entries = dirents
          .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
          .map((e) => ({ name: e.name, path: join(dir, e.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        // Unreadable directory → present it as empty rather than erroring.
      }
      const parent = dirname(dir);
      return { path: dir, parent: parent === dir ? undefined : parent, entries };
    },

    async fleetDiscover(parent: string, depth?: number): Promise<FleetDiscovery> {
      const parentDir = resolve(parent);
      const projects = await resolveFleetTargets(fs, parentDir, depth);
      await saveFleetState(fs, rememberParent(await loadFleetState(fs), parentDir));
      return { parent: parentDir, projects };
    },

    async fleetPlan(
      parent: string,
      operationId: string,
      input: unknown,
      depth?: number,
    ): Promise<FleetPlan> {
      const projects = await resolveFleetTargets(fs, resolve(parent), depth);
      fleet = new Fleet(projects, open);
      plan = await fleet.planAcross(operationId, input);
      return plan;
    },

    async fleetApply(): Promise<FleetApplyResult> {
      if (!fleet || !plan) throw new Error('No fleet plan to apply — run fleetPlan first.');
      const result = await fleet.applyAcross(plan);
      plan = null; // consumed; re-plan before applying again
      return result;
    },

    async fleetPin(path: string): Promise<FleetState> {
      const root = resolve(path);
      if (!(await fs.exists(join(root, 'package.json')))) {
        throw new Error(`No package.json at ${root} — nothing to pin.`);
      }
      const state = pinProject(await loadFleetState(fs), root);
      await saveFleetState(fs, state);
      return state;
    },

    async fleetUnpin(path: string): Promise<FleetState> {
      const state = unpinProject(await loadFleetState(fs), resolve(path));
      await saveFleetState(fs, state);
      return state;
    },

    fleetGetState(): Promise<FleetState> {
      return loadFleetState(fs);
    },
  };
}
