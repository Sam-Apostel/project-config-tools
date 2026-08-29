import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FileSystem } from '../types.js';

/**
 * Cross-repo "fleet" state — the parent folders the user has scanned and any
 * projects they pinned by hand (the monorepo-child case the walk can't guess).
 *
 * This is **user-global app state, not project config**: it lives in the user's
 * config dir, never in a scanned repo, so pointing the tool at a folder never
 * drops a file into it. Same spirit as the undo journal — outside the project,
 * so the "files are the only source of truth" invariant (about the *project*
 * model) still holds.
 */
export interface FleetState {
  /** Parent folders scanned, most-recent first. */
  parents: string[];
  /** Project roots the user pinned manually (dirs with a package.json). */
  pinned: string[];
}

const MAX_ENTRIES = 50;

export function emptyFleetState(): FleetState {
  return { parents: [], pinned: [] };
}

/** Where the fleet state file lives (honors `XDG_CONFIG_HOME`). */
export function fleetStatePath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'visual-config', 'fleet.json');
}

function sanitize(list: unknown): string[] {
  return Array.isArray(list)
    ? list.filter((s): s is string => typeof s === 'string').slice(0, MAX_ENTRIES)
    : [];
}

export async function loadFleetState(
  fs: FileSystem,
  path: string = fleetStatePath(),
): Promise<FleetState> {
  try {
    const raw = JSON.parse(await fs.readFile(path)) as Partial<FleetState>;
    return { parents: sanitize(raw.parents), pinned: sanitize(raw.pinned) };
  } catch {
    return emptyFleetState();
  }
}

export async function saveFleetState(
  fs: FileSystem,
  state: FleetState,
  path: string = fleetStatePath(),
): Promise<void> {
  await fs.writeFile(path, JSON.stringify(state, null, 2) + '\n');
}

/** Move `value` to the front, deduped, capped. */
function bumpFront(list: string[], value: string): string[] {
  return [value, ...list.filter((v) => v !== value)].slice(0, MAX_ENTRIES);
}

export function rememberParent(state: FleetState, parent: string): FleetState {
  return { ...state, parents: bumpFront(state.parents, parent) };
}

export function pinProject(state: FleetState, root: string): FleetState {
  return { ...state, pinned: bumpFront(state.pinned, root) };
}

export function unpinProject(state: FleetState, root: string): FleetState {
  return { ...state, pinned: state.pinned.filter((p) => p !== root) };
}
