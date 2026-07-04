import { describe, it, expect } from 'vitest';
import { matchesAnyGlob, enforceScope } from './scope.js';
import type { Change } from './types.js';

function change(partial: Partial<Change>): Change {
  return {
    id: 'c1',
    operationId: 'op',
    summary: '',
    risk: 'safe',
    edits: [],
    commands: [],
    notes: [],
    reversible: true,
    ...partial,
  };
}

describe('matchesAnyGlob', () => {
  it('matches exact paths', () => {
    expect(matchesAnyGlob('package.json', ['package.json'])).toBe(true);
  });
  it('matches a single-segment star', () => {
    expect(matchesAnyGlob('a.json', ['*.json'])).toBe(true);
  });
  it('does not let a single star cross a slash', () => {
    expect(matchesAnyGlob('a/b.json', ['*.json'])).toBe(false);
  });
  it('matches a globstar across slashes', () => {
    expect(matchesAnyGlob('a/b/c.json', ['**/*.json'])).toBe(true);
  });
  it('returns false when nothing matches', () => {
    expect(matchesAnyGlob('package.json', ['tsconfig.json'])).toBe(false);
  });
});

describe('enforceScope', () => {
  it('throws when an edit is outside the declared writes', () => {
    const c = change({ edits: [{ path: 'secrets.env', before: null, after: 'x', diff: '' }] });
    expect(() => enforceScope(c, { writes: ['package.json'] })).toThrow(
      /outside its declared scope/,
    );
  });

  it('allows an in-scope edit', () => {
    const c = change({ edits: [{ path: 'package.json', before: '{}', after: '{}', diff: '' }] });
    expect(() => enforceScope(c, { writes: ['package.json'] })).not.toThrow();
  });

  it('blocks a command when runs is none', () => {
    const c = change({ commands: [{ run: 'npm install', reason: 'x' }] });
    expect(() => enforceScope(c, { writes: [], runs: 'none' })).toThrow(/run a command/);
  });

  it('permits a command when runs allows it', () => {
    const c = change({ commands: [{ run: 'npm install', argv: ['npm', 'install'], reason: 'x' }] });
    expect(() => enforceScope(c, { writes: [], runs: 'package-manager' })).not.toThrow();
  });
});
