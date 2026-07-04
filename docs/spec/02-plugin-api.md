# Spec 02 — Plugin API

> The plugin system. This is how `visual-config` scales past what any core team
> could build: **tool owners ship their own plugin.** The `oxc` team ships a
> plugin that adds oxlint/oxfmt catalog filters, config UIs, and a swap; the
> TanStack team ships one that adds docs, a dev-server panel, and testing setup.
> Built-in features are themselves first-party plugins with no extra privileges.
> Status: draft. Interfaces are proposed shapes.

Related: [`00-architecture.md`](00-architecture.md) · [`01-core-engine.md`](01-core-engine.md) ·
[`04-migrations.md`](04-migrations.md)

---

## 1. Design goals

1. **A plugin can add a whole vertical** — detection, a config UI, catalog
   entries/filters, docs, improvement suggestions, tool swaps, migrations — for
   one tool or ecosystem, without touching the core.
2. **Declarative first, code when needed.** Most contributions (config forms,
   docs, catalog filters, improvement rules) are *data*: a JSON-Schema-driven
   form spec + doc links. Only advanced UI needs a shipped panel. This keeps the
   common plugin tiny, reviewable, and safe.
3. **Same guardrails as built-ins.** Plugins never write files directly. They
   register Operations that return **Changes**; the core enforces scope, shows
   the Diff Sheet, and journals for undo — identically for built-in and
   community plugins.
4. **One plugin, every face.** A plugin’s contributions surface in the browser
   UI, the IDE panel, and (for its Operations) the MCP server, for free.

## 2. Anatomy of a plugin

A plugin is an npm package with two optional halves:

- **Server half** (runs in the daemon/core, Node): detectors, operations,
  catalog data, improvement rules, docs, migrations. This is where logic lives.
- **UI half** (runs in the browser/webview, sandboxed): only needed for custom
  panels beyond declarative forms. Served by the daemon and loaded as a
  component/iframe (Nuxt-DevTools-style).

Discovery and loading are covered in full by [`08-registry-and-distribution.md`](08-registry-and-distribution.md).
In short: plugins are **selected by id** in a small `visual-config.json` and
loaded either from a **tool-managed location** (default; keeps the project’s
`package.json`/`node_modules` clean) or, opt-in, as a normal npm dependency
(`npm:<pkg>` — auto-loaded when its `package.json` carries the `visual-config`
field / `visual-config-plugin` keyword, the ESLint/Vite-plugin mechanism). The
`visual-config` manifest below describes the package either way.

```jsonc
// a plugin package's package.json
{
  "name": "@oxc/visual-config-plugin",
  "keywords": ["visual-config-plugin"],
  "visual-config": {
    "apiVersion": 1,
    "server": "./dist/plugin.js",     // exports definePlugin(...)
    "ui": "./dist/ui/index.js"        // optional, for custom panels
  }
}
```

## 3. The plugin entry & context

```ts
import { definePlugin } from '@apostel/visual-config-kit';

export default definePlugin({
  id: 'oxc',
  displayName: 'Oxc (oxlint + oxfmt)',
  apiVersion: 1,

  // Called once when the daemon loads the plugin for a project.
  setup(ctx: PluginContext) {
    // register contributions here (all optional)
  },
});
```

`PluginContext` is a typed registry of **contribution points**. Every registrar
is additive and namespaced to the plugin; nothing here can touch the filesystem
except through Operations the core mediates.

```ts
interface PluginContext {
  project: ProjectModelReadonly;           // read-only project view

  registerDetector(d: Detector): void;             // "this project uses X"
  registerConfigEditor(e: ConfigEditor): void;     // a form UI over a config file
  registerCatalog(c: CatalogContribution): void;   // catalog entries + filters/facets
  registerOperation(op: Operation): void;          // an action → Change (see spec 01)
  registerImprovement(rule: ImprovementRule): void;// a "could be better" suggestion
  registerDocs(docs: DocProvider): void;           // docs for options/packages/panels
  registerPanel(panel: PanelContribution): void;   // a custom UI tab (advanced)
  registerMigration(m: MigrationRecipe): void;     // vA→vB / tool→tool (see spec 04)

  // helpers
  http: ScopedFetch;      // network access, gated by the plugin's declared scope
  cache: KeyValueCache;   // daemon-managed, per-plugin
  log: Logger;
}
```

## 4. Contribution points

### 4.1 `registerDetector` — teach the model to see a tool
```ts
interface Detector {
  id: string;
  detect(p: ProjectModelReadonly): DetectedTool | null; // dep present? config file? script?
}
```

### 4.2 `registerConfigEditor` — a form over a config file
The workhorse. Declarative: a schema + field metadata + doc links. The host
renders it with the standard form components (design language §8), so the plugin
ships **no UI code** for the common case.

