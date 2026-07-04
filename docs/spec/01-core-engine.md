# Spec 01 — Core Engine

> The headless heart: the project model, the Operation/Change contract, the
> write layer, and the undo journal. Concrete TypeScript interfaces below are
> **proposed shapes**, not final API. Status: draft.

Related: [`00-architecture.md`](00-architecture.md) · [`02-plugin-api.md`](02-plugin-api.md) ·
[`03-config-adapters.md`](03-config-adapters.md)

---

## 1. Project model

A typed, derived read of the project. Re-read (incrementally) whenever a watched
file changes. **Never** authoritative over the files — always a mirror.

```ts
interface ProjectModel {
  root: string;                       // absolute project root
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun';
  workspaces: Workspace[];            // monorepo packages ([] or [root] if single)
  files: ConfigFileRef[];             // every config file we recognize, on disk
  detected: DetectedTool[];           // frameworks/tools found (next, vitest, biome…)
  // Adapter-parsed views are lazy and keyed by file; see ConfigDocument below.
}

interface ConfigFileRef {
  path: string;                       // relative to root
  kind: string;                       // 'package.json' | 'tsconfig' | 'eslint' | 'next' | …
  adapter: string;                    // id of the adapter that owns it
  format: 'json' | 'jsonc' | 'js' | 'ts' | 'yaml' | 'toml';
  editable: 'full' | 'static-subset' | 'read-only'; // how safely we can write it
}

interface DetectedTool {
  id: string;                         // 'next' | 'vitest' | 'biome' | 'oxlint' | …
  version?: string;
  evidence: string[];                 // why we think so (dep present, config file, script)
  pluginId?: string;                  // plugin that claims/handles it
}
```

Detection is itself pluggable (see [`02-plugin-api.md`](02-plugin-api.md)
`registerDetector`) so an `oxc` or `tanstack` plugin can teach the model to
recognize its tools.

## 2. The Operation / Change contract

Everything that *does* something is an Operation. Everything an Operation
*proposes* is a Change. This pair is the entire mutation surface of the product.

```ts
interface Operation<Input = unknown> {
  id: string;                         // 'install-package', 'set-tsconfig-option', …
  title: string;                      // human label ("Install package")
  summary: string;                    // one line for menus/agent discovery
  inputSchema: JSONSchema;            // validates UI form input AND MCP tool args
  risk: 'safe' | 'review' | 'breaking'; // default disclosure level (see §5)
  scope: OperationScope;              // what it may touch — enforced (see §6)

  /** Pure-ish: read project + input, produce a preview. MUST NOT write files. */
  plan(ctx: OperationContext, input: Input): Promise<Change>;

  /** Execute a previously-planned Change. The ONLY place writes happen. */
  apply(ctx: OperationContext, change: Change): Promise<ApplyResult>;
}

interface Change {
  id: string;
  operationId: string;
  summary: string;                    // "Install zod@3.23.8 as a dependency"
  risk: 'safe' | 'review' | 'breaking';
  edits: FileEdit[];                  // exact, minimal, per-file diffs
  commands: PlannedCommand[];         // e.g. { run: 'npm install', reason: … }
  notes: ChangeNote[];                // warnings, lossy-migration disclosures, doc links
  reversible: boolean;               // false only when we genuinely can't undo (rare; disclosed)
}

interface FileEdit {
  path: string;
  before: string | null;              // null = file created
  after: string | null;               // null = file deleted
  diff: UnifiedDiff;                  // rendered for the Diff Sheet
}

interface PlannedCommand {
  run: string;                        // exact argv, shown before it executes
  reason: string;
  installScripts?: 'run' | 'skip';    // default skip for untrusted lifecycle scripts
}
```

Design consequences:
- **`plan` never writes.** A caller (human or agent) always inspects a Change
  before `apply`. This is invariant #2 from the architecture doc.
- **The same `inputSchema`** validates a UI form, an IDE quick-input, and an MCP
  tool call. One schema, three faces.
