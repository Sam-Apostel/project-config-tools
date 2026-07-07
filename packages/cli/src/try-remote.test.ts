import { describe, it, expect } from 'vitest';
import { parseRepo } from './try-remote.js';

describe('parseRepo', () => {
  it('accepts owner/repo', () => {
    expect(parseRepo('sindresorhus/got')).toEqual({
      owner: 'sindresorhus',
      repo: 'got',
      url: 'https://github.com/sindresorhus/got.git',
    });
  });

  it('accepts github.com/owner/repo and full https URLs, .git optional', () => {
    expect(parseRepo('github.com/vercel/next.js').owner).toBe('vercel');
    expect(parseRepo('https://github.com/vercel/next.js.git').repo).toBe('next.js');
    expect(parseRepo('https://github.com/acme/store').url).toBe(
      'https://github.com/acme/store.git',
    );
  });

  it('rejects non-repo input', () => {
    expect(() => parseRepo('not-a-repo')).toThrow(/owner\/repo/);
    expect(() => parseRepo('')).toThrow();
  });
});