```ts
interface ConfigEditor {
  id: string;
  fileKind: string;                    // '.oxlintrc.json' | 'tsconfig' | 'next' | …
  match: string | RegExp;              // which files this edits
  // The editable model as JSON-Schema, enriched with UI + doc metadata:
  schema: EnrichedSchema;              // enum options, defaults, groups, help text, doc URLs
  // How a form change becomes a Change — usually the built-in generic writer,
  // but a plugin may customize (e.g. write to a nested key or a JS config).
  toOperation?(patch: JsonPatch): OperationRef; // defaults to the generic set-config Operation
}
```

`EnrichedSchema` is JSON Schema plus `x-vc` annotations: `group`, `docUrl`,
`helpMarkdown`, `severityWhenUnset`, `recommended`, `widget` (`'toggle' |
'select' | 'domain-list' | …`). This is how "add an allowed image domain" gets a
`domain-list` widget with inline Next.js docs, with zero bespoke code.

### 4.3 `registerCatalog` — entries, filters, and facets for the package browser
Exactly the oxc example: contribute curated entries **and** a filter/facet.
```ts
interface CatalogContribution {
  id: string;
  // Curated packages this plugin vouches for (e.g. oxlint, oxfmt, plugins):
  collections?: CatalogCollection[];   // { title: 'Oxc toolchain', packages: [...] }
  // A facet added to the catalog's filter rail:
  facets?: CatalogFacet[];             // e.g. { id:'oxc-compatible', label:'Works with oxc', predicate }
  // Enrich any package card with plugin-specific signals:
  signals?: PackageSignalProvider;     // e.g. "has an oxlint plugin", relevance score
}
```

### 4.4 `registerImprovement` — a suggestion chip
```ts
interface ImprovementRule {
  id: string;
  applies(p: ProjectModelReadonly): boolean;   // e.g. tsconfig.strict !== true
  suggest(p: ProjectModelReadonly): Improvement; // title, why, docUrl, and the fix Operation
  severity: 'info' | 'warn';
}
```
The suggestion’s "fix" is an `OperationRef`, so clicking it opens a pre-filled
Diff Sheet. TanStack could ship rules like "you have Vitest but no
`@tanstack/*` test setup — add it."

### 4.5 `registerDocs` — ambient documentation
```ts
interface DocProvider {
  id: string;
  // Resolve docs for a target: a config option, a package, a panel, a script.
  resolve(target: DocTarget): DocEntry | null; // markdown + source URL + version
}
```
This backs the doc popovers (design language §8.7). TanStack’s plugin resolves
docs for TypeScript setup, its dev server, and testing — surfaced inline where
those options appear, not on a website.

### 4.6 `registerOperation` — an action
Same `Operation` interface as spec 01. This is how a plugin adds swaps,
installs, or config transactions. The oxc plugin registers `swap-to-oxlint` and
`swap-to-oxfmt` Operations that return a fully-previewed multi-file Change.

### 4.7 `registerPanel` — a custom UI tab (advanced, optional)
For UI beyond declarative forms (e.g. TanStack’s dev-server/testing dashboard).
```ts
interface PanelContribution {
  id: string;
  title: string;
  icon: string;                        // Lucide id
  // The UI half provides a component/iframe; it talks to the server half
  // over the same RPC, and to the host via a typed client (design tokens included).
  entry: 'component' | 'iframe';
}
```
Panels run sandboxed (CSP), consume the shared design tokens so they look
native, and reach their server half via scoped RPC — the Nuxt-DevTools tab
model. Declarative contributions are preferred; panels are the escape hatch.

### 4.8 `registerMigration` — vA→vB / tool→tool
Defined in [`04-migrations.md`](04-migrations.md); registered here.

### 4.9 Opinion packs — a restricted, declarative-only plugin class
An **opinion pack** is the most restricted plugin: it contributes *only*
attributed recommendations (pure data, no operations, no code, no network) and
applies them through the core's generic operations. It's the safest thing you
can install and the mechanism behind "neutral base, installable opinions." Full
design — facts vs. opinions, attribution/trust, conflicts — in
[`07-opinions.md`](07-opinions.md).

## 5. Security & trust model

Plugins are npm packages, so they carry npm-package trust — we are explicit
about that and constrain them:

- **No direct file or shell access.** The plugin API exposes *no* `fs` or
  `child_process`. Mutations happen only through registered Operations, whose
  **`scope`** (spec 01 §6) the daemon enforces — a plugin that declares
  `writes: ['.oxlintrc.json']` cannot emit an edit to `package.json`.
- **Network is scoped.** `ctx.http` only reaches hosts the plugin declared;
  everything else is blocked.
- **UI is sandboxed.** Panels run under CSP in an isolated context, same as any
  webview; they can’t reach the host DOM or arbitrary origins.
- **Manifest declares intent.** A plugin’s `visual-config` manifest lists the
  files, commands, and hosts it needs; the host shows this on first load and can
  require consent for community (non-first-party) plugins.