- **`risk`** drives disclosure and auto-apply policy (§5).
- **`commands` are shown verbatim** before running, and lifecycle/install
  scripts default to `skip` — directly serving the "no surprise script
  execution" goal.

## 3. The write layer (the crown jewels)

The most trust-critical code. Two writer families, chosen per file `format`:

- **Structured JSON/JSONC** (`package.json`, `tsconfig.json`, most linter
  configs): edits via `jsonc-parser`’s `modify`/`applyEdits`, which change only
  the touched span — key order, whitespace, and comments (JSONC) are preserved.
- **JS/TS configs** (`next.config.ts`, `vite.config.ts`): parse to an AST
  (`recast`-class, preserving original formatting), mutate **only** within a
  **static-object-literal subset**, and reprint. If the target region is
  dynamic (a function, spread, imported value, conditional), the writer
  **refuses** and the Operation returns a Change with `edits: []` and a note
  carrying the exact snippet to paste + doc link. Refusing is a feature.

```ts
interface Writer {
  canEdit(doc: ConfigDocument, path: JsonPath): EditCapability; // full | static-subset | refuse
  edit(doc: ConfigDocument, ops: DocEdit[]): FileEdit;          // minimal diff, format-preserving
}
```

Every Writer output is a `FileEdit` with `before`/`after`, so the Diff Sheet and
the undo journal get the exact bytes. **The write layer ships with a golden-file
test suite from day one** (round-trip: parse → edit → reprint must change only
the intended span across a corpus of real-world configs).

## 4. Undo journal

```ts
interface JournalEntry {
  changeId: string;
  operationId: string;
  actor: 'user' | 'agent' | 'plugin';
  appliedAt: number;                  // stamped by the daemon, not the core
  inverse: FileEdit[];                // precomputed reverse edits
  ranCommands: string[];              // for disclosure; command effects (installs) undone via inverse edits + reinstall
}
```

- Applied Changes are pushed to a per-project journal (persisted under a
  dot-dir, e.g. `.visual-config/journal`, gitignored).
- **Undo** reverses `inverse` edits and, when needed, re-runs install to
  reconcile `node_modules`. File edits are always reversible; side effects
  (network installs) are reconciled, not time-traveled — disclosed when so.
- The journal is the audit log for *who changed what* — especially valuable for
  agent actions.

## 5. Risk & auto-apply policy

`risk` is honest, consistent, and drives behavior:

| risk | meaning | UI default | agent (MCP) default |
|---|---|---|---|
| `safe` | reversible, no behavior change (format, patch bump, add script) | may offer "apply without diff" opt-in | may auto-apply if host allows |
| `review` | reversible but changes behavior (minor bump, config value, linter rule) | always show Diff Sheet | require explicit approval |
| `breaking` | may break build/tests (major bump, tool swap, migration) | Diff Sheet + extra confirm + "run your tests" | require approval + surface risk analysis |

## 6. Operation scope (enforced capability boundary)

An Operation declares what it may touch; the core **enforces** it so a
misbehaving plugin can’t reach outside its lane.

```ts
interface OperationScope {
  writes?: string[];    // glob(s) of files it may edit, e.g. ['package.json', '.oxlintrc.json']
  runs?: 'none' | 'package-manager' | 'declared'; // may it run commands, and which
  network?: 'none' | 'registry';                  // may it hit the network, and where
}
```

The daemon rejects any `FileEdit`/`PlannedCommand` outside the declared scope
before it reaches the user. This is how third-party plugins stay safe (see
[`02-plugin-api.md`](02-plugin-api.md) §Security).

## 7. Events

The core emits typed events the daemon broadcasts to all faces:
`project.changed`, `operation.applied`, `plugin.loaded`, `diagnostics.updated`
(vulns/outdated/improvements recomputed). Faces are stateless renderers of these.

## 8. What lives where (so MCP is free)

Because operations, schemas, and Changes live in the core — not in any face —
the MCP server (spec 05) is a thin loop: list operations → expose each as a
tool whose `inputSchema` is the operation’s → `tools/call` = `plan` (+ gated
`apply`). Nothing about agents leaks into the core. This is the payoff of the
whole design.
