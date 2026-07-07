import type { JsonValue } from '../types.js';

/**
 * Curated, *factual* documentation for a single config option: the key exists,
 * its type, its default, and the tool's own description. This is not taste —
 * opinions ("turn this on") still come only from installed packs.
 */
export interface ConfigOptionDoc {
  /** Dotted path into the config object, e.g. "formatter.indentStyle". */
  key: string;
  type: 'boolean' | 'number' | 'string' | 'enum' | 'array' | 'object';
  description: string;
  default?: JsonValue;
  /** Allowed values, for `type: 'enum'`. */
  values?: string[];
}

export interface ConfigKindSchema {
  kind: string;
  title: string;
  docsUrl: string;
  options: ConfigOptionDoc[];
}

/** A read view of one config file: its parsed values plus documented options. */
export interface ConfigView {
  path: string;
  kind: string;
  format: 'json' | 'jsonc' | 'js' | 'ts' | 'yaml' | 'toml';
  present: boolean;
  /** The parsed config object (empty when absent or unparseable). */
  values: Record<string, unknown>;
  /** Documented options for this kind, when known. */
  schema?: ConfigKindSchema;
}

/** A JSON/JSONC config file we know how to view and edit as data. */
export interface KnownJsonConfig {
  path: string;
  kind: string;
  format: 'json' | 'jsonc';
  /** Dotted prefix under which options live (e.g. tsconfig's compilerOptions). */
  optionsAt?: string;
}

/**
 * The editable JSON/JSONC config files the adapter understands. Order matters
 * only for display. Kept in sync with the detector's candidate list.
 */
export const KNOWN_JSON_CONFIGS: KnownJsonConfig[] = [
  { path: 'tsconfig.json', kind: 'tsconfig', format: 'jsonc', optionsAt: 'compilerOptions' },
  { path: 'jsconfig.json', kind: 'jsconfig', format: 'jsonc', optionsAt: 'compilerOptions' },
  { path: 'biome.json', kind: 'biome', format: 'json' },
  { path: 'biome.jsonc', kind: 'biome', format: 'jsonc' },
  { path: '.prettierrc', kind: 'prettier', format: 'json' },
  { path: '.prettierrc.json', kind: 'prettier', format: 'json' },
  { path: '.eslintrc.json', kind: 'eslint-legacy', format: 'json' },
  { path: '.oxlintrc.json', kind: 'oxlint', format: 'json' },
];

/** Exact write-scope for the generic set/remove-config-value operations. */
export const CONFIG_WRITE_SCOPE: string[] = KNOWN_JSON_CONFIGS.map((c) => c.path);

const PRETTIER: ConfigKindSchema = {
  kind: 'prettier',
  title: 'Prettier',
  docsUrl: 'https://prettier.io/docs/en/options',
  options: [
    {
      key: 'printWidth',
      type: 'number',
      default: 80,
      description: 'Line length the printer wraps at.',
    },
    {
      key: 'tabWidth',
      type: 'number',
      default: 2,
      description: 'Number of spaces per indentation level.',
    },
    {
      key: 'useTabs',
      type: 'boolean',
      default: false,
      description: 'Indent with tabs instead of spaces.',
    },
    {
      key: 'semi',
      type: 'boolean',
      default: true,
      description: 'Print semicolons at statement ends.',
    },
    {
      key: 'singleQuote',
      type: 'boolean',
      default: false,
      description: 'Use single quotes instead of double.',
    },
    {
      key: 'quoteProps',
      type: 'enum',
      values: ['as-needed', 'consistent', 'preserve'],
      default: 'as-needed',
      description: 'When to quote object properties.',
    },
    {
      key: 'jsxSingleQuote',
      type: 'boolean',
      default: false,
      description: 'Use single quotes in JSX.',
    },
    {
      key: 'trailingComma',
      type: 'enum',
      values: ['all', 'es5', 'none'],
      default: 'all',
      description: 'Where to print trailing commas in multi-line comma-separated syntax.',
    },
    {
      key: 'bracketSpacing',
      type: 'boolean',
      default: true,
      description: 'Spaces between brackets in object literals.',
    },
    {
      key: 'bracketSameLine',
      type: 'boolean',
      default: false,
      description: 'Put the > of a multi-line HTML/JSX element on the last line instead of alone.',
    },
    {
      key: 'arrowParens',
      type: 'enum',
      values: ['always', 'avoid'],
      default: 'always',
      description: 'Include parentheses around a sole arrow-function parameter.',
    },
    {
      key: 'endOfLine',
      type: 'enum',
      values: ['lf', 'crlf', 'cr', 'auto'],
      default: 'lf',
      description: 'Line-ending style.',
    },
  ],
};

