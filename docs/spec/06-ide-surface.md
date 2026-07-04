# Spec 06 — IDE Surface & "Cleaner Workspace" Toggle

> How the IDE faces embed the core UI, and how the "hide config files" feature
> works — as a **cleaner work surface using IDE-native features**, explicitly
> *not* a lock-away. Status: draft. Builds on the research in
> [`../IDE-INTEGRATION.md`](../IDE-INTEGRATION.md).

Related: [`00-architecture.md`](00-architecture.md) · [`05-mcp-and-rpc.md`](05-mcp-and-rpc.md)

---

## 1. Embedding the panel

Same SPA as `npx visual-config`, embedded per IDE, talking to a spawned daemon
(spec 05 §2):
- **VS Code** — a `WebviewView` in the sidebar/panel; `package.json` form offered
  via `CustomTextEditorProvider` at `priority: "option"` ("Reopen With"), never
  forced default. Scripts via the Tasks API. (Prior art:
  `liriliri/vscode-settings-editor`, `hediet/vscode-drawio`.)
- **JetBrains** — a tool window embedding the SPA via JCEF; optional
  `FileEditorProvider` form tab alongside the JSON editor (never
  `HIDE_DEFAULT_EDITOR`).
- **Zed** — *cannot* embed the SPA (see §4); integrates via MCP + tasks +
  browser handoff instead.

## 1a. Zed — MCP-native, no embedded panel (graceful degradation)

Zed’s extension model is fundamentally different and, for our purposes,
**more limited on UI but excellent on agents**. Extensions are Rust compiled to
WebAssembly in a sandbox with **no access to Zed’s GPUI** — there is **no
webview, no custom panel, no custom editor**. Our rich UI simply cannot live
inside Zed today (this is an acknowledged, unbuilt feature request upstream; even
the aspirational future is a *declarative native* API, not a browser). So we do
**not** fight it — we lean on what Zed does have, and the architecture degrades
without a rewrite because everything is already an Operation exposed over MCP.

Zed integration = three native surfaces:

1. **MCP context server (the primary, deepest integration).** Zed natively
   supports MCP servers ("context servers"). We ship a tiny Zed extension whose
   `extension.toml` declares a `[context_servers.visual-config]` and whose Rust
   `context_server_command` just launches `visual-config mcp` (spec 05). Zed’s
   Agent Panel then gets our guarded, diff-previewed, reversible config tools
   natively. Users who’d rather not install an extension can add the same server
   via `context_servers` in `settings.json`. **This is nearly free** — it’s the
   MCP server we’re already building, wrapped in a ~30-line extension.
2. **Tasks for scripts.** Zed has a tasks system (`.zed/tasks.json`, and it
   imports `.vscode/tasks.json`). `visual-config` can generate task entries for
   `package.json` scripts (and an "Open visual-config" task that runs
   `npx visual-config`), so scripts and launching the browser UI are one
   command-palette action away — parallel to the VS Code Tasks integration.
3. **JSON schema associations.** Zed validates JSON via `json-language-server`;
   we can ensure config files get schema validation/completion through its
   `lsp.json-language-server.settings.json.schemas` settings.

**The rich UI in a Zed workflow** is `npx visual-config` in the browser next to
Zed (exactly as it works with any editor), launchable from a Zed task. This is a
first-class, honest story: Zed users get the *agentic* half deeply integrated and
the *visual* half a keystroke away — we just don’t pretend the panel embeds when
it can’t.

## 2. The "cleaner workspace" toggle — design intent

The goal is **a calmer file tree**, not hidden state. Explicitly:

> We want the developer to have a cleaner work surface. We do **not** want to
> make config files hard to access, replace them, or imply they’re gone.

So the feature is built entirely on **IDE-native presentation features** — the
same ones a developer could toggle by hand — and never on any mechanism that
changes what tools, git, or CI see.

### 2.1 Default: nest, don’t hide (low-risk)
Use **native file nesting** to tuck config under `package.json`:
- **VS Code:** `explorer.fileNesting.enabled` + `explorer.fileNesting.patterns`
  (offered as a workspace setting the user accepts, antfu-style). Children
  collapse under `package.json`; nothing is hidden, everything one expand away.
- **JetBrains:** the native File Nesting rules, contributable via
  `com.intellij.projectViewNestingRulesProvider`.
- **Zed:** ❌ no file-nesting feature exists (and extensions can’t touch the
  project panel), so nesting isn’t offered on Zed — only the coarse opt-in below.

This is on-by-default-*offered* (we propose the setting; the user accepts), fully
reversible, and uses zero non-standard mechanism.

### 2.2 Opt-in: collapse from view (still native, still reversible)
For developers who want the config truly out of the tree:
- **VS Code:** write `files.exclude` entries **into workspace `.vscode/settings.json`**
  — a native, visible, user-owned setting. Because it’s in a tracked/visible
  settings file, it’s discoverable and trivially reversible; it is *not* a hidden
  visual-config mechanism.
- **JetBrains:** `TreeStructureProvider` to filter the nodes, or native Scopes.
- **Zed:** `file_scan_exclusions` in `.zed/settings.json` (a native, visible,
  user-owned setting) collapses matched files from the project panel. Coarse
  (glob-based, no nesting), but honest and reversible like the others. Since Zed
  has no config-panel extension, the "Reveal" affordance lives in the browser UI
  rather than in-editor.

### 2.3 Guardrails that keep it honest
- **Off by default.** Nesting is offered; full hiding is explicit opt-in.
- **Always-present reveal.** A persistent affordance in the panel: "N config
  files managed · **Reveal in Explorer**" that clears the exclusion instantly.
- **Truthful copy.** The toggle says exactly what it does: "Collapse config
  files from the file tree (they stay on disk; git, CI, and other tools still
  see them)."
- **Native-only.** We only ever write standard IDE settings the user could set
  themselves. No custom overlay that fakes a filesystem. If the user uninstalls
  the extension, the worst case is a couple of standard settings lines they can
  see and delete.
- **Never for git/SCM.** We never touch `.gitignore` or the SCM view — hiding is
  purely the file *explorer*, and we say so.

## 3. Why native-only matters

This keeps the feature aligned with invariant #1 (files are the source of
truth). Every "hide" is a standard editor view setting, visible and owned by the
user, reversible with one click, and invisible to every other consumer of the
files. It’s decluttering, honestly scoped — the weakest part of the original
vision turned into a safe, native convenience.
