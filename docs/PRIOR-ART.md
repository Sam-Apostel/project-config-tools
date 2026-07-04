# Prior Art & Competitive Landscape

> What already exists in this space, how it's delivered, whether it's alive,
> and precisely where visual-config is different. Researched July 2026.

**Bottom line up front:** the market is a field of sharp, single-purpose
tools. **No existing project combines** (a) a visual dashboard over your real
config, (b) *form-based editing* across multiple tools, (c) one-click tooling
swaps, and (d) an MCP surface for agents. The delivery pattern visual-config wants —
"`npx` opens a local web UI that sits on top of an existing config file" — is
**already validated and loved** (ESLint Config Inspector), and the
dependency-dashboard variant is **validated but abandoned** (npm-gui). The gap
is real and the template exists.

---

## The closest precedents (study these hardest)

### ESLint Config Inspector — `@eslint/config-inspector` ⭐ the architectural template
- **What:** Official ESLint tool to *visually inspect* a flat config — resolved
  rules, which config enables/overrides each, file-pattern matching,
  deprecated-rule flags, coverage.
- **Delivery:** `npx @eslint/config-inspector` boots a **local web server**
  (:7777) rendering a web app that reads your live config and hot-reloads.
  Can also `--build` a static SPA.
- **Alive?** Yes — first-party ESLint, extremely active (commits on the day of
  this research). Originated by antfu.
- **Gap visual-config fills:** it is **read-only**, **ESLint-only**, and has **no MCP**.
  visual-config generalizes this exact, proven UX to *editable* forms across *many*
  tools, plus an agent surface. This is the pattern to emulate and expand.
- https://github.com/eslint/config-inspector

### npm-gui — the abandoned dashboard niche
- **What:** Browser GUI to manage `package.json` deps (install/update/remove/
  search) across npm/pnpm/yarn, with package scoring.
- **Delivery:** `npx npm-gui@latest` → opens in browser. **The single closest
  delivery-model match to visual-config.**
- **Alive?** **No** — last commit Sept 2023 (~669★). Effectively abandoned.
- **Gap visual-config fills:** purely dependency-focused — no vuln→migrate, no config
  forms, no swaps, no MCP. Its abandonment is a market opening visual-config can
  reclaim and vastly expand.
- https://github.com/q-nick/npm-gui

### Nuxt DevTools — the in-IDE + browser architecture template
- **What:** A full devtools panel (routes, components, modules, assets,
  timeline) for Nuxt apps.
- **Delivery:** a local server + an iframe UI shown **both** in-browser and
  **embedded in VS Code** via a webview. This is the exact "one engine, many
  faces (browser + IDE)" architecture visual-config needs.
- **Alive?** Yes — very active, first-party Nuxt.
- **Gap visual-config fills:** Nuxt-specific and runtime-app-focused, not config. But
  its `devtools-kit` / server+iframe approach is the blueprint for visual-config's
  Phase 3 IDE embedding. Study it before building the panel.

---

## Dependency management & upgrades

| Tool | What | Delivery | Alive? | Gap visual-config fills |
|---|---|---|---|---|
| **taze** | Modern update checker w/ interactive selection, monorepo-aware, **maturity-period** filtering (skip too-new releases) | CLI + TUI (`npx taze`) | ✅ active (~4.2k★, antfu) | Terminal-only, updates-only. visual-config's visual upgrade flow competes directly — *adopt taze's maturity-window safety idea.* |
| **npm-check-updates (ncu)** | The de-facto "bump everything" tool; rewrites `package.json` ranges | CLI | ✅ very active | No UI, no vuln context, no migration guidance, no safety gating. visual-config wraps this class of action behind a diff. |
| **npm-check** | Interactive outdated/unused checker | CLI/TUI | ⚠️ largely stale | Terminal-only, dated. |
| **knip** | Finds unused files/deps/exports (successor to depcheck) | CLI + VS Code ext + LSP + **`@knip/mcp`** | ✅ very active (~11.7k★) | Report-oriented, not a management surface. Notably *does* ship an MCP — a signal the agent angle is live. visual-config can surface knip's findings. |
| **depcheck** | Unused-dependency finder | CLI | ❌ **archived** June 2025 (README points to knip) | Dead; superseded. |
| **npkill** | Find/delete heavy `node_modules` | Interactive TUI | ✅ active (~9.4k★) | Disk cleanup only; the one tool here with genuine checkbox selection UX. |
| **syncpack** | Keep dependency versions consistent across a monorepo | CLI | ✅ active | Monorepo version-consistency only. Good candidate to embed for workspaces. |

## Version/size intel in the editor (validates the IDE phase)

| Tool | What | Delivery | Alive? | Gap |
|---|---|---|---|---|
| **Version Lens** | Inline latest/available versions + one-click bump in manifests | VS Code ext | ✅ active on GitLab (~1M+ installs) | Editor gutter only, read-oriented, versions only. Proves demand for visual-config's IDE phase. |
| **Import Cost** | Inline bundle size per import | VS Code ext | ⚠️ stale (last push 2024) | Signal-only, no actions. visual-config shows size as one of many catalog signals. |
| **npm Intellisense** | Autocomplete module names in imports | VS Code ext | ⚠️ low-activity | Autocomplete only. |

