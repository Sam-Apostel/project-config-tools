import { describe, it, expect } from 'vitest';
import { setJsonProperty, removeJsonProperty } from './edit.js';
import { detectFormatting } from './format.js';

describe('detectFormatting', () => {
  it('detects 2-space indent', () => {
    expect(detectFormatting('{\n  "a": 1\n}\n')).toMatchObject({
      insertSpaces: true,
      tabSize: 2,
    });
  });

  it('detects 4-space indent', () => {
    expect(detectFormatting('{\n    "a": 1\n}\n')).toMatchObject({
      insertSpaces: true,
      tabSize: 4,
    });
  });

  it('detects tab indent', () => {
    expect(detectFormatting('{\n\t"a": 1\n}\n')).toMatchObject({ insertSpaces: false });
  });

  it('detects CRLF', () => {
    expect(detectFormatting('{\r\n  "a": 1\r\n}\r\n').eol).toBe('\r\n');
  });
});

describe('setJsonProperty', () => {
  it('adds a nested property preserving 2-space indent and other keys', () => {
    const input = [
      '{',
      '  "name": "demo",',
      '  "scripts": {',
      '    "build": "tsc"',
      '  }',
      '}',
      '',
    ].join('\n');
    const output = setJsonProperty(input, ['scripts', 'test'], 'vitest');
    expect(output).toBe(
      [
        '{',
        '  "name": "demo",',
        '  "scripts": {',
        '    "build": "tsc",',
        '    "test": "vitest"',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('preserves 4-space indentation', () => {
    const input = '{\n    "scripts": {\n        "build": "tsc"\n    }\n}\n';
    const output = setJsonProperty(input, ['scripts', 'test'], 'vitest');
    expect(output).toContain('        "test": "vitest"');
  });

  it('creates intermediate objects when missing', () => {
    const input = '{\n  "name": "demo"\n}\n';
    const output = setJsonProperty(input, ['scripts', 'test'], 'vitest');
    expect(JSON.parse(output).scripts.test).toBe('vitest');
    // original key retained
    expect(JSON.parse(output).name).toBe('demo');
  });

  it('preserves a trailing newline', () => {
    const input = '{\n  "a": 1\n}\n';
    expect(setJsonProperty(input, ['b'], 2).endsWith('}\n')).toBe(true);
  });

  it('preserves absence of a trailing newline', () => {
    const input = '{\n  "a": 1\n}';
    expect(setJsonProperty(input, ['b'], 2).endsWith('}')).toBe(true);
  });

  it('overwrites an existing value in place', () => {
    const input = '{\n  "scripts": {\n    "test": "old"\n  }\n}\n';
    const output = setJsonProperty(input, ['scripts', 'test'], 'new');
    expect(output).toBe('{\n  "scripts": {\n    "test": "new"\n  }\n}\n');
  });

  it('preserves comments in JSONC', () => {
    const input = '{\n  // keep me\n  "a": 1\n}\n';
    const output = setJsonProperty(input, ['b'], 2);
    expect(output).toContain('// keep me');
  });
});

describe('removeJsonProperty', () => {
  it('removes a property preserving siblings and formatting', () => {
    const input = '{\n  "a": 1,\n  "b": 2\n}\n';
    const output = removeJsonProperty(input, ['a']);
    expect(JSON.parse(output)).toEqual({ b: 2 });
  });
});
