# Technical Specs

Concrete design specs for `visual-config`. These describe the intended
architecture and interfaces in enough detail to build from. **Draft status — no
code yet**; TypeScript interfaces are proposed shapes, not frozen API. They
refine the higher-level docs ([`../ANALYSIS.md`](../ANALYSIS.md),
[`../ROADMAP.md`](../ROADMAP.md), [`../IDE-INTEGRATION.md`](../IDE-INTEGRATION.md)).

## Read in order

| # | Spec | What it defines |
|---|---|---|
| 00 | [Architecture](00-architecture.md) | The one core / many faces / everything-is-a-plugin shape; layers; the Operation⇄Change contract; tech choices; invariants. |
| 01 | [Core Engine](01-core-engine.md) | Project model, the `Operation`/`Change` contract, the format-preserving write layer, undo journal, risk policy, scope enforcement. |
| 02 | [Plugin API](02-plugin-api.md) | Contribution points, the declarative-first model, security/sandbox, versioning — with worked `oxc` and `tanstack` plugin examples. |
| 03 | [Config Adapters](03-config-adapters.md) | How each config file is parsed/edited; editability tiers; effective vs. owned views; built-in adapters. |
| 04 | [Migrations](04-migrations.md) | Codemod- and agent-skill-backed migrations; changelog ingestion; **code-aware bump safety analysis**. |
| 05 | [MCP & RPC](05-mcp-and-rpc.md) | birpc (UI ⇄ daemon) and the MCP server (agents ⇄ daemon), both as thin projections of the Operation registry. |
| 06 | [IDE Surface](06-ide-surface.md) | Embedding the panel; the "cleaner workspace" toggle built on IDE-native features only. |
| 07 | [Opinions](07-opinions.md) | Neutral base (facts only); installable, attributed **opinion packs** (Matt Pocock / Vercel / the TypeScript team / …). |
| 08 | [Registry & Distribution](08-registry-and-distribution.md) | Finding/browsing plugins & opinions **without npm-package clutter** — selection-as-data, an in-tool marketplace, opinions-as-fetched-data. |

## The three load-bearing ideas

1. **Everything is an Operation that yields a previewable, reversible Change.**
   Buttons, agent tool-calls, and IDE commands all resolve to *plan → present →
   apply-on-confirm*. This is what makes one core serve every face — and makes
   MCP nearly free (specs 00, 01, 05).
2. **Everything is a plugin, including the built-ins.** Tool owners ship their
   own vertical (detection, config UI, catalog filter, docs, swaps, migrations)
   against the same API the core uses. Declarative-first keeps the common plugin
   tiny and safe (spec 02).
3. **The files are the only source of truth, always.** Format-preserving writes
   or an honest refusal; native-only view tweaks; no shadow store (specs 01, 03,
   06).
4. **Neutral by default; opinion is a choice.** The base states facts, never
   preferences. Recommendations come only from installed, attributed opinion
   packs — keeping the maintainer's taste out of the tool (spec 07).

## Open questions

Tracked in [`../ROADMAP.md`](../ROADMAP.md#open-questions-decide-beforeat-v1)
(core language, opinionation, registry caching, the static-subset boundary,
telemetry stance, governance).
