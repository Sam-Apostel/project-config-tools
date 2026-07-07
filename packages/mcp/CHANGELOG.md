# @apostel/visual-config-mcp

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

### Patch Changes

- Updated dependencies [[`a64ca0d`](https://github.com/Sam-Apostel/project-config-tools/commit/a64ca0d449818d170c04325b9989b4b5179fed7f), [`5826fb6`](https://github.com/Sam-Apostel/project-config-tools/commit/5826fb6199585abaf84f10e92efc918d0cd2de26)]:
  - @apostel/visual-config-core@0.3.0

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

### Patch Changes

- Updated dependencies [[`9c46cad`](https://github.com/Sam-Apostel/project-config-tools/commit/9c46cad412b30319dda9342fc73c4c04577b6a69)]:
  - @apostel/visual-config-core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.1.0
