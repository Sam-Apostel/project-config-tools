# Roadmap

> From `npx` tool to IDE plugins to agent MCP server. Phased so that each
> milestone is independently useful and each builds on a single shared core.
> Dates are deliberately omitted — this is sequence and scope, not a schedule.

**The one architectural rule that shapes everything:** build a **headless core
library first**, with the web UI, IDE panels, and MCP server as thin clients —
and make **everything a plugin, including the built-ins**, so the plugin API is
dogfooded from line one. If we build UI-first we rewrite to add MCP; if we build
core-first, MCP, IDE reuse, *and* third-party plugins all fall out of the same
foundation. Concrete design in [`spec/`](spec/); see especially
[`spec/00-architecture.md`](spec/00-architecture.md) and
[`spec/02-plugin-api.md`](spec/02-plugin-api.md).

---

## Implementation status (live)

What's built and green on `main` (published to npm under `@apostel/*`; ~98 tests,
typecheck + CI):

- ✅ **Milestone 0 through most of Phase 2**, plus pieces of Phase 5 (the flashy swaps).
- ✅ Monorepo (core, protocol, server, ui, mcp, kit, cli); format-preserving
  write layer with golden tests; Operation→Change→undo engine with enforced scope.
- ✅ Daemon (birpc/ws, token-gated) + **React UI**: Overview, Dependencies,
  **Config**, **TypeScript**, **Catalog**, **Scripts** (run + stop), **History**,
  the Diff Sheet.
