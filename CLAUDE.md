# CLAUDE.md

Guidance for working in this repo. Read this before making changes.

## What this is

`visual-config` — a visual interface for JS/TS project configuration that lives
**on top of** the real config files. Vision docs are in [`docs/`](docs/); the
technical specs the code follows are in [`docs/spec/`](docs/spec/).

## The one architectural rule

**One headless core, many thin faces. Everything is an Operation that yields a
previewable, reversible Change. Everything is a plugin, including built-ins.**

- The **core** (`@visual-config/core`) knows nothing about HTTP/DOM/MCP. It
  exposes `Operation`s (each `plan()`s a `Change`) and a `ProjectModel` read from
  the real files.
- The **daemon**, **UI**, and **MCP server** are thin transports over the core.
- Buttons, agent tool-calls, and IDE commands all resolve to
  **plan → present → apply-on-confirm**.

## Invariants (do not break)

1. **Files are the only source of truth.** No shadow store. The project model is
   a derived read, re-read on change.
2. **No write without a confirmed Change.** `plan()` MUST NOT write. `Engine.apply`
   is the only writer. Plugins can't touch the filesystem — they return Changes.
3. **Format- and comment-preserving writes**, or an explicit refusal. Edit JSON
   via `jsonc-parser` (see `json/edit.ts`), never `JSON.stringify` a whole file.
4. **Reversible by default** via the journal.
5. **Enforced scope.** Every Operation declares `scope.writes`; the engine
   rejects out-of-scope edits (`scope.ts`).
6. **Facts vs. opinions.** The base ships only verifiable facts (outdated,
   vulnerable, …). Opinions come only from installed packs — never bake taste in.

## Packages (pnpm workspace under `packages/`)

| Package                   | Role                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `@visual-config/core`     | engine: project model, operations, Change/undo, writers, registry/diagnostics, plugin host |
| `@visual-config/protocol` | shared birpc contract (types only)                                                         |
| `@visual-config/server`   | daemon: HTTP static SPA + WebSocket birpc + script tasks                                   |
| `@visual-config/ui`       | React SPA (browser + future IDE webview)                                                   |
| `@visual-config/mcp`      | MCP server projecting operations as agent tools                                            |
| `@visual-config/kit`      | author-facing `definePlugin` + types                                                       |
| `visual-config` (cli)     | the `visual-config` bin                                                                    |

## Commands

```bash
pnpm install
pnpm test          # vitest: unit + daemon integration (browser-free)
pnpm typecheck     # tsc -p tsconfig.json across the workspace
pnpm format        # prettier --write (code only; docs are excluded)
pnpm build:ui      # build the SPA the daemon serves
# run against a project:
pnpm --filter visual-config exec tsx src/bin.ts --cwd /path/to/project
pnpm --filter visual-config exec tsx src/bin.ts mcp --cwd /path/to/project
```

## Conventions

- **TypeScript, ESM, Node ≥20.** `verbatimModuleSyntax` is on — use
  `import type` for type-only imports. `noUncheckedIndexedAccess` is on — guard
  or `!` array access.
- Imports use extensionless `.js` specifiers resolved by the bundler
  (`moduleResolution: Bundler`); dev runs via `tsx`, the UI via Vite. No build
  step needed to run.
- **Tests** live next to source as `*.test.ts`. The write layer has golden tests
  (`json/edit.test.ts`) — extend them when touching it.
- Add a new **operation**: implement `Operation` in `core/src/operations/`, add
  it to `builtinOperations` in `core/src/index.ts`, and test it. It then appears
  automatically in the UI Diff-Sheet flow and as an MCP `plan_*` tool.
- Add a **plugin**: `definePlugin({ id, setup(ctx) })` from `@visual-config/kit`;
  register operations/detectors on `ctx`.

## Verifying UI/daemon changes end-to-end

The committed suite is browser-free. For manual end-to-end checks, a throwaway
`playwright-core` script driving the built UI works (see git history around M0);
keep such scripts out of the committed tree (`.vc-tmp/` is gitignored).

## Repo workflow

Pushes go straight to `main` until v1 (no PRs yet). Commit often, keep `main`
green (typecheck + tests). Don't put the model identifier in commits/PRs.
