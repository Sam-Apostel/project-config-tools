import { join } from 'node:path';
import type { FileSystem } from '../types.js';
import { discoverProjects } from './discover.js';
import { loadFleetState } from './state.js';
import type { FleetTarget } from './fleet.js';

/**
 * The fan-out target set for a parent folder: everything discovery finds, plus
 * any pinned projects that still exist and aren't already covered. Shared by the
 * daemon and the MCP server so both compute targets identically.
 */
export async function resolveFleetTargets(
  fs: FileSystem,
  parent: string,
  depth?: number,
): Promise<FleetTarget[]> {
  const discovered = await discoverProjects(fs, parent, { depth });
  const state = await loadFleetState(fs);
  const seen = new Set(discovered.map((d) => d.root));
  const pinned: FleetTarget[] = [];
  for (const root of state.pinned) {
    if (!seen.has(root) && (await fs.exists(join(root, 'package.json')))) pinned.push({ root });
  }
  return [...discovered.map((d) => ({ root: d.root, name: d.name })), ...pinned];
}
