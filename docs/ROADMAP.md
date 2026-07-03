# Roadmap

> From `npx` tool to IDE plugins to agent MCP server. Phased so that each
> milestone is independently useful and each builds on a single shared core.
> Dates are deliberately omitted — this is sequence and scope, not a schedule.

**The one architectural rule that shapes everything:** build a **headless core
library first**, with the web UI, IDE panels, and MCP server as thin clients.
If we build UI-first we rewrite to add MCP; if we build core-first, MCP and IDE
reuse are nearly free. See [`ANALYSIS.md`](ANALYSIS.md) §"My opinion" and
[`IDE-INTEGRATION.md`](IDE-INTEGRATION.md) §"shared-core architecture."

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
- **The tool abstraction:** every operation is a pure, schema-validated function
  returning a **previewable diff** (`plan()` → `apply()`), never a direct
  mutation. This shape is what makes the UI, MCP, and undo all fall out for free.
- **Local server + RPC contract** (`birpc`-style typed RPC) that every face
  will speak.

**Exit criteria:** we can read a project, produce a diff for a trivial change
(add a script), apply it with a perfect minimal diff, and undo it.

---

## Phase 1 — `npx facet`: the browser tool (first public release)

The v0 people actually run. Lead with the dependable, high-value, low-risk
features from the scorecard.

- **`npx facet`** boots the local server and opens the browser (the proven
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

**Exit criteria:** a developer opens any JS/TS repo with `npx facet`, browses
and installs a package, runs a script, and safely bumps a patch-level vuln —
all without touching a terminal command or a config file by hand.

---

## Phase 2 — Depth: understand & improve config

Where the "tell me what could be better" intelligence lands. Each item is
"do one instance impeccably, then fan out."

- **TypeScript panel** — effective config (resolved through `extends`),
  non-default vs unset options, and a **curated improvement-rules engine**
  ("`strict` off → recommend on"), with `@tsconfig/bases` presets as one-click
  applies. *(#3.)*
- **Migrations (across majors)** — detect the major jump, surface the migration
  guide + any published codemod (`@next/codemod`, `ng update`, jscodeshift),
  run it behind a diff, and **always end on "review + run your tests."** Honest
  scoping, never "one-click migrate anything." *(#2, the hard half.)*
- **Guided framework config — Next.js first** — forms with inline docs for
  common cases (e.g. `images.remotePatterns`), AST-editing the static subset,
  raw-snippet fallback for dynamic configs. Then fan out (Vite, Astro,
  SvelteKit…) as per-framework adapters. *(#6.)*
- **npm-publish setup** — audit/scaffold `exports`/`files`/provenance/metadata,
  embedding **publint** and **arethetypeswrong** programmatic APIs, with
  `npm-name` availability check for new packages. *(#8.)*

**Exit criteria:** Facet can explain a project's TS setup with concrete
improvements, guide a real Next.js config edit, and validate a package's
publish-readiness — each with a reviewed diff.

---

## Phase 3 — The MCP server (agents as first-class users)

Nearly free if Phase 0's tool abstraction held. High strategic value — the
clearest moat (no one exposes reversible config *mutations* to agents; see
[`PRIOR-ART.md`](PRIOR-ART.md)).

- **`facet mcp`** exposes the same `plan()`/`apply()` tools over stdio/HTTP:
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

## Phase 4 — The hard, flashy swaps

The most impressive and most dangerous features. Only attempt once the diff/
undo infrastructure has earned trust in Phases 1–3.

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

## Phase 5 — Deep IDE integration

The in-editor panel and the (honestly-scoped) file-hiding toggle. VS Code first;
JetBrains as a JCEF shell around the same UI/core (see
[`IDE-INTEGRATION.md`](IDE-INTEGRATION.md)).

- **VS Code extension** — the Phase-1 UI as a **Webview View** (sidebar/panel)
  reusing the core via `postMessage`; a `CustomTextEditorProvider` form for
  `package.json` offered under **"Reopen With"** (not forced default); npm
  scripts via the Tasks API; schema intelligence via `jsonValidation`.
- **File decluttering** — nesting config under `package.json` (default,
  low-risk) and an **explicit, off-by-default "hide config files" toggle** with
  a persistent "N config files managed · Reveal in Explorer" affordance and a
  clear "these still exist on disk / git still sees them" disclosure. *(#11 —
  scoped with honesty; the weakest part of the vision, shipped as a view
  preference, not a false abstraction.)*
- **JetBrains (WebStorm/IntelliJ)** — tool window + JCEF embedding the same UI;
  `TreeStructureProvider` for cleaner view-nesting. Last, because it's the
  heaviest lift.

**Exit criteria:** the config panel lives inside VS Code beside the code, driven
by the same core as the browser tool and MCP server, with file-hiding available
and clearly labeled as a view-only convenience.

---

## Post-v1 directions

- More framework adapters; community-contributed improvement rules and config
  forms (a plugin API mirroring Nuxt DevTools' tab model).
- Monorepo-wide views (version alignment, cross-workspace scripts).
- Deeper supply-chain signals (Socket-style behavioral checks) alongside CVEs.
- Team/shared config policies (opinionated presets a team can enforce).

---

## Open questions (decide before/at v1)

1. **The name.** `facet` availability on npm is **unverified** — confirm before
   committing; see [`DESIGN-LANGUAGE.md`](DESIGN-LANGUAGE.md) for backups.
2. **Core language.** TS is the pragmatic choice (ecosystem, AST tooling,
   shared with the UI). A Rust core (Biome-style) would be faster and reusable
   but slower to build and harder to share types with the web UI. **Lean TS**
   unless perf demands otherwise.
3. **How opinionated?** Do we *recommend* a stack (nudging toward, say, Biome or
   strict TS) or stay strictly neutral? Recommendations add value but risk
   alienating users — probably "neutral defaults, opt-in opinions."
4. **Registry data & rate limits** — how much npm/OSV/Bundlephobia data do we
   fetch live vs cache; offline behavior.
5. **The `next.config.js`-is-code boundary** — exactly where we draw the
   static-subset line and how we communicate the fallback.
6. **Trust & telemetry** — a local-first, no-account, no-telemetry stance is a
   differentiator vs Snyk/Socket; confirm we hold it.
7. **Governance** — this repo pushes straight to `main` until v1 (no PRs). Define
   when v1 flips us to a PR/review workflow.