## Security & vulnerability

| Tool | What | Delivery | Alive? | Gap / relationship |
|---|---|---|---|---|
| **npm audit** | Built-in advisory scan against the npm advisory DB | CLI (JSON output) | ✅ first-party | A **data source** for visual-config's vuln view, not a UI. |
| **OSV.dev** | Google's open vulnerability DB + API, cross-ecosystem | API | ✅ active | Primary **data source** for advisories keyed to version ranges. |
| **GitHub Advisory DB** | Curated advisories powering Dependabot | API | ✅ active | **Data source.** |
| **Socket.dev** | Supply-chain risk (install scripts, obfuscation, network, typosquats) beyond CVEs | App + GitHub bot + CLI + API | ✅ active, well-funded | Overlaps visual-config's *install-time safety* goal. Could be a signal source; also the most serious adjacent commercial player on "package trust." |
| **Snyk** | Commercial vuln scanning + fix PRs | SaaS + CLI + IDE | ✅ commercial | Enterprise SaaS, not a local config surface. Different market; overlaps on "vuln → fix." |
| **npq** | "Safer `npm install`" — pre-install audit (install scripts, age, downloads, advisories) then hands off | CLI wrapper | ✅ active (ships an `AGENTS.md`) | Install-time CLI gating, not visual. A candidate **data source** for visual-config's catalog trust signals. |
| **Renovate** | Automated dependency-update PRs, deeply configurable | App/self-host bot | ✅ active (Mend) | Async, PR-based, CI-oriented. Complementary — visual-config is the *interactive local* surface; Renovate is the *unattended background* one. |
| **Dependabot** | GitHub-native update + security PRs | GitHub-hosted | ✅ first-party | Same complementary story as Renovate. |
| **audit-ci** | Fails CI on audits above a threshold | CLI | ✅ active | CI gate; complementary. |

## Publishing correctness (embed these in the publish flow)

| Tool | What | Delivery | Alive? | Relationship |
|---|---|---|---|---|
| **publint** | Lints publishing config — `exports`/`main`/`types`/`files`/`bin`, deprecated fields | web + CLI + **programmatic API** + VS Code ext | ✅ active | **Embed directly** in visual-config's publish-setup flow; show warnings with one-click fixes. Its multi-surface delivery is a model for visual-config's own. |
| **arethetypeswrong / attw** | Checks a package's TS types across node10/node16/bundler + ESM/CJS | web + CLI | ✅ active | **Embed** in publish flow; render results with fix guidance. |
| **npm-name** | Package-name availability check | lib + CLI | ✅ current | Embed in "publish a new package" naming step. |

## Migration / codemod tooling (the engines behind "swap" & "migrate")

The official per-tool migrators are CLI-only, one-shot, **one-directional**
transformers — exactly the primitives visual-config wraps behind a previewed,
reversible, bidirectional UI:

| Tool | What | Direction | Note |
|---|---|---|---|
| **`@eslint/migrate-config`** | Legacy `.eslintrc` → flat config | one-way | Official. 1:1 for JSON/YAML, best-effort (loses dynamic logic) for `.eslintrc.js`. |
| **`biome migrate eslint` / `prettier`** | ESLint/Prettier settings → `biome.json` | into Biome only | The closest analog to a visual-config "swap" button — but CLI-only, one-directional. |
| **`@oxlint/migrate`** | ESLint **flat** config → `.oxlintrc.json` | one-way | Official oxc. Legacy configs must first pass through `@eslint/migrate-config`. |
| **oxfmt migrate-from-prettier** | Prettier → oxfmt | one-way | Intentionally Prettier-compatible output; oxfmt still newer/less mature. |

General codemod **engines** (visual-config would orchestrate, not rebuild these):
`jscodeshift` (classic, legacy-stable), **`codemod` (codemod.com)** — see below —
`@putout/putout` (very active plugin-based transformer), and **GritQL** (now
absorbed into the Biome org). None is config/tooling-swap-*specific*; they're
lower-level.

### ⚠️ codemod.com — the one real "UI + CLI + MCP" precedent
- **What:** a Rust CLI + **web Studio** + **Codemod MCP** + a registry of
  community migration recipes (including an ESLint→Biome recipe).
- **Why it matters:** it is the *only* project found that couples a UI **and**
  an MCP server around code transformation — the same triad visual-config wants.
- **Gap visual-config fills:** codemod.com is scoped to **code refactors / migration
  recipes**, *not* package.json/tooling-config management, install catalogs,
  script running, config forms, or publish setup. It's the closest *shape*
  competitor and the one to position against — but it does not occupy visual-config's
  surface. Watch it closely.

## MCP servers for package/config management (visual-config's core moat)

The agent-tooling space is *already in motion* but **entirely headless** — every
server below is agent-only, most are single-slice, and none pairs with a UI:

