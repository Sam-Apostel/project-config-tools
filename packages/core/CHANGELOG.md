# @apostel/visual-config-core

## 0.9.0

## 0.8.0

## 0.7.1

## 0.7.0

## 0.6.0

## 0.5.0

### Minor Changes

- [#16](https://github.com/Sam-Apostel/project-config-tools/pull/16) [`8596ff6`](https://github.com/Sam-Apostel/project-config-tools/commit/8596ff6ae607d84cd5dbaee6777f7e4c615b5e94) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Read views for JS/TS configs (`next.config`, `vite.config`, eslint flat).

  These configs are code, so they're statically parsed (via `@babel/parser`) and shown
  **read-only**: the tool extracts top-level literal options and honestly flags the keys
  it can't read statically (functions, imports, spreads). Handles `export default {…}`,
  `export default defineConfig({…})`, `… satisfies X`, and `module.exports = …`.

  - `Engine.getConfig`/`getConfigs` now include JS/TS configs with `readOnly: true`,
    `values` (extracted literals), and `dynamicKeys`.
  - The Config panel renders them as a read-only card (“change it in your editor”),
    listing the readable options and the dynamic keys.
  - `get_config` (MCP) returns them too.

  Editing code configs remains out of scope by design — files stay the source of truth
  and only data configs are written.

## 0.4.0

### Minor Changes

- [#14](https://github.com/Sam-Apostel/project-config-tools/pull/14) [`4546f0d`](https://github.com/Sam-Apostel/project-config-tools/commit/4546f0d7a753565791c38c79c51c10c50a8d7ebf) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - One-click tooling swap: **Switch to Biome**.

  A new `switch-to-biome` operation replaces ESLint + Prettier with Biome in a single
  previewed, reversible Change: it creates `biome.json`, deletes the detected
  ESLint/Prettier config files, removes their dependencies and scripts from
  `package.json`, adds Biome's scripts, and installs Biome (package-manager-aware) +
  prunes the removed deps. Rule/format _settings_ are not translated — Biome starts on
  its defaults, called out on the Change.

  - Risk `breaking`, but fully previewed as a diff and reversible via the journal
    (undo restores the deleted configs, deps, and scripts).
  - The browser UI's Config section shows a **Switch to Biome** action when ESLint or
    Prettier is present and Biome isn't.
  - Agents get `plan_switch_to_biome`.

## 0.3.0

### Minor Changes

- [#12](https://github.com/Sam-Apostel/project-config-tools/pull/12) [`a64ca0d`](https://github.com/Sam-Apostel/project-config-tools/commit/a64ca0d449818d170c04325b9989b4b5179fed7f) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Config adapters: view and edit every JSON config, not just tsconfig.

  The tool now understands the JSON/JSONC config files it already detected — **Biome,
  Prettier, ESLint (legacy `.eslintrc.json`), oxlint**, plus tsconfig/jsconfig — as
  editable data:

  - Two generic operations, `set-config-value` and `remove-config-value`, edit any
    known JSON config via the format- and comment-preserving writer, and can create
    the file if it doesn't exist. Constrained to a fixed allowlist of known config
    paths (enforced scope).
  - `Engine.getConfig(path)` / `getConfigs()` return each config's parsed values plus
    **curated, factual option docs** (name, type, default, description) for the known
    tools — no taste, just facts.
  - New **Config** section in the browser UI: each detected config rendered as a form
    with inline docs and a link to the tool's reference; changing an option plans a
    previewed diff. Documented options get typed controls (toggle / select / input);
    other set keys are shown read-only.
  - MCP: a `get_config` tool, and the two operations exposed as
    `plan_set_config_value` / `plan_remove_config_value`.

  Next up (not in this change): static-subset views for JS/TS configs (next.config,
  vite.config, eslint flat) and one-click tooling swaps.

- [#12](https://github.com/Sam-Apostel/project-config-tools/pull/12) [`5826fb6`](https://github.com/Sam-Apostel/project-config-tools/commit/5826fb6199585abaf84f10e92efc918d0cd2de26) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Config scaffolding: set up a formatter/linter in one reviewed step.

  A new `add-config` operation installs a tool, creates a minimal (non-opinionated)
  config it accepts on its defaults, and adds its standard scripts — all as a single
  previewed Change. Ships for **Prettier, Biome, and oxlint**. The installer resolves
  and pins the version via the project's package manager (npm/pnpm/yarn/bun), so
  nothing is hard-coded.

  - `Engine.getScaffolds()` lists scaffoldable tools flagged by whether they're already
    set up; exposed over RPC as `getScaffolds`.
  - The browser UI's Config section gains a **“Set up a tool”** panel offering each
    tool not yet present (shows what it installs and the config it creates).
  - Agents get `plan_add_config`.

## 0.2.0

### Minor Changes

- [#9](https://github.com/Sam-Apostel/project-config-tools/pull/9) [`9c46cad`](https://github.com/Sam-Apostel/project-config-tools/commit/9c46cad412b30319dda9342fc73c4c04577b6a69) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Richer dependency facts: vulnerabilities, deprecations, alternatives, and changelogs.

  - **Vulnerabilities** — security advisories from the npm advisory DB, per dependency,
    surfaced as `vulnerability` diagnostics (severity-mapped) with the advisory link.
  - **Deprecations** — flags deprecated packages with the maintainer's message, and
    extracts the suggested **alternative** when the message names one (e.g. "use `got`").
    The UI offers a one-click install of the alternative.
  - **Changelogs** — a new `getChangelog` engine method / `get_changelog` MCP tool and a
    **Changelog** button per dependency in the UI, showing GitHub release notes between
    your version and latest with breaking changes highlighted.

  The browser UI's Dependencies view now shows vuln/deprecated badges alongside outdated,
  and a repo-wide "N vulnerable" count. All of these are verifiable facts (files stay the
  source of truth); curated opinions still come only from installed packs.

## 0.1.2

## 0.1.1

## 0.1.0
