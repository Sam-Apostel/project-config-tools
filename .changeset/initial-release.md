---
'@apostel/visual-config': minor
---

Initial public preview (v0.1.0).

- `npx @apostel/visual-config` — a local visual interface over your real config files. Every
  change is a previewed, reversible diff; files stay the source of truth.
- `npx @apostel/visual-config mcp` — the same operations projected as MCP tools/resources for
  agents, with in-session app UI where the host supports MCP Apps.
- `npx @apostel/visual-config init-mcp` — register the MCP server in a repo's agent config
  (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`) so teammates and cloud agents
  auto-discover it.
- Plugin system (`@apostel/visual-config-kit`) for third-party operations, detectors, and
  attributed opinion packs; code-aware dependency bump-safety analysis.
