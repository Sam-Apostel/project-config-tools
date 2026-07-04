# IDE Integration — How Deep Can We Go?

> An honest feasibility read on the IDE ambitions: an in-editor project config
> panel, a form editor over `package.json`, and the "hide the config files"
> toggle. Researched July 2026 against official VS Code and JetBrains docs.

**Bottom line up front.** A form-based config panel that keeps the real files
as the source of truth is **feasible today in VS Code** (custom text editors +
webview views + tasks + JSON schemas) and **feasible-but-heavier in JetBrains**
(tool windows + `FileEditorProvider` + JCEF). Truly *hiding* config files is
only **partially** achievable and comes with real, must-disclose downsides. The
right architecture is a **shared core library with thin per-surface transports**
— the DevTools "one engine, many clients" model — not logic duplicated per IDE.

Feasibility legend: **Feasible** · **Partial** · **Aspirational**.

---

## VS Code

### Config panel in the sidebar/bottom — **Feasible**
`WebviewViewProvider` + a `views` contribution of `"type": "webview"` puts our
web UI in the sidebar or panel — exactly the Phase-2/3 "project config panel."
`createWebviewPanel` gives a full editor-area view. Webviews are isolated
iframes: all host communication is `postMessage`/`onDidReceiveMessage`, assets
go through `asWebviewUri`, and a CSP is required. The extension host (Node) does
the file I/O; the webview renders. **Precedents doing exactly this:** Draw.io,
Hex Editor, GitLens views, the Svelte/Vue devtools panels — and VS Code's own
**Settings UI is conceptually the same thing we're building** (a form over a
JSON file).

### Form editor over `package.json`, file stays canonical — **Feasible**
`CustomTextEditorProvider` (registered via the `customEditors` contribution
with a `filenamePattern` selector) is the right tool: the document stays a
normal `TextDocument`, edits apply as `WorkspaceEdit`s, so **the file on disk
stays canonical JSON**. Register it with **`priority: "option"`** so our form is
available under **"Reopen With…"** while JSON remains the default. Precedents:
Draw.io, Hex Editor, "Edit csv", Excel Viewer all replace the default editor
for their file types this way.

> **Not advisable:** forcing our form as the `"default"` editor for
> `package.json`. It collides with the built-in JSON editor and other
> extensions, power users dislike losing raw text on click, and users can
> override the association anyway (`workbench.editorAssociations`). Ship as
> "Reopen With" + a sidebar panel.

> **Direct prior art:** [`liriliri/vscode-settings-editor`](https://github.com/liriliri/vscode-settings-editor)
> already ships a `CustomTextEditorProvider` form UI for `package.json`,
> `tsconfig.json`, `.prettierrc`, etc., registered at **`priority: "option"`**
> (opened via "Reopen With"). It validates both the pattern and the recommended
> registration mode. `hediet/vscode-drawio` is the canonical
> `CustomTextEditorProvider` blueprint for text-backed sync.

### Run/manage npm scripts — **Feasible**
`taskDefinitions` + `registerTaskProvider` + `tasks.executeTask()` /
`fetchTasks({type:'npm'})`, with `ShellExecution`/`ProcessExecution`. VS Code
already **auto-detects npm scripts** (`npm.autoDetect`) and ships an "NPM
Scripts" tree view — we surface, run, and add scripts trivially. (Note:
Shell/Process execution can be unavailable in restricted/web envs; check
`tasks.shellExecutionSupported`.)

### Config validation & completion — **Feasible without a custom LSP**
The built-in JSON language service gives completion + hover + red-squiggle
validation for free via the `jsonValidation` contribution (map `fileMatch` → a
JSON Schema) and **SchemaStore** (800+ schemas; `package.json`/`tsconfig`
already covered). **Don't write a language server** for config — schemas cover
JSON/JSONC; JS/TS configs (`next.config.ts`) lean on the TS server + `@types`.
Reserve an LSP only if we later want cross-editor language intelligence (which
would double as the cross-IDE core).