const BIOME: ConfigKindSchema = {
  kind: 'biome',
  title: 'Biome',
  docsUrl: 'https://biomejs.dev/reference/configuration/',
  options: [
    {
      key: 'formatter.enabled',
      type: 'boolean',
      default: true,
      description: 'Enable the formatter.',
    },
    {
      key: 'formatter.indentStyle',
      type: 'enum',
      values: ['tab', 'space'],
      default: 'tab',
      description: 'Whether to indent with tabs or spaces.',
    },
    {
      key: 'formatter.indentWidth',
      type: 'number',
      default: 2,
      description: 'Size of the indentation.',
    },
    {
      key: 'formatter.lineWidth',
      type: 'number',
      default: 80,
      description: 'Line width the formatter wraps at.',
    },
    { key: 'linter.enabled', type: 'boolean', default: true, description: 'Enable the linter.' },
    {
      key: 'linter.rules.recommended',
      type: 'boolean',
      default: true,
      description: 'Enable Biome’s recommended lint rules.',
    },
    {
      key: 'javascript.formatter.quoteStyle',
      type: 'enum',
      values: ['double', 'single'],
      default: 'double',
      description: 'Quote style for JavaScript/TypeScript.',
    },
    {
      key: 'javascript.formatter.semicolons',
      type: 'enum',
      values: ['always', 'asNeeded'],
      default: 'always',
      description: 'When to print semicolons.',
    },
    {
      key: 'organizeImports.enabled',
      type: 'boolean',
      default: true,
      description: 'Sort and organize imports on format.',
    },
  ],
};

const ESLINT_LEGACY: ConfigKindSchema = {
  kind: 'eslint-legacy',
  title: 'ESLint (legacy .eslintrc)',
  docsUrl: 'https://eslint.org/docs/latest/use/configure/configuration-files-deprecated',
  options: [
    {
      key: 'root',
      type: 'boolean',
      default: false,
      description: 'Stop ESLint from looking in parent folders.',
    },
    { key: 'extends', type: 'array', description: 'Configs to inherit from (strings).' },
    { key: 'plugins', type: 'array', description: 'ESLint plugins to load (strings).' },
    { key: 'rules', type: 'object', description: 'Rule name → level/config map.' },
    {
      key: 'env',
      type: 'object',
      description: 'Global environments to enable (e.g. browser, node).',
    },
    {
      key: 'parser',
      type: 'string',
      description: 'Parser to use (e.g. @typescript-eslint/parser).',
    },
    {
      key: 'parserOptions',
      type: 'object',
      description: 'Options passed to the parser (ecmaVersion, sourceType, …).',
    },
  ],
};

const OXLINT: ConfigKindSchema = {
  kind: 'oxlint',
  title: 'oxlint',
  docsUrl: 'https://oxc.rs/docs/guide/usage/linter/config.html',
  options: [
    {
      key: 'categories.correctness',
      type: 'enum',
      values: ['error', 'warn', 'off'],
      default: 'warn',
      description: 'Level for the correctness rule category.',
    },
    { key: 'rules', type: 'object', description: 'Per-rule overrides (rule → level).' },
    { key: 'plugins', type: 'array', description: 'Rule plugins to enable (strings).' },
    { key: 'ignorePatterns', type: 'array', description: 'Glob patterns to ignore (strings).' },
  ],
};

const TSCONFIG: ConfigKindSchema = {
  kind: 'tsconfig',
  title: 'TypeScript (compilerOptions)',
  docsUrl: 'https://www.typescriptlang.org/tsconfig',
  options: [
    {
      key: 'strict',
      type: 'boolean',
      default: false,
      description: 'Enable all strict type-checking options.',
    },
    {
      key: 'noUncheckedIndexedAccess',
      type: 'boolean',
      default: false,
      description: 'Add undefined to indexed access results.',
    },
    {
      key: 'target',
      type: 'string',
      description: 'JS language version for emitted code (e.g. ES2022).',
    },
    { key: 'module', type: 'string', description: 'Module system for emitted code (e.g. ESNext).' },
    {
      key: 'moduleResolution',
      type: 'string',
      description: 'How modules are resolved (e.g. Bundler, NodeNext).',
    },
    {
      key: 'declaration',
      type: 'boolean',
      default: false,
      description: 'Emit .d.ts type declarations.',
    },
    { key: 'sourceMap', type: 'boolean', default: false, description: 'Emit source maps.' },
    {
      key: 'noEmit',
      type: 'boolean',
      default: false,
      description: 'Type-check only, emit nothing.',
    },
    {
      key: 'verbatimModuleSyntax',
      type: 'boolean',
      default: false,
      description: 'Keep import/export syntax exactly as written.',
    },
  ],
};

const SCHEMAS: Record<string, ConfigKindSchema> = {
  prettier: PRETTIER,
  biome: BIOME,
  'eslint-legacy': ESLINT_LEGACY,
  oxlint: OXLINT,
  tsconfig: TSCONFIG,
  jsconfig: { ...TSCONFIG, kind: 'jsconfig', title: 'JavaScript (jsconfig compilerOptions)' },
};

/** Documented options for a config kind, or an empty schema when unknown. */
export function configSchema(kind: string): ConfigKindSchema | undefined {
  return SCHEMAS[kind];
}

/** Look up the known-config spec for a project-relative path. */
export function knownJsonConfig(path: string): KnownJsonConfig | undefined {
  return KNOWN_JSON_CONFIGS.find((c) => c.path === path);
}
