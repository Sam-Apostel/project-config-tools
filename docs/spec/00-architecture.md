# Spec 00 — Architecture

> How `visual-config` is put together. This is the load-bearing document; the
> other specs refine pieces named here. Status: **draft for review**, no code yet.

Related: [`01-core-engine.md`](01-core-engine.md) · [`02-plugin-api.md`](02-plugin-api.md) ·
[`03-config-adapters.md`](03-config-adapters.md) · [`04-migrations.md`](04-migrations.md) ·
[`05-mcp-and-rpc.md`](05-mcp-and-rpc.md)

---

## 1. The one rule

**One headless core. Many thin faces. Everything is a plugin — including the
built-ins.**

The core knows nothing about HTTP, the DOM, VS Code, or MCP. It exposes a set of
**operations** (each producing a previewable, reversible **Change**) and a
**project model** read from the real config files. The browser UI, the IDE
panels, and the MCP server are transports over that core. Every capability —
even "read `package.json`" or "swap ESLint↔Biome" — is delivered by a **plugin**
loaded into the core. Built-in features are just first-party plugins with no
special privileges the API doesn't also give third parties. This is what keeps
the plugin system honest: if a built-in can do it, a plugin can too.

```
┌───────────────────────────────────────────────────────────────────────┐
│  FACES (thin transports)                                                │
│                                                                         │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐     │
│  │ Browser UI │   │ VS Code    │   │ JetBrains  │   │ MCP server │     │
│  │ (npx)      │   │ (webview)  │   │ (JCEF)     │   │ (agents)   │     │
│  └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘     │
└────────┼────────────────┼────────────────┼────────────────┼───────────┘
         │  birpc/WS       │  postMessage    │  birpc/WS       │ JSON-RPC(stdio)
         └────────────────┬┴────────────────┴────────────────┬┘
                          ▼                                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│  DAEMON  (one local Node process per project)                          │
│   • RPC router  • session/undo journal  • auth token / origin guard    │
├───────────────────────────────────────────────────────────────────────┤
│  CORE ENGINE                                                            │
│   • Project model (parsed config, workspaces, detected tools)          │
│   • Operation registry  → plan()/apply() → Change (diff)               │
│   • Change/Diff engine  • format-preserving Writers                    │
│   • Undo journal                                                       │
├───────────────────────────────────────────────────────────────────────┤
│  PLUGIN HOST                                                           │
│   • loads plugins (built-in + community)  • capability registry        │
│   • contribution points: adapters, catalog, tools, docs, rules,        │
│     panels, migrations                                                  │
│   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐             │
│   │ @vc/core  │ │ @vc/next  │ │ oxc plugin│ │ tanstack… │  (plugins)   │
│   └───────────┘ └───────────┘ └───────────┘ └───────────┘             │
└───────────────────────────────────────────────────────────────────────┘
                          │ file I/O (format-preserving, confirmed diffs only)
                          ▼
        real files on disk:  package.json · tsconfig.json · eslint.config.js …
                          (the single source of truth; git tracks them)
```

## 2. Layers

### 2.1 Core engine
Pure TypeScript library, no transport code. Owns:
- **Project model** — parsed, typed view of the project (see
  [`01-core-engine.md`](01-core-engine.md) §Project model).
- **Operation registry** — every action is an `Operation` with a schema’d input
  and a `plan(input) → Change` / `apply(change)` pair. Nothing mutates a file
  outside `apply`, and `apply` only ever runs a Change a caller has seen.
- **Change/Diff engine + Writers** — turns intent into a minimal, format- and
  comment-preserving file edit.
- **Undo journal** — every applied Change is recorded and reversible.

### 2.2 Plugin host
Loads plugins and lets them register contributions against typed **contribution
points**. The core’s own features are packaged as first-party plugins
(`@apostel/visual-config-core`, `@apostel/typescript`, `@apostel/next`, …).
Full design in [`02-plugin-api.md`](02-plugin-api.md).

### 2.3 Daemon
A single local Node process, one per project, that hosts the core + plugin host
and exposes them over RPC. Responsibilities: RPC routing, the per-session undo
journal, and **security** — bind to `127.0.0.1`, validate `Origin`, require a
per-session token (following the MCP local-server hardening guidance). The
daemon is what `npx @apostel/visual-config` starts and what an IDE extension spawns as a
child process.

### 2.4 Faces
Thin clients. They render the UI and marshal user intent into RPC calls; they
never contain config logic.
- **Browser UI (`npx @apostel/visual-config`)** — daemon serves a prebuilt SPA (sirv-style
  static host) + a birpc-over-WebSocket channel. This is the Nuxt-DevTools
  *standalone* shape (own server + birpc + browser client).
- **VS Code** — a Webview View reuses the *same* SPA. Two options (see
  [`05-mcp-and-rpc.md`](05-mcp-and-rpc.md)): pure webview + `postMessage`
  (host does I/O), or point a webview at the daemon via `asExternalUri`. Default
  to the latter for literal UI reuse; keep postMessage as the port-less fallback.