- **Provenance surfaced.** First-party (`@apostel/*`) vs community is
  labeled in the UI. Community plugins that register `breaking`-risk Operations
  get an extra consent gate.
- **Capability, not honor system.** Because built-ins go through the same
  enforced scope, the boundary is real, not documented politeness.

## 6. Versioning & lifecycle

- `apiVersion` is negotiated at load; the host refuses incompatible plugins with
  a clear message rather than crashing.
- Contributions are registered synchronously in `setup`; async work (fetching
  catalog data, docs) happens lazily behind the registrars’ resolve functions.
- Plugins can be enabled/disabled per project in `visual-config.json` (spec 08);
  a disabled plugin contributes nothing and loads no code.

## 7. Worked example A — the `oxc` plugin

> "oxc might be a plugin that provides a filter to packages for oxcfmt and
> oxlint plugins and a visual ui for its configs."

```ts
export default definePlugin({
  id: 'oxc',
  displayName: 'Oxc (oxlint + oxfmt)',
  apiVersion: 1,
  setup(ctx) {
    // 1. Detect usage
    ctx.registerDetector({
      id: 'oxc',
      detect: (p) => hasAnyDep(p, ['oxlint', 'oxfmt']) || hasFile(p, '.oxlintrc.json')
        ? { id: 'oxc', evidence: ['dep/oxlint'] } : null,
    });

    // 2. Visual UI for its configs (declarative form over .oxlintrc.json)
    ctx.registerConfigEditor({
      id: 'oxlint-config',
      fileKind: '.oxlintrc.json',
      match: /\.oxlintrc\.json$/,
      schema: oxlintEnrichedSchema,     // categories, rule toggles, doc URLs to oxc.rs
    });

    // 3. Catalog filter + curated collection
    ctx.registerCatalog({
      id: 'oxc-catalog',
      collections: [{ title: 'Oxc toolchain', packages: ['oxlint', 'oxfmt'] }],
      facets: [{
        id: 'oxlint-plugins',
        label: 'oxlint plugins',
        predicate: (pkg) => pkg.keywords?.includes('oxlint-plugin'),
      }],
    });

    // 4. One-click swaps (Operations → previewed multi-file Change)
    ctx.registerOperation(swapToOxlintOperation);   // wraps `@oxlint/migrate`
    ctx.registerOperation(swapToOxfmtOperation);     // wraps oxfmt prettier-migrate

    // 5. Migration recipes (ESLint→oxlint, Prettier→oxfmt) — see spec 04
    ctx.registerMigration(eslintToOxlintRecipe);
    ctx.registerMigration(prettierToOxfmtRecipe);
  },
});
```

Result for the user: oxlint/oxfmt appear as a curated collection and an
"oxlint plugins" filter in the catalog; `.oxlintrc.json` gets a real form with
oxc.rs docs inline; and "switch to oxlint/oxfmt" becomes a previewed, reversible
Change — all shipped and maintained by the people who own oxc.

## 8. Worked example B — the `tanstack` plugin

> "tanstack might have their plugin that adds docs for typescript, dev server
> and testing stuff."

```ts
export default definePlugin({
  id: 'tanstack',
  displayName: 'TanStack',
  apiVersion: 1,
  setup(ctx) {
    ctx.registerDetector({ id: 'tanstack', detect: detectTanstackPackages });

    // Docs for TS setup, dev server, testing — surfaced inline where relevant
    ctx.registerDocs({
      id: 'tanstack-docs',
      resolve: (target) => tanstackDocIndex.lookup(target), // TS options, Start dev server, Query testing…
    });

    // Config UIs for TanStack Start / Router where config is static
    ctx.registerConfigEditor({ id: 'tanstack-start', fileKind: 'tanstack-start-config', match: /app\.config\.ts$/, schema: startSchema });

    // A dev-server + testing dashboard (custom panel — the escape hatch)
    ctx.registerPanel({ id: 'tanstack-devserver', title: 'TanStack', icon: 'layers', entry: 'component' });

    // Improvement rules ("add recommended testing setup")
    ctx.registerImprovement(recommendTanstackTestingRule);
  },
});
```

Result: TanStack’s own docs appear in the doc popovers for TypeScript, dev
server, and testing options; a dedicated panel hosts their dev-server/testing
UX; and suggestions nudge toward their recommended setup — again, owned and kept
current by the TanStack team, not the core.

## 9. Why this shape

- **Declarative-first** means the 80% case (a config form + docs + a filter) is a
  few dozen lines of data and ships without security review anxiety.
- **Operations-as-the-only-mutation-path** means plugins inherit the Diff Sheet,
  undo, scope enforcement, and MCP exposure automatically — a plugin’s swap is
  as safe and as agent-accessible as a built-in’s.
- **Built-ins are plugins** means we dogfood the exact API third parties use, so
  it can’t rot.
