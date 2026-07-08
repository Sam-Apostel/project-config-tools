import { describe, it, expect } from 'vitest';
import { parseFailOn, evaluatePolicy } from './check.js';

describe('parseFailOn', () => {
  it('accepts kind aliases and defaults singulars/plurals to one kind', () => {
    expect([...parseFailOn('vuln')]).toEqual(['vulnerability']);
    expect([...parseFailOn('vulnerabilities')]).toEqual(['vulnerability']);
    expect([...parseFailOn('deprecated,outdated')].sort()).toEqual(['deprecation', 'outdated']);
  });

  it('treats "any"/"all" as every kind and "none" as empty', () => {
    expect([...parseFailOn('any')].sort()).toEqual(['deprecation', 'outdated', 'vulnerability']);
    expect(parseFailOn('none').size).toBe(0);
    expect(parseFailOn('vuln,none').size).toBe(0); // none wins
  });

  it('throws on an unknown token', () => {
    expect(() => parseFailOn('nonsense')).toThrow(/Unknown --fail-on/);
  });
});

describe('evaluatePolicy', () => {
  const counts = { vulnerability: 2, deprecation: 1, outdated: 8 };

  it('fails only on the selected kinds that are present', () => {
    expect(evaluatePolicy(counts, parseFailOn('vuln'))).toEqual({
      ok: false,
      reasons: ['2 vulnerabilities'],
    });
    expect(evaluatePolicy(counts, parseFailOn('any')).reasons).toEqual([
      '2 vulnerabilities',
      '1 deprecated dependency',
      '8 outdated dependencies',
    ]);
  });

  it('passes when the gated kind is absent, or nothing is gated', () => {
    expect(
      evaluatePolicy({ vulnerability: 0, deprecation: 3, outdated: 0 }, parseFailOn('vuln')),
    ).toEqual({ ok: true, reasons: [] });
    expect(evaluatePolicy(counts, parseFailOn('none'))).toEqual({ ok: true, reasons: [] });
  });
});
