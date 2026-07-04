# Spec 05 — MCP Server & RPC Protocol

> The two machine interfaces to the core: **birpc** (UI ⇄ daemon, for the
> browser and IDE faces) and **MCP** (agents ⇄ daemon). Both are thin projections
> of the Operation registry (spec 01). Status: draft.

Related: [`00-architecture.md`](00-architecture.md) · [`01-core-engine.md`](01-core-engine.md)

---

## 1. Shared principle

The UI faces and agents call the *same* operations. birpc and MCP differ only in
transport and framing; neither contains config logic. Both resolve to
**plan → present → apply-on-approval**.

## 2. birpc (UI ⇄ daemon)

Typed, bidirectional RPC over WebSocket (the Nuxt/Vite DevTools choice). One
shared TypeScript interface pair; multiple connected clients (browser tabs, IDE
panel) get server-pushed updates via broadcast.

```ts
interface ServerFunctions {
  getProject(): Promise<ProjectModel>;
  listOperations(): Promise<OperationInfo[]>;
  planOperation(id: string, input: unknown): Promise<Change>;      // never writes
  applyChange(changeId: string): Promise<ApplyResult>;             // writes; journaled
  undo(entryId: string): Promise<ApplyResult>;
  getDiagnostics(): Promise<Diagnostics>;                          // vulns, outdated, improvements
  searchCatalog(query: CatalogQuery): Promise<CatalogResult>;
  analyzeBump(pkg: string, to: string): Promise<BumpAnalysis>;     // spec 04
  runScript(name: string): Promise<TaskHandle>;
  // …one method per built-in surface; plugin operations reached via planOperation
}

interface ClientFunctions {
  onProjectChanged(p: ProjectModel): void;
  onTaskOutput(handle: string, chunk: string): void;
  onDiagnostics(d: Diagnostics): void;
  onChangeProposed(c: Change): void;   // e.g. an agent proposed a change; show the Diff Sheet
}
```

### VS Code transport nuance
Two supported ways for the webview to reach the daemon:
1. **`asExternalUri`** — the extension spawns the daemon and the webview connects
   to the forwarded `localhost` WS. Maximizes UI reuse (same SPA + same birpc as
   the browser). Requires CSP `connect-src` for the forwarded origin + a nonce.
2. **`postMessage` bridge** — the extension host proxies birpc calls; no port.
   Port-less fallback for restricted/remote envs. The SPA speaks the same
   `ServerFunctions`; only the channel differs.

## 3. MCP server (agents ⇄ daemon)

`visual-config mcp` runs an MCP server (stdio for local; streamable HTTP
optional). It reflects the Operation registry into MCP primitives:

- **Tools** — one per Operation. The tool’s `inputSchema` **is** the Operation’s
  `inputSchema`. `tools/call` runs `plan` and returns the **Change as structured
  JSON** (summary + diffs + commands + notes + risk). Applying is a separate,
  gated tool (`apply_change`) so the host’s approval step sits between proposal
  and write — mirroring the human Diff Sheet.
- **Resources** — read-only project context: `config://package.json`,
  `config://tsconfig` (effective + owned), `diagnostics://outdated`,
  `diagnostics://vulnerabilities`, `catalog://search?...`. Agents read these
  instead of scraping files, getting the same parsed, resolved view the UI has.
- **Prompts** — optional templates, e.g. "assess which major bumps are safe for
  this app" wired to `analyze-bump` across the dep set (spec 04 §4).

### Representative tool surface

| MCP tool | Operation | Risk gate |
|---|---|---|
| `list_scripts` / `run_script` | scripts | run = review |
| `search_catalog` | catalog query | none (read) |
| `install_package` | install-package | review |
| `set_tsconfig_option` | set-config | review |
| `add_next_image_domain` | next adapter op | review |
| `swap_linter` | tool swap | breaking |
| `analyze_bump` | analyze-bump | none (read) |
| `plan_migration` / `run_migration_step` | migration recipe/skill | breaking |
| `apply_change` | apply a prior Change | gated by host approval |
| `undo` | undo journal entry | review |

Plugin-registered Operations appear as tools automatically (namespaced by plugin
id), so an installed `oxc` plugin gives agents `oxc__swap_to_oxlint` with the
same guardrails.

## 4. Safety model for agents

- **Mutation is two-step and gated.** `plan`/`analyze` tools are read-only and
  freely callable; `apply_change` is the only writer and is designed to require
  host approval per MCP’s tool-approval model.
- **Scope enforced server-side.** Even if an agent calls a plugin tool, the
  daemon enforces the Operation’s `scope` (spec 01 §6) — an agent can’t make a
  plugin write outside its declared files.
- **Same journal.** Agent applies are recorded with `actor: 'agent'` and are
  undoable, giving a human an audit trail and a one-click revert.
- **Supervised mode.** When a human UI is connected, agent-proposed Changes can
  be streamed to the Diff Sheet (`onChangeProposed`) for a human to approve —
  the human and the agent look at the identical Change.
- **Local-server hardening.** Bind `127.0.0.1`, validate `Origin`, per-session
  token, for both the WS and any HTTP MCP transport (DNS-rebinding defense).

## 5. Why this is nearly free

Because operations, schemas, Changes, and the project model already live in the
core (spec 01), both this MCP server and the birpc layer are thin adapters:
enumerate operations, map schemas, forward plan/apply. No config logic is
duplicated. This is the structural payoff asserted throughout the architecture —
and it’s already proven by first-party tools shipping the same core as CLI + LSP
+ MCP (Biome, ESLint’s `@eslint/mcp`).
