# Spec 03 — Config Adapters

> How a specific config file (package.json, tsconfig, eslint.config.js,
> next.config.ts, biome.json, .oxlintrc.json…) is recognized, parsed into an
> editable model, and written back safely. Adapters are the bridge between the
> generic core write layer (spec 01) and the specifics of each file. Built-in
> and plugin-provided adapters implement the same interface. Status: draft.

Related: [`01-core-engine.md`](01-core-engine.md) · [`02-plugin-api.md`](02-plugin-api.md)

---

## 1. The adapter interface

```ts
interface ConfigAdapter {
  id: string;                          // 'package-json' | 'tsconfig' | 'eslint-flat' | 'next' | …
  match(file: ConfigFileRef, p: ProjectModelReadonly): boolean;

  /** Parse the file into a structured, editable document + an editability verdict. */
  read(raw: string, file: ConfigFileRef): ConfigDocument;

  /** The editable model surfaced to forms/operations, as enriched JSON-Schema. */
  schema(doc: ConfigDocument): EnrichedSchema;

  /** Produce a minimal, format-preserving FileEdit for a set of patches, or refuse. */
  write(doc: ConfigDocument, patches: JsonPatch[]): FileEdit | EditRefusal;
}

interface ConfigDocument {
  format: 'json' | 'jsonc' | 'js' | 'ts' | 'yaml' | 'toml';
  editable: 'full' | 'static-subset' | 'read-only';
  model: unknown;                      // normalized, adapter-specific structured view
  source: string;                      // original text (for diffing)
}

interface EditRefusal { refused: true; reason: string; snippet?: string; docUrl?: string; }
```

Adapters never write to disk. `write` returns a `FileEdit` that flows through the
same Operation → Change → Diff Sheet → journal pipeline as everything else.

## 2. Editability tiers

The `editable` verdict is honest and drives the UI:

- **`full`** — pure data files (`package.json`, `tsconfig.json`, `biome.json`,
  `.oxlintrc.json`, `.prettierrc`). JSON/JSONC edited via `jsonc-parser`;
  comments and key order preserved.
- **`static-subset`** — code configs whose exported value is (or contains) a
  **static object literal** (`next.config.ts` returning an object,
  `eslint.config.js` with an array of literal config objects). The adapter edits
  only within the static region via AST (recast-class), and reports which paths
  are editable vs. dynamic.
- **`read-only`** — configs that are genuinely programmatic at the point of
  interest (a `next.config` that composes plugins through a function, spreads an
  imported value, or branches on env). The adapter refuses to write and returns
  the exact snippet + doc link for the user to paste. **Refusing is correct
  behavior**, surfaced as a first-class UI state, not an error.

A single file can be mixed: e.g. `next.config.ts` may be `full` for
`images.remotePatterns` (a static array) but `read-only` for a dynamically
composed `webpack` function. The adapter reports editability *per path*.

## 3. Built-in adapters (first-party plugins)

| Adapter | File(s) | Tier | Notes |
|---|---|---|---|
| `package-json` | `package.json` | full | deps, scripts, metadata, workspaces, exports, publishConfig |
| `tsconfig` | `tsconfig*.json` | full | resolves `extends` chain; exposes effective config + defaults |
| `eslint-flat` | `eslint.config.{js,ts,mjs}` | static-subset | array-of-objects edited by AST; dynamic entries read-only |
| `eslint-legacy` | `.eslintrc.*` | full/RO | offers migration to flat (spec 04) |
| `prettier` | `.prettierrc*`, key in package.json | full | |
| `biome` | `biome.json(c)` | full | |
| `next` | `next.config.{js,ts,mjs}` | mixed | image domains, redirects, env — static subset; functions RO |
| `vite` | `vite.config.{js,ts}` | static-subset | plugins array often dynamic → RO with snippet fallback |
| `npmrc` | `.npmrc` | full | ini format |
| `tsconfig-bases` | (virtual) | — | offers `@tsconfig/*` presets as one-click applies |

Plugins add more via `registerConfigEditor`/adapter registration (spec 02) — an
`oxc` plugin owns `.oxlintrc.json`; a `tanstack` plugin owns `app.config.ts`
where static.

## 4. The effective-config problem (tsconfig, eslint)

Several configs are only meaningful *resolved*: `tsconfig` follows `extends`,
flat ESLint composes arrays and shareable configs. Adapters expose **two
views**:
- **Effective** — the fully-resolved config (what the tool actually runs). Used
  for display, improvement rules, and "what’s non-default".
- **Owned** — what *this file* literally sets (what we can edit here). Edits
  target the owned view; the UI shows how an owned change moves the effective
  result, and warns when a value is inherited from a base (edit there instead,
  with a link).

## 5. Generic form ↔ config binding

Because adapters expose an `EnrichedSchema`, the host’s generic form renderer
(design language §8) can edit *any* adapter’s file with no bespoke UI: schema →
form, form change → `JsonPatch`, patch → `adapter.write` → `FileEdit` → Change.
Plugins get a full config UI by shipping a schema, not a component (spec 02 §4.2).
Custom widgets (a domain-list editor, a rule-severity matrix) are registered
widget types the schema references by name.
