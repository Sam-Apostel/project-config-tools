import { describe, it, expect } from 'vitest';
import { InMemoryFileSystem } from '../fs.js';
import {
  emptyFleetState,
  loadFleetState,
  saveFleetState,
  rememberParent,
  pinProject,
  unpinProject,
} from './state.js';

const PATH = '/cfg/visual-config/fleet.json';

describe('fleet state', () => {
  it('returns empty state when the file is missing or malformed', async () => {
    const fs = new InMemoryFileSystem();
    expect(await loadFleetState(fs, PATH)).toEqual({ parents: [], pinned: [] });
    await fs.writeFile(PATH, 'not json');
    expect(await loadFleetState(fs, PATH)).toEqual({ parents: [], pinned: [] });
  });

  it('round-trips through save/load', async () => {
    const fs = new InMemoryFileSystem();
    const state = { parents: ['/work'], pinned: ['/work/repo/frontend'] };
    await saveFleetState(fs, state, PATH);
    expect(await loadFleetState(fs, PATH)).toEqual(state);
  });

  it('rememberParent moves to front, dedupes, and keeps order', () => {
    let s = emptyFleetState();
    s = rememberParent(s, '/a');
    s = rememberParent(s, '/b');
    s = rememberParent(s, '/a'); // re-scan /a
    expect(s.parents).toEqual(['/a', '/b']);
  });

  it('pins and unpins projects', () => {
    let s = emptyFleetState();
    s = pinProject(s, '/work/repo/frontend');
    s = pinProject(s, '/work/other');
    expect(s.pinned).toEqual(['/work/other', '/work/repo/frontend']);
    s = unpinProject(s, '/work/other');
    expect(s.pinned).toEqual(['/work/repo/frontend']);
  });

  it('drops non-string entries when loading', async () => {
    const fs = new InMemoryFileSystem({
      [PATH]: JSON.stringify({ parents: ['/a', 42, null], pinned: 'nope' }),
    });
    expect(await loadFleetState(fs, PATH)).toEqual({ parents: ['/a'], pinned: [] });
  });
});
