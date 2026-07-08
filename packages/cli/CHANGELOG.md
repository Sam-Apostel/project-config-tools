# @apostel/visual-config

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
