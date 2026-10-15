---
'@apostel/visual-config': minor
---

Guided config editing in MCP via sampling — `propose_config_edit`.

A new MCP tool turns a plain-language intent (e.g. "use single quotes and no
semicolons") into concrete config edits by asking the host's **own** model
through **MCP sampling** — no API key, no server-side LLM. The model only
proposes `{key, value}` inputs; each is validated against the config's
documented options (type/enum facts) and routed through the normal
`set-config-value` **plan → preview → apply-on-confirm** flow, so nothing is
written without a confirmed Change.

Covers the known JSON configs (Biome, Prettier, ESLint, oxlint, tsconfig); JS/TS
configs (next.config.js, …) are declined with a clear message (guided AST rewrite
is still ahead). If the host doesn't support sampling, the tool degrades with a
clear message pointing at `plan_set_config_value`. `createMcpServer` takes an
injectable sampler so the tool is testable without a live host model.