### Hiding config files — **Partial (and leaky — be honest)**
- **Nesting under `package.json`** via `explorer.fileNesting.patterns` (stable
  since VS Code 1.67) is **Feasible** and good UX — antfu's widely-copied config
  nests `tsconfig*`, `.eslintrc*`, `.prettierrc*`, `next.config.*`, lockfiles,
  `.npmrc`, `.env*` under `package.json`. This is the low-risk default.
- **True hiding** via `files.exclude` genuinely removes files from the Explorer
  tree and Quick Open, and an extension *can* write it
  (`getConfiguration('files').update('exclude', …, ConfigurationTarget.Workspace)`).
  But:
  - **No contribution point** exists for `files.exclude` *or* `fileNesting` —
    an extension can only **mutate the user's `.vscode/settings.json`**, which
    is invasive and shows up in their diffs. (antfu's nesting extension exists
    precisely because it must write settings, not contribute them.)
  - `files.exclude` **hides, it does not remove.** Files stay on disk, are still
    compiled by `tsc`/`eslint`/`next`/CI, still open via path or go-to-def, and
    **still appear in the Git/SCM panel, `git status`, and PRs** (SCM ignores
    `files.exclude`).

  → **Verdict: Partial.** Ship hiding as an explicit, off-by-default,
  clearly-labeled opt-in with a persistent "N config files managed · Reveal in
  Explorer" affordance. Never imply the files are gone.

---

## JetBrains (IntelliJ / WebStorm) — Feasible but heavier

- **Tool window + embedded web UI — Feasible.** `ToolWindowFactory` (via
  `com.intellij.toolWindow`) docks a panel; embed the *same web UI* with
  **JCEF** (`JBCefBrowser`), bridging JS↔Kotlin via `JBCefJSQuery`. Many
  plugins already embed JCEF (Markdown preview, DB tools, AI assistants).
- **Augmented `package.json` editor — Partial.** `FileEditorProvider` +
  `FileEditor` can add a JCEF-backed form tab (like the GUI-designer's
  Design/Text tabs). `getPolicy()` can even `HIDE_DEFAULT_EDITOR`, but for
  `package.json` that fights WebStorm's substantial built-in tooling — not
  advisable.
- **Hiding/restructuring the Project view — Partial-to-Feasible (cleaner than
  VS Code).** JetBrains exposes `TreeStructureProvider` — a real programmatic
  hook to filter/hide/nest nodes — plus built-in File Nesting and Scopes. Same
  honest caveat: view-only; VCS, indexing, and external tools still see the
  files.
- **Overall:** achievable but **materially more work** (Kotlin/Java, JCEF
  plumbing, IntelliJ Platform SDK, Gradle build, slower iteration). Realistic
  plan: **VS Code first; JetBrains later as a JCEF shell around the same web
  UI and the same core.**

---

## The shared-core architecture (the key strategic decision) — **Feasible & recommended**

The proven model is LSP's "one core, many clients" — Microsoft created LSP to
collapse an **M×N** problem (M languages × N editors) into **M+N**, and
rust-analyzer, tsserver, ESLint, and **Biome** all demonstrate it. Crucially,
the wire format is the same everywhere: **LSP and MCP are both JSON-RPC 2.0**,
so one core can back editor clients *and* agents over the same transport family.

**Existence proof that the "one core → many faces" split works for exactly our
domain:** **Biome** ships a single Rust core reused as CLI **and** LSP
(`biome_lsp`); **ESLint** now ships `@eslint/mcp` (`npx @eslint/mcp`) so the
*same* ESLint core is CLI + LSP + **MCP**. That is precisely the CLI + UI + MCP
triad visual-config wants — already validated by first-party tools. visual-config should mirror
it:

```
        ┌───────────────────────────────────────────┐
        │   CORE LIBRARY (TS)                          │
        │   parse · validate · edit config             │
        │   format/comment-preserving writes · schema  │
        └───────────────┬──────────────────────────────┘
              thin transport adapters:
     postMessage │        HTTP/WS │            stdio │
   ┌─────────────▼─┐  ┌───────────▼────────┐  ┌───────▼───────┐
   │ VS Code ext   │  │ Local dev server + │  │ MCP server    │
   │ (webview)     │  │ browser UI (npx)   │  │ (AI agents)   │
   └───────────────┘  └────────────────────┘  └───────────────┘
   ┌───────────────┐  ▲ JetBrains JCEF points at the same UI
   │ JetBrains JCEF│──┘
   └───────────────┘
```

- **DevTools precedent:** **Nuxt DevTools** runs a server (`@nuxt/devtools-kit`)
  exposing typed RPC over WebSocket via **`birpc`**, serving a Vue UI as an
  iframe overlay — and the *same UI* embeds in VS Code. **`vite-plugin-inspect`**
  mounts middleware on the dev server serving an SPA. Lesson: **build the UI
  once**, serve it from a local Node server for the browser, reuse the same
  bundle inside the IDE.
- **In VS Code, two reuse paths:** (1) **pure webview + postMessage** (bundle UI
  as static assets, host does I/O) — most robust, works in Remote/Codespaces;
  (2) **webview iframe → localhost server** — maximizes reuse but fragile under
  port-forwarding/CSP. Prefer (1); the core stays a library either way.
- **`birpc`** is a good typed-RPC choice to share message contracts across
  browser and IDE.

---

## The MCP angle — **Feasible, near-free if the core is a library**

If config logic lives in the shared core, the MCP server is a thin stdio/HTTP
wrapper exposing the *same functions the UI calls* as tools —
`list_scripts`, `read_config`, `add_dependency`, `set_tsconfig_option`,
`swap_linter`, `apply_config_change` — returning structured **diffs**. Agents
then edit config through the identical validated, format-preserving code path
as humans. **If logic is instead trapped in the VS Code extension host, MCP
reuse becomes a rewrite** — which is the single strongest reason to build the
core standalone first.

---

## Risks of hiding config files (the part to be careful about)

| Risk | Detail | Mitigation |
|---|---|---|
| **Git still shows them** | `git status`, diffs, PRs, SCM panel all display "hidden" files; it's a per-user *view* setting. | Frame hiding as cosmetic decluttering, never as "managing them away." |
| **Other tools read the real files** | `tsc`/`eslint`/`prettier`/`next`/bundlers/CI read disk regardless. The file must stay the **single source of truth**, never a cache. | Round-trip every edit to the real file, format- & comment-preserving (`jsonc-parser` for JSON/tsconfig; `recast`-class AST tools for JS configs). |
| **`next.config.js` is code, not data** | Executable JS with conditionals and composed plugins (`withX(...)`). A form can only round-trip a **static object-literal subset**. | Detect non-static configs; fall back to raw editing with a clear "too dynamic to edit visually" message. Never silently rewrite logic. |
| **"Magic" / drift distrust** | Hiding breeds the create-react-app `eject` problem; new contributors don't know files exist. | Opt-in, off by default; persistent "N config files managed · Reveal" badge. |
| **Onboarding** | A teammate with the extension may forget files exist; one without sees raw files (fine — canonical). | Never break the raw path; augment, don't replace. Surface any drift in the UI. |

**Recommended stance:** ship **nesting-under-`package.json` as the low-risk
default** and **full hiding as an explicit, labeled opt-in**. Position visual-config as
a *lens over the real files*, not a replacement for them.

---

## Zed — MCP-native, no embedded UI (researched 2026)

Zed is a deliberately different case. Extensions are **Rust compiled to
WebAssembly** in a sandbox with **no access to Zed’s GPUI** — so there is **no
webview, no custom panel, and no custom editor**. Our rich UI **cannot** be
embedded in Zed today (it’s an open, unbuilt upstream request; even the
aspirational future is a *declarative native* rendering API, not a browser). We
don’t fight this — the Operation/MCP architecture degrades to Zed’s real
strengths without a rewrite:

- **MCP context server — Feasible, and the primary integration.** Zed has
  first-class MCP support. A ~30-line extension declares
  `[context_servers.visual-config]` in `extension.toml` and returns
  `visual-config mcp` from `context_server_command`; Zed’s Agent Panel then gets
  our guarded config tools. (Users can also add it via `context_servers` in
  `settings.json`, no extension needed.)
- **Tasks — Feasible.** `.zed/tasks.json` (also imports `.vscode/tasks.json`)
  runs `package.json` scripts and can launch `npx @apostel/visual-config`.
- **JSON schema — Feasible.** Config validation/completion via
  `json-language-server` schema associations.
- **Embedded panel / form editor — Not possible.** The rich UI is the browser
  app next to Zed, launched from a Zed task.
- **File decluttering — Partial (coarse).** Only `file_scan_exclusions` in
  `.zed/settings.json`; **no file nesting**, and extensions can’t touch the
  project panel.

Sources: zed.dev/docs (developing-extensions, ai/mcp, mcp-extensions, tasks,
languages/json, all-settings), `zed_extension_api` crate, zed-industries/zed
issues #21208 (webview), #7092 (file nesting), discussion #37270 (custom editor).

## Consolidated feasibility matrix

| Capability | VS Code | JetBrains | Zed |
|---|---|---|---|
| Web UI panel in sidebar/panel | **Feasible** (WebviewView) | **Feasible** (ToolWindow + JCEF) | **Not possible** (no webview/panel API) |
| Form over `package.json`, file stays canonical | **Feasible** (CustomTextEditor, "Reopen With") | **Partial** (FileEditorProvider + JCEF) | **Not possible** (no custom editor) |
| Force our editor as *default* for `package.json` | Possible, **not advisable** | Possible (`HIDE_DEFAULT_EDITOR`), **not advisable** | n/a |
| Nest config under `package.json` | **Feasible** (fileNesting) | **Feasible** (File Nesting / TreeStructureProvider) | **Not supported** (no nesting) |
| Truly hide config files | **Partial** (`files.exclude`, leaky, mutates settings) | **Partial-to-Feasible** (`TreeStructureProvider`) | **Partial** (`file_scan_exclusions`, user settings only) |
| Run/manage npm scripts | **Feasible** (Tasks API, built-in) | **Feasible** (built-in) | **Feasible** (`.zed/tasks.json`) |
| Config validation/completion | **Feasible** (schemas, no custom LSP) | **Feasible** (built-in) | **Feasible** (json-language-server schemas) |
| Shared core across surfaces | **Feasible** (library + adapters) | **Feasible** (JCEF → same core) | **Feasible** (MCP + browser, not embedded) |
| MCP server on same core | **Feasible** (thin wrapper) | n/a (transport-agnostic) | **Feasible & native** (context server) |

**Realistic build order:** (1) core library + npx server + browser UI; (2) MCP
wrapper (cheap once the core exists) — **this also unlocks Zed immediately**;
(3) VS Code extension reusing the UI via webview/postMessage; (4) Zed extension
(thin MCP context-server wrapper, near-free); (5) JetBrains via JCEF last.
Editing `next.config.*` (executable code) is the single biggest technical risk —
scope it to static configs with a graceful raw-editing fallback.

---

### Primary sources
VS Code API: webview, webview-view, custom-editors, task-provider,
`contributes.jsonValidation`/`taskDefinitions`; settings reference for
`files.exclude` / `search.exclude` / `explorer.fileNesting`; v1.67 release
notes (file nesting). JetBrains Platform SDK: tool windows, file editors, JCEF,
tree structure providers. `modelcontextprotocol.io`. Nuxt DevTools /
`vite-plugin-inspect` / `birpc` repos. antfu/vscode-file-nesting-config.
