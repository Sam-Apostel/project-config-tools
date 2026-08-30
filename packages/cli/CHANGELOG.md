# @apostel/visual-config

## 0.9.0

### Minor Changes

- [#36](https://github.com/Sam-Apostel/project-config-tools/pull/36) [`9759571`](https://github.com/Sam-Apostel/project-config-tools/commit/9759571204878edd4a76d8cfee1a46e333344239) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Cross-repo fan-out — the headless "fleet" core plus a `fleet` CLI command.

  Because visual-config runs on your machine, it can open many repos at once and
  apply one operation across all of them. New in core:

  - **`discoverProjects(fs, parent, { depth })`** — config-free discovery of the npm
    projects under a folder. Walks the parent (default depth 3), returns the
    top-most `package.json` in each subtree (so monorepo members don't double-count)
    and finds a manifest that lives in a child folder — the monorepo shape where the
    repo root has no `package.json`.
  - **Fleet state** (`loadFleetState`/`saveFleetState`/`rememberParent`/`pinProject`)
    — remembers scanned parents and hand-pinned projects in the user's config dir
    (honoring `XDG_CONFIG_HOME`). It is user-global app state, never a file dropped
    into a scanned repo.
  - **`Fleet`** (+ `createFleet`) — `planAcross` dry-runs an operation in every repo
    and returns a Change per repo (repos where it doesn't apply are `skipped`, not
    errored); `applyAcross` writes only the planned ones. Each repo is its own
    engine, so each keeps its own undo journal.

  New CLI: **`visual-config fleet <folder>`** lists discovered projects; add
  `--op <id> --input <json>` to preview a fan-out and `--apply` to write it;
  `--pin <path>` pins a project the walk can't guess. Dry-run by default.

  UI and MCP surfaces for fan-out are the next slices.

- [#34](https://github.com/Sam-Apostel/project-config-tools/pull/34) [`92109b5`](https://github.com/Sam-Apostel/project-config-tools/commit/92109b57feafeff86c573fe0742960777ae7463f) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - One-click vulnerability remediation.

  `engine.getRemediation()` (and a `getRemediation` daemon RPC) turns advisory
  findings into concrete upgrade targets: for each vulnerable direct dependency it
  picks the **minimal safe version** that escapes every advisory affecting it,
  flags when that crosses a major, and reports anything with no safe published
  version as `unfixable`. A new `fix-vulnerabilities` operation applies the bumps
  as one reviewed, reversible package.json Change (and appears as an MCP
  `plan_fix-vulnerabilities` tool). The UI Dependencies view gains a **Fix
  vulnerabilities** button. Adds `registry.versions()`.

- [#37](https://github.com/Sam-Apostel/project-config-tools/pull/37) [`d241fb2`](https://github.com/Sam-Apostel/project-config-tools/commit/d241fb299d853fb8ec8871ba3eb61792bd3e4711) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Cross-repo fan-out in the browser — daemon RPCs + a Fleet view.

  Wires the fleet core (discovery, plan-across/apply-across, per-repo journals)
  into the daemon and the SPA:

  - **Daemon RPCs** (`fleetBrowse`, `fleetDiscover`, `fleetPlan`, `fleetApply`,
    `fleetPin`/`fleetUnpin`, `fleetGetState`). `fleetPlan` holds the plan per
    connection so a following `fleetApply` writes exactly what was previewed — the
    same plan → present → apply-on-confirm contract as the single-repo flow. The
    service takes an injectable filesystem/opener so it's testable headless.
  - **Fleet view** in the UI: a folder browser to pick a parent, the discovered
    (and pinned) projects, and an "upgrade a dependency everywhere" action that
    previews a per-repo diff for every repo that has the package (others skipped)
    before applying across all of them.

  Tested: daemon fleet RPCs over the in-memory harness, plus end-to-end over a live
  daemon against on-disk repos and a browser smoke of the Fleet view. MCP fan-out
  tools are the next slice.

- [#38](https://github.com/Sam-Apostel/project-config-tools/pull/38) [`8a1b025`](https://github.com/Sam-Apostel/project-config-tools/commit/8a1b025ce28eb8857873f4b7846fbbcb43692983) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Cross-repo fan-out for agents — `fleet_*` MCP tools.

  The MCP server gains four tools so an agent can drive fan-out the same way the
  CLI and browser do: `fleet_discover` (npm projects under a parent folder),
  `fleet_plan` (dry-run one operation across them — repos where it doesn't apply
  are skipped, not errored), `fleet_apply` (write the plan `fleet_plan` previewed
  in this session), and `fleet_pin` (pin a monorepo child folder the walk can't
  guess). `createMcpServer` takes an injectable filesystem/opener so the tools are
  testable headless.

  Also extracts a shared `resolveFleetTargets(fs, parent, depth?)` in core — the
  discovered projects plus any pinned ones — used by both the daemon and the MCP
  server, so all three faces compute the fan-out target set identically.

  This completes cross-repo fan-out across every face — CLI, browser, and MCP.

- [#32](https://github.com/Sam-Apostel/project-config-tools/pull/32) [`7d0a9be`](https://github.com/Sam-Apostel/project-config-tools/commit/7d0a9be23e5fb47f5adf28f9c6994f985d9ad50a) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Add a headless `check` command for CI.

  `visual-config check` opens the project, computes fact-based diagnostics
  (outdated / vulnerable / deprecated), prints a summary — or `--json` for a
  machine-readable report — and exits non-zero when the policy is violated.
  `--fail-on` selects which kinds gate the build (`vuln` by default; also
  `deprecation`, `outdated`, `any`, `none`, comma-separated). Read-only: it never
  runs the project's code, so it's safe to drop into any pipeline.

- [#35](https://github.com/Sam-Apostel/project-config-tools/pull/35) [`d1370db`](https://github.com/Sam-Apostel/project-config-tools/commit/d1370db13afb1819700ffda40ac678380cc2aab4) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Toolchain presets — curated baselines applied as one change.

  A new `apply-preset` operation composes several mechanical setup facets —
  tsconfig strictness, config files, package.json scripts, and installs — into a
  single previewed, reversible `Change`. It ships three presets: `strict-ts` (the
  strict compiler-option family + `.editorconfig`), `biome` (install Biome +
  `biome.json` + `.editorconfig` + format/lint/check scripts), and `ts-biome` (the
  full baseline). Being a built-in operation it also appears as an MCP
  `plan_apply-preset` tool.

  Presets are the opt-in place for taste: unlike base diagnostics (facts only), a
  preset is a baseline the user explicitly selects and reviews before applying.
  Applying one is **idempotent** — existing files and scripts are kept rather than
  clobbered, already-set tsconfig options and installed packages are no-ops, so
  re-applying only fills what's missing. `engine.getPresets()` (and a `getPresets`
  daemon RPC) flags whether each preset would do anything here; the UI Config view
  gains a **Toolchain presets** section.

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.9.0
  - @apostel/visual-config-mcp@0.9.0
  - @apostel/visual-config-server@0.9.0
  - @apostel/visual-config-ui@0.9.0

## 0.8.0

### Minor Changes

- [#30](https://github.com/Sam-Apostel/project-config-tools/pull/30) [`3188a33`](https://github.com/Sam-Apostel/project-config-tools/commit/3188a335f931b9cea3d15246d955b8a4a2a20635) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Lockfile-exact diagnostics + per-package install size.

  Dependency diagnostics (outdated, vulnerabilities) now compare against the
  **exact installed version** read from the lockfile — `pnpm-lock.yaml`,
  `package-lock.json`/`npm-shrinkwrap.json`, or `yarn.lock` (classic and berry) —
  instead of the floor of the declared semver range, so the numbers reflect what's
  actually installed. `DependencyEntry` gains a `resolved` field.

  Adds an **install-size** report: `engine.getInstallSizes()` (and a
  `getInstallSizes` daemon RPC) returns each dependency's own unpacked size from
  the registry, largest first, with a total. The UI Dependencies view shows a size
  badge per package, a total "on disk" badge, and the exact installed version.

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.8.0
  - @apostel/visual-config-mcp@0.8.0
  - @apostel/visual-config-server@0.8.0
  - @apostel/visual-config-ui@0.8.0

## 0.7.1

### Patch Changes

- [#27](https://github.com/Sam-Apostel/project-config-tools/pull/27) [`da5e3f9`](https://github.com/Sam-Apostel/project-config-tools/commit/da5e3f969e8a79e82ca6e4f4d8af866cf77f18f5) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - fix(cli): don't crash when no browser opener exists; use explorer.exe on WSL

  `spawn()` reports a missing opener binary as an async `error` event, not a
  synchronous throw, so the `try/catch` around `openBrowser` never caught it and a
  missing `xdg-open` (headless Linux, WSL, minimal containers) took down the whole
  daemon. The spawned child now gets an `error` handler so opening the browser is
  genuinely best-effort — the URL is printed regardless. On WSL, where `xdg-open`
  is usually absent, the opener falls back to `explorer.exe`, which opens the
  Windows default browser.

- Updated dependencies []:
  - @apostel/visual-config-core@0.7.1
  - @apostel/visual-config-mcp@0.7.1
  - @apostel/visual-config-server@0.7.1
  - @apostel/visual-config-ui@0.7.1

## 0.7.0

### Minor Changes

- [#21](https://github.com/Sam-Apostel/project-config-tools/pull/21) [`d5824f8`](https://github.com/Sam-Apostel/project-config-tools/commit/d5824f8d050c522adefc7ed1351a4628d8e00925) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Add monorepo / workspace support. Project detection now resolves member packages
  from `pnpm-workspace.yaml` or the npm/yarn `workspaces` field (globs and
  `!`-exclusions), exposing them as `ProjectModel.workspacePackages`. The daemon
  gains `getWorkspace` and `setActivePackage` RPCs that re-open the engine at any
  member, and the UI adds a package switcher so every view and operation targets
  the selected package.

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.7.0
  - @apostel/visual-config-mcp@0.7.0
  - @apostel/visual-config-server@0.7.0
  - @apostel/visual-config-ui@0.7.0

## 0.6.0

### Minor Changes

- [#19](https://github.com/Sam-Apostel/project-config-tools/pull/19) [`57d82f5`](https://github.com/Sam-Apostel/project-config-tools/commit/57d82f57f1d09a0efea81e42d3630af77f6afcc3) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - New `visual-config try <owner/repo>` command — the prototype behind the hosted
  "point at any repo → diff" flow.

  It shallow-clones a public GitHub repo (read-only, never executing its code), runs
  the real engine against it, prints what it finds (outdated / vulnerable / deprecated
  dependencies), and emits a **format-preserving patch** that upgrades the outdated
  deps — to stdout, so you can pipe it to `git apply`. Nothing is written and no
  package-manager command is run; it's diff-only.

  ```
  npx @apostel/visual-config try sindresorhus/got
  ```

  This is the engine reused verbatim over a cloned repo — the same core that powers
  the local UI and MCP server, pointed at a URL.

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.6.0
  - @apostel/visual-config-mcp@0.6.0
  - @apostel/visual-config-server@0.6.0
  - @apostel/visual-config-ui@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`8596ff6`](https://github.com/Sam-Apostel/project-config-tools/commit/8596ff6ae607d84cd5dbaee6777f7e4c615b5e94)]:
  - @apostel/visual-config-core@0.5.0
  - @apostel/visual-config-ui@0.5.0
  - @apostel/visual-config-mcp@0.5.0
  - @apostel/visual-config-server@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`4546f0d`](https://github.com/Sam-Apostel/project-config-tools/commit/4546f0d7a753565791c38c79c51c10c50a8d7ebf)]:
  - @apostel/visual-config-core@0.4.0
  - @apostel/visual-config-ui@0.4.0
  - @apostel/visual-config-mcp@0.4.0
  - @apostel/visual-config-server@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`a64ca0d`](https://github.com/Sam-Apostel/project-config-tools/commit/a64ca0d449818d170c04325b9989b4b5179fed7f), [`5826fb6`](https://github.com/Sam-Apostel/project-config-tools/commit/5826fb6199585abaf84f10e92efc918d0cd2de26)]:
  - @apostel/visual-config-core@0.3.0
  - @apostel/visual-config-mcp@0.3.0
  - @apostel/visual-config-ui@0.3.0
  - @apostel/visual-config-server@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [[`9c46cad`](https://github.com/Sam-Apostel/project-config-tools/commit/9c46cad412b30319dda9342fc73c4c04577b6a69)]:
  - @apostel/visual-config-core@0.2.0
  - @apostel/visual-config-mcp@0.2.0
  - @apostel/visual-config-ui@0.2.0
  - @apostel/visual-config-server@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`dbb01b0`](https://github.com/Sam-Apostel/project-config-tools/commit/dbb01b01d85b3dd7cb49b14879479027ecce380a)]:
  - @apostel/visual-config-server@0.1.2
  - @apostel/visual-config-core@0.1.2
  - @apostel/visual-config-mcp@0.1.2
  - @apostel/visual-config-ui@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`2e4f32d`](https://github.com/Sam-Apostel/project-config-tools/commit/2e4f32ddd009bf6b5f555b77e627fd3480b4fab9)]:
  - @apostel/visual-config-ui@0.1.1
  - @apostel/visual-config-core@0.1.1
  - @apostel/visual-config-mcp@0.1.1
  - @apostel/visual-config-server@0.1.1

## 0.1.0

### Minor Changes

- [#1](https://github.com/Sam-Apostel/project-config-tools/pull/1) [`5b4a8cb`](https://github.com/Sam-Apostel/project-config-tools/commit/5b4a8cbaba231a06a4930c3a9918020bcd828b2d) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Initial public preview (v0.1.0).

  - `npx @apostel/visual-config` — a local visual interface over your real config files. Every
    change is a previewed, reversible diff; files stay the source of truth.
  - `npx @apostel/visual-config mcp` — the same operations projected as MCP tools/resources for
    agents, with in-session app UI where the host supports MCP Apps.
  - `npx @apostel/visual-config init-mcp` — register the MCP server in a repo's agent config
    (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`) so teammates and cloud agents
    auto-discover it.
  - Plugin system (`@apostel/visual-config-kit`) for third-party operations, detectors, and
    attributed opinion packs; code-aware dependency bump-safety analysis.

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.1.0
  - @apostel/visual-config-mcp@0.1.0
  - @apostel/visual-config-server@0.1.0
  - @apostel/visual-config-ui@0.1.0
