# @apostel/visual-config

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
