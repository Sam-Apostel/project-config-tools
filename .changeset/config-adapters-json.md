---
'@apostel/visual-config-core': minor
'@apostel/visual-config-mcp': minor
'@apostel/visual-config-ui': minor
---

Config adapters: view and edit every JSON config, not just tsconfig.

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