- ✅ **Dependency health** — outdated **+ vulnerabilities** (npm advisory DB) **+
  deprecations** (with maintainer-suggested alternatives); a **changelog viewer**
  (GitHub release notes + breaking changes) and **code-aware bump-safety analysis**
  (breaking changes cross-referenced against the app's real usage). Diagnostics are
  **lockfile-exact** — the installed version from `pnpm-lock`/`package-lock`/`yarn.lock`,
  not the range floor — plus a per-package **install-size** footprint and one-click
  **vulnerability remediation** (minimal safe bump per advisory, majors flagged).
- ✅ **Config adapters** — view/edit **Biome / Prettier / ESLint / oxlint / tsconfig**
  as guided forms with curated factual docs; **read-only static views** of JS/TS
  configs (`next.config`, `vite.config`, eslint flat) via `@babel/parser`.
- ✅ **Monorepo / workspaces** — resolves members from `pnpm-workspace.yaml` or the
  npm/yarn `workspaces` field (globs, `!`-exclusions) and a **package switcher**
  re-opens the engine at any member so every view and operation targets it.
- ✅ **Setup & swaps** — `add-config` scaffolds a tool (Prettier/Biome/oxlint) in one
  reviewed step; **`switch-to-biome`** replaces ESLint + Prettier as a single
  reversible Change (deletes configs, prunes deps, swaps scripts).
- ✅ Operations: add/remove script, install/remove/upgrade dependency,
  set-tsconfig-option, set-package-field, set/remove-config-value, add-config,
  switch-to-biome, add-mcp-config.
- ✅ **MCP server** — every operation as a `plan_*` tool, plus `get_project`,
  `get_diagnostics`, `get_changelog`, `get_config`, `analyze_bump`, `apply_change`,
  `undo`; read-only resources; and an **in-session app UI** (MCP Apps / SEP-1865).
  `init-mcp` registers the server in `.mcp.json`/`.cursor`/`.vscode` for discovery.
- ✅ **Plugin system + opinions** — built-ins load as a plugin; third parties add
  operations/detectors; attributed opinion packs contribute recommendations
  (example: `@apostel/visual-config-opinion-ts-strict`).
- ✅ **Release pipeline** — Changesets + GitHub Actions publishing under `@apostel/*`
  via **OIDC Trusted Publishing** (no token), with per-package GitHub Releases.
- ✅ **Headless `check`** — `visual-config check` runs diagnostics with no UI,
  prints a summary or `--json`, and exits non-zero per `--fail-on` (vuln by
  default) — a drop-in CI gate.
- 🔜 Not yet: cross-workspace version alignment, cross-**repo** fan-out, guided
  framework-config _editing_ (AST rewrite), IDE extensions, and the **hosted
  "point at any repo → PR"** flow (the diff playground is live).

---

## Milestone 0 — The thin end-to-end slice (first code)

Before fanning out Phase 0/1, build the **whole spine on the smallest feature**,
so every layer is proven end-to-end and there's something visible fast:

1. Detect the project + parse `package.json` (`@apostel/visual-config-core` + the
   `package-json` adapter).
2. A minimal **React** UI (`@apostel/visual-config-ui`) that lists dependencies and
   scripts, served by the daemon over **birpc/WS** (`@apostel/visual-config-server`,
   `visual-config` CLI).
3. **Run a script** as a button with streamed output.
4. **One mutating Operation** — `add-script` — going the full route:
   `plan()` → **Diff Sheet** (format-preserving edit) → confirm → `apply()` →
   **undo**.

**Exit criteria:** `npx @apostel/visual-config` opens the browser, shows deps/scripts,
runs a script, and adds a script via a confirmed, reversible diff — exercising
core → server → birpc → React UI → Change → journal all at once. Stack:
TypeScript/ESM/Node≥20, pnpm workspaces, Vite, Vitest, React (all decided; see
[`spec/00-architecture.md`](spec/00-architecture.md) §5). Everything after this
widens a proven spine.

---

## Phase 0 — Foundations (the core, invisible to users)

The unglamorous work that everything else depends on. No user-facing feature
ships until the write layer is trustworthy.

- **Project detection:** package manager (npm/pnpm/yarn/bun), workspaces,
  frameworks, which config files exist.
- **Format- & comment-preserving read/write layer** — the crown jewels. JSON/
  JSONC via `jsonc-parser` edit APIs; JS/TS configs via an AST tool
  (`recast`-class) with a **static-subset-only** guarantee and a graceful
  "too dynamic to edit" fallback. **Its own exhaustive test suite from day one**
  — the moment we clobber a comment or reorder keys, trust is gone.
- **The Operation/Change abstraction:** every action is a pure, schema-validated
  operation returning a **previewable, reversible Change** (`plan()` →
  `apply()`), never a direct mutation, with an enforced **scope**. This shape is
  what makes the UI, MCP, plugins, and undo all fall out for free
  ([`spec/01-core-engine.md`](spec/01-core-engine.md)).
- **The plugin host** — a contribution registry, with the first built-in
  features (`package.json`, scripts) written *as plugins* against it. Everything
  after this is a plugin ([`spec/02-plugin-api.md`](spec/02-plugin-api.md)).
- **Local server + RPC contract** (`birpc`-style typed RPC) that every face
  will speak ([`spec/05-mcp-and-rpc.md`](spec/05-mcp-and-rpc.md)).

**Exit criteria:** we can read a project, produce a diff for a trivial change
(add a script) *via a plugin-registered operation*, apply it with a perfect
minimal diff, and undo it.

---

## Phase 1 — `npx @apostel/visual-config`: the browser tool (first public release)

The v0 people actually run. Lead with the dependable, high-value, low-risk
features from the scorecard.

- **`npx @apostel/visual-config`** boots the local server and opens the browser (the proven
  ESLint-Config-Inspector / Nuxt-DevTools delivery pattern), **framework-agnostic
  and with no dev server required** — an unoccupied quadrant (see
  [`PRIOR-ART.md`](PRIOR-ART.md)).
- **`package.json` viewer** — deps, scripts, metadata, workspaces, cleanly laid
  out. *(Scorecard #1 — ship early.)*
- **Scripts as buttons** with live output + stop/restart. *(#5 — ship early.)*
- **Package catalog** — faceted search/filter over the npm registry with types/
  size/downloads/license/maintenance signals; **install = select, never
  free-type**. *(#4 — the delightful differentiator.)*
- **The Diff Sheet** — the signature confirm-before-write surface, used by every
  mutating action. *(Design principle #13 made concrete.)*
- **Dependency health v1** — outdated + vulnerabilities (npm audit / OSV data),
  with **safe patch/minor upgrade** buttons (major/migrate deferred to Phase 2).

**Exit criteria:** a developer opens any JS/TS repo with `npx @apostel/visual-config`, browses
and installs a package, runs a script, and safely bumps a patch-level vuln —
all without touching a terminal command or a config file by hand.

---

## Phase 2 — Depth: understand & improve config

Where the "tell me what could be better" intelligence lands. Each item is
"do one instance impeccably, then fan out."

- **TypeScript panel** — effective config (resolved through `extends`),
  non-default vs unset options (as neutral *facts*). Opinionated suggestions
  ("`strict` off → turn it on") are **not baked in** — they come from installed,
  attributed **opinion packs** (spec 07); the base ships none. `@tsconfig/bases`
  presets remain available as one-click applies. *(#3.)*
- **Opinions system (facts vs. opinions)** — formalize the split: the base
  surfaces only verifiable facts; recommendations arrive via opinion packs a
  user installs, each attributed to a named author. Ships the diagnostic
  `source` classification and the "install a starting point" picker.
  *([`spec/07-opinions.md`](spec/07-opinions.md).)*
- **Distribution — npm first (v1).** Plugins and opinion packs are ordinary npm
  packages, auto-discovered from `devDependencies`, leaning on npm's lockfile/
  registry/audit. The clutter-free data-fetched model (id-list + lock + hosted
  registry) is **deferred** — no `visual-config.lock` spec yet.
  *([`spec/08-registry-and-distribution.md`](spec/08-registry-and-distribution.md).)*
- **Changelog + code-aware bump safety** — for every outdated dep, ingest the
  changelog between installed and target, extract breaking changes, and
  cross-reference them against the app's own usage so the UI (and later an agent)
  can say which major bumps are safe *for this codebase*. High value on its own,
  before any migration runs. *(#2; [`spec/04-migrations.md`](spec/04-migrations.md).)*
- **Migrations (across majors)** — the mechanical part backed by a **codemod**
  (`@next/codemod`, `ng update`, jscodeshift) or, where none exists, a
  maintainer-authored **agent skill** run step-by-step under the Diff Sheet;
  **always end on "review + run your tests."** Honest scoping, never "one-click
  migrate anything." *(#2, the hard half.)*
- **Guided framework config — Next.js first** — forms with inline docs for
  common cases (e.g. `images.remotePatterns`), AST-editing the static subset,
  raw-snippet fallback for dynamic configs. Then fan out (Vite, Astro,
  SvelteKit…) as per-framework adapters. *(#6.)*
- **npm-publish setup** — audit/scaffold `exports`/`files`/provenance/metadata,
  embedding **publint** and **arethetypeswrong** programmatic APIs, with
  `npm-name` availability check for new packages. *(#8.)*

**Exit criteria:** visual-config can explain a project's TS setup with concrete
improvements, guide a real Next.js config edit, and validate a package's
publish-readiness — each with a reviewed diff.

---

## Phase 3 — The MCP server (agents as first-class users)

Nearly free if Phase 0's tool abstraction held. High strategic value — the
clearest moat (no one exposes reversible config *mutations* to agents; see
[`PRIOR-ART.md`](PRIOR-ART.md)).

- **`visual-config mcp`** exposes the same `plan()`/`apply()` tools over stdio/HTTP:
  `list_scripts`, `read_config`, `add_dependency`, `set_tsconfig_option`,
  `add_image_domain`, `swap_linter`, `apply_config_change` — each returning a
  structured diff.
- **Guardrails for agents:** every mutation goes through the same validated,
  format-preserving writer; supervised mode surfaces the agent's proposed diff
  in the same Diff Sheet a human confirms; reversible by default.
- Positioned as the *mutation* surface (vs knip/Socket/Codemod MCPs, which
  report or refactor code, not manage config).

**Exit criteria:** an agent can, through MCP, install a package, add a config
value, and swap a linter — each as a reviewable, reversible diff, using the
identical code path as the human UI.

---

## Phase 4 — Open the plugin API (recruit the ecosystem)

The plugin host exists from Phase 0 (built-ins are already plugins). This phase
*opens and stabilizes it publicly* so tool owners ship their own verticals —
the leverage that lets the tool cover a moving ecosystem the core team can't
track alone. See [`spec/02-plugin-api.md`](spec/02-plugin-api.md).

- **Stabilize + document the contribution API** (`registerConfigEditor`,
  `registerCatalog`, `registerOperation`, `registerImprovement`, `registerDocs`,
  `registerPanel`, `registerMigration`) with `apiVersion` negotiation.
- **Ship the declarative-first path** — a config UI is a schema + doc links, no
  code — plus the sandboxed panel escape hatch for custom UI.
- **Enforce the security model** — plugins mutate only through scoped Operations;
  no direct file/shell access; provenance (first-party vs community) surfaced.
- **Prove it with real plugins** — an `oxc` plugin (oxlint/oxfmt catalog filter,
  config UI, swaps) and a `tanstack`-style plugin (docs + testing/dev-server
  panel), built entirely on the public API. Plugin Operations automatically
  appear as MCP tools.
- **Stand up the hosted marketplace** — the registry index + in-tool browse over
  the Phase-2 loading mechanism, with verified-author badges. Discovery feels
  like the package catalog. *([`spec/08-registry-and-distribution.md`](spec/08-registry-and-distribution.md).)*

**Exit criteria:** a third party can add a config editor, a catalog filter, and
a tool swap for their ecosystem — discoverable in the in-tool marketplace,
installed by a single id (tool-managed or `npm:`), safe by construction, visible
in the browser UI, IDE panel, and MCP server.

---

## Phase 5 — The hard, flashy swaps

The most impressive and most dangerous features, delivered *as plugins* on the
now-public API. Only attempt once the diff/undo infrastructure has earned trust
in Phases 1–3.

- **One-click tooling swaps** — Biome ⇄ ESLint+Prettier, and → oxlint/oxfmt —
  orchestrating the official migrators (`biome migrate`, `@eslint/migrate-config`,
  `@oxlint/migrate`) as **one previewed, reversible transaction**. Be explicit
  and honest that rule translation is **lossy** ("N rules had no equivalent").
  Nail one direction before fanning out. *(#7 — hard but worth it; the unique
  headline feature.)*
- **Absorb the best adjacent ideas:** knip-style unused-dep detection as
  removable cards; taze-style maturity-window filtering on upgrades; updtr-style
  "upgrade-then-run-tests" verification; syncpack-style monorepo version
  alignment.

**Exit criteria:** a user swaps their entire linter/formatter stack in one
reviewed transaction and can undo it cleanly.

---

## Phase 6 — Deep IDE integration

The in-editor panel and the "cleaner workspace" toggle. VS Code first; JetBrains
as a JCEF shell around the same UI/core (see
[`IDE-INTEGRATION.md`](IDE-INTEGRATION.md) and
[`spec/06-ide-surface.md`](spec/06-ide-surface.md)).

- **VS Code extension** — the Phase-1 UI as a **Webview View** (sidebar/panel)
  reusing the core (via the daemon over `asExternalUri`, or `postMessage` as the
  port-less fallback); a `CustomTextEditorProvider` form for `package.json`
  offered under **"Reopen With"** (not forced default); npm scripts via the
  Tasks API; schema intelligence via `jsonValidation`.
- **Cleaner workspace, IDE-native only** — the goal is a calmer file tree, *not*
  hiding state. Default: native **file nesting** under `package.json`. Opt-in:
  collapse from the tree via native `files.exclude` written into visible
  workspace settings, with a persistent "N config files managed · **Reveal in
  Explorer**" affordance and truthful copy ("they stay on disk; git, CI, and
  other tools still see them"). Every "hide" is a standard editor setting the
  user could set themselves — reversible, never touching git/SCM. *(#11 —
  reframed as honest, native decluttering; [`spec/06-ide-surface.md`](spec/06-ide-surface.md).)*
- **Zed** — a thin extension registering `visual-config mcp` as a native context
  server (near-free once the MCP server exists), plus `.zed/tasks.json` for
  scripts and a browser handoff for the UI. Zed *can't* embed our panel
  (Rust→WASM extensions, no webview), so this is MCP + tasks + browser, and it
  ships early precisely because it's cheap. *([`spec/06-ide-surface.md`](spec/06-ide-surface.md) §1a.)*
- **JetBrains (WebStorm/IntelliJ)** — tool window + JCEF embedding the same UI;
  native File Nesting / `TreeStructureProvider`. Last, because it's the heaviest
  lift.

**Exit criteria:** the config panel lives inside VS Code beside the code, driven
by the same core as the browser tool and MCP server, with the cleaner-workspace
toggle available, native, and clearly labeled as a reversible view convenience.

---

## Post-v1 directions

- The **hosted marketplace/registry index** + submission/verification flow and
  scaffolding (`create-visual-config-plugin`), building on the loading mechanism
  from Phase 2. *([`spec/08-registry-and-distribution.md`](spec/08-registry-and-distribution.md).)*
- Monorepo-wide views (version alignment, cross-workspace scripts).
- Deeper supply-chain signals (Socket-style behavioral checks) alongside CVEs.
- Team/shared config policies (opinionated presets a team can enforce).

---

## Open questions (decide before/at v1)

1. **The name.** ✅ Decided: `visual-config` (verified free on npm). A plain
   descriptive package name, not a brand. Runners-up: `configview`, `config-gui`.
2. **Core language & stack.** ✅ Decided: **TypeScript · ESM · Node ≥20**,
   **pnpm-workspaces** monorepo, **Vite** + **Vitest**, **React** SPA. First
   milestone is a **thin end-to-end vertical slice** (see Milestone 0). A Rust
   core is reconsidered only if perf demands. Package graph in
   [`spec/00-architecture.md`](spec/00-architecture.md) §5.1.
3. **How opinionated?** ✅ Resolved: **completely neutral base; opinions are
   installable and attributed.** The base states facts only; recommendations
   come from opinion packs a user installs (Matt Pocock / Vercel / the
   TypeScript team / …). Keeps the maintainer's taste out by default and turns
   opinionation into an ecosystem. See [`spec/07-opinions.md`](spec/07-opinions.md).
   (Remaining sub-question: verification strictness for author attribution.)
4. **Registry data & rate limits** — how much npm/OSV/Bundlephobia data do we
   fetch live vs cache; offline behavior.
5. **The `next.config.js`-is-code boundary** — exactly where we draw the
   static-subset line and how we communicate the fallback.
6. **Trust & telemetry** — a local-first, no-account, no-telemetry stance is a
   differentiator vs Snyk/Socket; confirm we hold it.
7. **Governance** — this repo pushes straight to `main` until v1 (no PRs). Define
   when v1 flips us to a PR/review workflow.
8. **Plugin trust** — community plugins carry npm-package trust. Do we require a
   permission-consent gate for community plugins, sign/verify first-party ones,
   and how far does declarative-only (no shipped code) go before a plugin needs
   the sandboxed-panel escape hatch? ([`spec/02-plugin-api.md`](spec/02-plugin-api.md) §5.)
9. **Bump-safety LLM** — the code-aware migration analysis (spec 04) is best with
   an LLM for prose changelogs. Local-first/no-account is a stated value, so:
   BYO-key/opt-in only, and always degrade to deterministic-plus-"review
   manually" without one?