| Server | Scope | Signal |
|---|---|---|
| **Socket MCP** (official) | supply-chain/vuln checks | Best-funded security player already has an MCP. |
| **npm-helper-mcp** | dep updates (wraps ncu) + search | Closest to visual-config's *update* action — headless, ~8★. |
| **npm-run-mcp-server** | exposes `package.json` scripts as agent tools | visual-config's script-runner idea, as an MCP, ~3★. |
| **mikusnuz/npm-mcp** | 32 tools: publish/install/audit/search/security | Broadest single scope — headless, 0★. |
| **mcp-npm-tools / npm-sentinel / npmjs-mcp / npm-registry-mcp** | registry search, size, audit, compare | A crowd of registry-intelligence servers. |
| **Snyk Studio (MCP)** | vuln + fix for agents | Account-gated SaaS; closest commercial. |
| **`@knip/mcp`** | unused files/deps/exports reporting | Even knip ships an MCP now. |
| **Codemod MCP** | run codemods/migrations | The UI+MCP precedent (above). |

**The gap, precisely:** these are all (a) headless and (b) single-slice, and
the migration CLIs have neither UI nor MCP. **No project exposes guided,
reversible config *mutations* as both buttons and MCP tools over the unified
config/package surface.** That specific intersection is unoccupied — it is
visual-config's clearest, most defensible moat, and the ecosystem's momentum (Socket,
knip, codemod all shipping MCPs) validates the demand while leaving the
integrated slot open.

## Config presets & scaffolding (complementary, not competing)

| Tool | What | Relationship |
|---|---|---|
| **create-vite / create-next-app / create-t3-app** | Interactive scaffolders at **project birth** | Write-once then exit. visual-config is the **day-2+** tool they leave behind; its swap forms do continuously what they do once. |
| **@tsconfig/bases** | Shareable base tsconfigs (`@tsconfig/strictest`, etc.) | Offer as **one-click presets** in visual-config's tsconfig editor. |
| **@antfu/eslint-config** | Opinionated all-in-one ESLint preset replacing eslint+prettier | Represents the "one preset" philosophy visual-config's swap feature can apply/remove. |
| **Biome / ESLint flat-config migrators** | Official migration commands (`biome migrate eslint`, ESLint flat-config migrator) | **Wrap these** as the engine behind visual-config's tooling-swap (behind a diff, honest about lossy rule translation). |

## Adjacent "devtools UI" architecture references

- **Vite `vite-plugin-inspect`**, **Vue DevTools**, **Nuxt DevTools** — all use
  a local server + iframe/webview UI. The `devtools-kit` pattern is the model
  for visual-config's shared engine + multi-face delivery.

---

## What is genuinely novel about visual-config

1. **Editable, not just readable.** Every inspector in this space
   (config-inspector, publint, attw) is read/validate-only. Form-based *editing*
   of `next.config`/`tsconfig`/`biome`/`package.json` is open white space.
2. **Cross-tool, not single-tool.** Everyone else covers one tool (ESLint, or
   TS, or publishing). visual-config is the *unifying surface*.
3. **One-click tooling swaps.** No one automates Biome ⇄ ESLint+Prettier or
   moves to oxlint/oxfmt as a previewed transaction. Unique.
4. **An MCP server for config actions.** knip ships `@knip/mcp` (reporting) and
   npq ships an `AGENTS.md`, but **nobody exposes guided, reversible config
   *mutations* to agents.** This is visual-config's strongest, most defensible moat and
   the most 2026-relevant angle.
5. **Framework- and dev-server-independent.** Every devtools *dashboard* that
   exists (Nuxt DevTools, Vue/Vite DevTools, Modern.js, Rsdoctor) is
   **coupled to a running dev server and locked to one framework/bundler**, and
   centers on *runtime/build debugging*, not the config lifecycle. visual-config runs
   from `npx` against static config files with **no dev server and no framework
   assumption** — an empty quadrant. Nuxt DevTools is the nearest UX/extensibility
   reference (study its `birpc` + iframe-tab architecture) but manages only Nuxt
   *modules* and has no MCP.
6. **The unification itself.** Each capability exists somewhere; the product
   thesis is that *one non-destructive surface over the real files, usable by
   humans and agents alike* is worth more than the sum.

## Biggest competitive threats / things to watch

- **antfu ecosystem** (config-inspector, taze, @antfu/eslint-config): if this
  crowd generalizes config-inspector into an editable, multi-tool surface, it
  would be the most direct collision. They own the proven UX template. **Move
  before they do, and consider interop rather than competition.**
- **Socket.dev**: best-funded player on package trust/supply-chain; likely to
  keep expanding the "safe install" surface visual-config also wants to own.
- **First-party tools adding their own UIs** (an official Biome or oxc config
  UI, or npm/pnpm shipping a GUI) would erode single areas — visual-config's defense is
  breadth + MCP + non-destructive editing, not any one tool's depth.
- **knip's MCP** shows the agent-tooling idea is already in motion; visual-config needs
  to be the *mutation* surface, not just another reporter, to stay ahead.
