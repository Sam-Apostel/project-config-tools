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

This is on-by-default-*offered* (we propose the setting; the user accepts), fully
reversible, and uses zero non-standard mechanism.

### 2.2 Opt-in: collapse from view (still native, still reversible)
For developers who want the config truly out of the tree:
- **VS Code:** write `files.exclude` entries **into workspace `.vscode/settings.json`**
  — a native, visible, user-owned setting. Because it’s in a tracked/visible
  settings file, it’s discoverable and trivially reversible; it is *not* a hidden
  visual-config mechanism.
- **JetBrains:** `TreeStructureProvider` to filter the nodes, or native Scopes.

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
