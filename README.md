<h1 align="center">visual-config</h1>
<p align="center"><em>One surface for every config.</em></p>

<p align="center">
A visual control surface for JavaScript/TypeScript project configuration —
dependencies, scripts, TypeScript, linters, framework config, and npm
publishing — that lives <strong>on top of</strong> the config files you
already have.
</p>

> [!IMPORTANT]
> **Status: early alpha — runs from source, not yet published to npm.**
> The core spine works today: `npx`-style browser UI + daemon, the
> Operation→Change→undo engine, a package catalog, outdated diagnostics, and an
> MCP server. Not everything described below is built yet — see
> [what works today](#what-works-today) and [`docs/ROADMAP.md`](docs/ROADMAP.md).
>
> _`visual-config` is a descriptive package name, not a brand — see [`docs/DESIGN-LANGUAGE.md`](docs/DESIGN-LANGUAGE.md)._

---

## What works today

Running from source (see [Development](#run-it-from-source-development)):

- 🟢 `visual-config` boots a local daemon and opens a **React UI** in the browser
- 🟢 **Overview / Dependencies / Scripts / History** views over your real `package.json`
- 🟢 **Package catalog** — search the npm registry, install by selecting (no free-typed name)
- 🟢 **Outdated diagnostics** — facts from the registry, with Upgrade buttons
- 🟢 **Run scripts** as buttons with streamed output
- 🟢 The **Diff Sheet** — every mutation previewed and confirmed, with **undo**
- 🟢 Operations: add/remove script, install/remove dependency, set tsconfig option
- 🟢 **MCP server** (`visual-config mcp`) exposing the same operations to agents
- 🟡 Next up: the plugin API, opinions, migrations, more config adapters, IDE panels

Everything writes through a **format- and comment-preserving** layer, and the
files stay the only source of truth.

---

## Why

Configuring a JS/TS project means hand-editing a dozen text files —
`package.json`, `tsconfig.json`, `next.config.js`, ESLint/Prettier/Biome
configs — that reward memorizing schemas and command flags over engineering.
It drifts, it conflicts in merges, and a single `npx` typo can execute an
arbitrary package. visual-config gives that configuration a real interface while
keeping the files as the source of truth. Read the [Manifesto](MANIFESTO.md).

## What it does (intended)

- **See everything in `package.json`** — deps, scripts, metadata, workspaces,
  publish config — in a clean, glanceable UI instead of a JSON blob.
- **Package health** — vulnerabilities, outdated deps, and deprecations
  surfaced with severity, each with an **Upgrade** or **Migrate** button that
  previews the exact change.
- **Know which upgrades are safe** — for every outdated dep, read the changelog
  between your version and the latest, with breaking changes flagged and
  cross-referenced against _your_ code so you (or an AI) can tell which major
  bumps are actually safe to take. Migrations are backed by codemods or, where
  none exist, maintainer-authored agent skills.
- **Install from a catalog** — browse packages with search and filters
  (types, size, popularity, license, maintained). Installing is _selecting_,
  not typing a name into a command. No free-typed install path.
- **Run scripts as buttons** — every `package.json` script becomes a labeled
  button with live output. No recalling incantations.
- **Understand your TypeScript setup** — see effective compiler options and
  what's non-default, as neutral facts. (Suggestions like "turn on `strict`"
  come from opinion packs you install — see below — never baked in.)
- **Neutral base, installable opinions** — out of the box the tool states only
  _facts_ (vulnerable, outdated, type-wrong, non-default). Want guidance?
  Install an **opinion pack** attributed to someone you trust — the TypeScript
  team, Matt Pocock, Vercel, Tanner — and its recommendations appear, labeled as
  theirs. Stack several; see where they disagree; pick. The maintainer's taste
  is never in the tool.
- **Guided framework config** — e.g. add an allowed image domain to
  `next.config` through a form with inline helper docs, not by guessing the
  key shape.
- **One-click tooling swaps** — move between Biome and ESLint+Prettier, or to
  oxlint/oxfmt, with a full preview of every file added/removed/changed.
- **npm publish setup** — scaffold and audit `exports`, `files`, provenance,
  and metadata against the latest recommendations, docs in reach.
- **Extensible via plugins** — tool owners ship their own vertical. An `oxc`
  plugin can add oxlint/oxfmt catalog filters, a config UI, and the swaps; a
  `tanstack` plugin can add docs for TypeScript/dev-server/testing and its own
  panel. The built-in features are themselves plugins on the same API.
- **Every change is a reviewed diff** — nothing is written without showing you
  the exact file change first. Reversible by default. The same operations are
  available to AI agents over MCP, with the same guardrails.

## How you'll use it (intended)

### 1. The `npx` command (Phase 1)

```bash
# In any JS/TS project directory:
npx visual-config
```

This opens visual-config in your browser, pointed at the current project. It reads
your real config files, presents them as a UI, and writes changes back as
minimal diffs you confirm. Install it locally to pin a version:

```bash
npm install -D visual-config   # then: npx visual-config  (or a "visual-config" script)
```

> [!NOTE]
> **On the "npx typo" concern:** the point of visual-config is precisely to _stop_
> installing packages by typing names into commands. You run one trusted,
> pinned command (`visual-config`) and then install everything else by selecting it
> from a catalog backed by verified registry data. See the safety model in
> [`docs/ANALYSIS.md`](docs/ANALYSIS.md).

### 2. The IDE panels (Phase 6)

VS Code and JetBrains extensions embed the same surface as a **project config
panel** next to your code — with an optional **cleaner-workspace** toggle that
tidies config files out of the file tree using **native IDE features** (file
nesting, `files.exclude`). It's decluttering, not lock-away: the files stay on
disk, git and every other tool still see them, and a persistent "Reveal in
Explorer" is always one click away. **Zed** can't embed the panel (its
extensions have no webview API), but it's **natively MCP-first**, so it gets our
config tools in its agent panel plus a browser handoff for the UI. One core
engine, shown wherever it fits. Feasibility and limits in
[`docs/IDE-INTEGRATION.md`](docs/IDE-INTEGRATION.md); design in
[`docs/spec/06-ide-surface.md`](docs/spec/06-ide-surface.md).

### 3. The MCP server (for agents)

Every operation visual-config exposes as a button — install, upgrade, migrate, switch
linter, add an image domain — is also exposed as an **MCP server** so AI
agents get _guided, validated, reversible_ config tools instead of free-typing
shell commands:

```bash
# Intended: run visual-config's tools as an MCP server for your agent
npx visual-config mcp
```

Agents call the same guardrailed operations you do — diffs, validation, undo —
which is exactly where you want them constrained as they take on more work.

## Principles you can rely on

- **Your files stay the source of truth.** No shadow config, no lock-in.
  Uninstalling leaves your project byte-for-byte as it was.
- **Minimal diffs, preserved formatting** and comments where the format allows.
- **Nothing writes without a confirmed diff.** Human or agent.
- **Reversible by default.**

## Documentation

| Doc                                                | What's in it                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [MANIFESTO.md](MANIFESTO.md)                       | Why this exists and what we believe                                                                                     |
| [docs/ANALYSIS.md](docs/ANALYSIS.md)               | What's possible + feasibility score on every part of the vision                                                         |
| [docs/ROADMAP.md](docs/ROADMAP.md)                 | Phased plan from `npx` tool to IDE plugins to MCP                                                                       |
| [docs/PRIOR-ART.md](docs/PRIOR-ART.md)             | Existing projects in this space and the gap we fill                                                                     |
| [docs/IDE-INTEGRATION.md](docs/IDE-INTEGRATION.md) | How deep IDE integration can realistically go                                                                           |
| [docs/DESIGN-LANGUAGE.md](docs/DESIGN-LANGUAGE.md) | Visual + interaction design system                                                                                      |
| [docs/spec/](docs/spec/)                           | **Concrete technical specs** — architecture, core engine, plugin API, config adapters, migrations, MCP/RPC, IDE surface |

## Run it from source (Development)

The tool isn't published yet, but you can run it from this repo. Requires
Node ≥20 and pnpm.

```bash
pnpm install
pnpm build:ui                 # build the React SPA the daemon serves
pnpm --filter visual-config exec tsx src/bin.ts --cwd /path/to/your/project
# → opens http://127.0.0.1:<port> in your browser

# Or the MCP server for an agent (stdio):
pnpm --filter visual-config exec tsx src/bin.ts mcp --cwd /path/to/your/project
```

Workspace layout (see [`docs/spec/00-architecture.md`](docs/spec/00-architecture.md)):

| Package                   | Role                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `@visual-config/core`     | headless engine: project model, operations, Change/undo, format-preserving writers, registry/diagnostics |
| `@visual-config/protocol` | shared birpc contract (types only)                                                                       |
| `@visual-config/server`   | local daemon (HTTP static SPA + WebSocket birpc + script tasks)                                          |
| `@visual-config/ui`       | the React SPA (browser + future IDE webview)                                                             |
| `@visual-config/mcp`      | MCP server projecting operations as agent tools                                                          |
| `visual-config` (cli)     | the `visual-config` bin                                                                                  |

```bash
pnpm test         # unit + daemon integration tests
pnpm typecheck    # tsc across the workspace
pnpm format       # prettier
```

## Status & contributing

Early alpha. The repo pushes directly to `main` until v1 (no PR workflow yet).
Issues and design discussion welcome. See the [roadmap](docs/ROADMAP.md) for the
current milestone and open questions.

## License

See [LICENSE](LICENSE).
