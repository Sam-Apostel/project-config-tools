---
'@apostel/visual-config-core': minor
'@apostel/visual-config-ui': minor
---

Read views for JS/TS configs (`next.config`, `vite.config`, eslint flat).

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