- **JetBrains** — a tool window embeds the same SPA via JCEF (`JBCefBrowser`),
  pointed at the daemon.
- **MCP server (`visual-config mcp`)** — exposes operations as MCP tools over
  stdio (local) or streamable HTTP. See [`05-mcp-and-rpc.md`](05-mcp-and-rpc.md).

## 3. The contract that makes every face free: Operations & Changes

The reason one core serves buttons, agents, and IDE panels alike is that they
all speak the same two nouns:

- **`Operation`** — a named, schema-validated capability (`install-package`,
  `set-tsconfig-option`, `swap-linter`, `add-next-image-domain`). Registered by
  plugins.
- **`Change`** — the previewable result of planning an operation: a human
  summary, the exact file diffs, any commands to run, and enough to `apply()`
  and to undo. Nothing writes without a Change first existing.

A button in the UI, an agent’s MCP `tools/call`, and an IDE command all resolve
to *plan an Operation → present the Change → apply on confirm*. The **Diff
Sheet** (design language §8) is the human presentation of a Change; an agent
receives the same Change as structured JSON. See
[`01-core-engine.md`](01-core-engine.md) for the types.

## 4. Data flow: installing a package (worked example)

1. UI calls RPC `operation.plan("install-package", { name: "zod", range: "^3" })`.
2. Core routes to the `install-package` Operation (from `@apostel/npm`).
   It resolves the version, computes the `package.json` edit, and returns a
   **Change** (summary + diff + the `npm install` command it will run).
3. UI renders the Change in the Diff Sheet. User clicks **Confirm**.
4. UI calls RPC `operation.apply(changeId)`. Core writes the file via a
   format-preserving Writer, runs the command, records the Change in the undo
   journal, and emits a `project.changed` event.
5. All connected faces (other browser tabs, the IDE panel) refresh from the
   event. An agent doing the same thing calls the MCP tool `install_package`,
   which is the same Operation with `apply` gated behind host approval.

## 5. Technology choices (decided)

| Concern | Choice | Why |
|---|---|---|
| Core language / runtime | **TypeScript · ESM · Node ≥20** | Shared types with the UI; best JS/TS AST ecosystem; MCP/RPC SDKs are JS-first. (Rust core reconsidered only if perf demands.) |
| Repo | **pnpm-workspaces monorepo**, built with **Vite**, tested with **Vitest** | One repo, many published packages sharing types (see §5.1). |
| JSON/JSONC edits | **`jsonc-parser`** edit APIs | Minimal, comment-preserving edits to `package.json`/`tsconfig`. |
| JS/TS config edits | **`recast`**-class AST + printer | Round-trips `next.config.ts` etc. within a **static-object-literal subset**; falls back to raw when dynamic. |
| RPC (UI ⇄ daemon) | **`birpc`** over WebSocket | Proven in Nuxt/Vite DevTools; typed, bidirectional, multi-client broadcast. |
| Agent transport | **MCP** (`@modelcontextprotocol/sdk`) | stdio for local, streamable HTTP optional. |
| UI | **React** SPA consuming the design tokens | Largest contributor pool + component ecosystem; what most plugin authors know. One bundle reused in browser + IDE. |
| Plugin UI | **Declarative form schema first**, iframe panels for advanced | Most plugins ship a schema + docs, not code — safer, simpler (see plugin spec). |

### 5.1 Proposed package graph

```
packages/
  core/        @apostel/visual-config-core     — project model, operations, changes, writers, undo (no transport)
  adapters/    @apostel/adapter-*  — package-json, tsconfig, … (first-party plugins)
  server/      @apostel/visual-config-server   — the daemon: birpc/WS, session, auth/origin guard
  cli/         visual-config           — the bin: `visual-config` (serve+open browser), `visual-config mcp`
  mcp/         @apostel/visual-config-mcp      — MCP server projecting the operation registry
  ui/          @apostel/visual-config-ui       — the React SPA (browser + IDE webview)
  kit/         @apostel/visual-config-kit      — definePlugin + typed contribution API for plugin authors
```
`core` never imports a transport; `server`/`mcp`/`cli` depend on `core`; `ui`
depends only on the shared RPC/types. This is what keeps every face thin.

## 6. Non-negotiable invariants

1. **Files are the only source of truth.** No shadow store, no cache that can
   drift. The project model is a *derived read* of the files, re-read on change.
2. **No write without a confirmed Change.** Applies to plugins and agents too —
   plugins cannot touch the filesystem directly; they return Changes.
3. **Format- and comment-preserving writes**, or an explicit refusal to edit.
4. **Reversible by default** via the undo journal.
5. **Built-ins have no privileges the plugin API lacks.** Keeps the platform
   honest and the third-party experience first-class.
