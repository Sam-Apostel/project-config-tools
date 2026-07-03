<h1 align="center">Facet</h1>
<p align="center"><em>One surface for every config.</em></p>

<p align="center">
A visual control surface for JavaScript/TypeScript project configuration —
dependencies, scripts, TypeScript, linters, framework config, and npm
publishing — that lives <strong>on top of</strong> the config files you
already have.
</p>

> [!IMPORTANT]
> **Status: design & planning (pre-alpha, no runnable code yet).**
> This repository currently contains the vision and plan, not an
> implementation. This README describes the **intended** experience so the
> design is concrete and reviewable. Nothing below installs or runs today.
> Track progress in [`docs/ROADMAP.md`](docs/ROADMAP.md).
>
> *"Facet" is a working name — see [`docs/DESIGN-LANGUAGE.md`](docs/DESIGN-LANGUAGE.md).*

---

## Why

Configuring a JS/TS project means hand-editing a dozen text files —
`package.json`, `tsconfig.json`, `next.config.js`, ESLint/Prettier/Biome
configs — that reward memorizing schemas and command flags over engineering.
It drifts, it conflicts in merges, and a single `npx` typo can execute an
arbitrary package. Facet gives that configuration a real interface while
keeping the files as the source of truth. Read the [Manifesto](MANIFESTO.md).

## What it does (intended)

- **See everything in `package.json`** — deps, scripts, metadata, workspaces,
  publish config — in a clean, glanceable UI instead of a JSON blob.
- **Package health** — vulnerabilities, outdated deps, and deprecations
  surfaced with severity, each with an **Upgrade** or **Migrate** button that
  previews the exact change (and links the migration guide/codemod).
- **Install from a catalog** — browse packages with search and filters
  (types, size, popularity, license, maintained). Installing is *selecting*,
  not typing a name into a command. No free-typed install path.
- **Run scripts as buttons** — every `package.json` script becomes a labeled
  button with live output. No recalling incantations.
- **Understand your TypeScript setup** — see effective compiler options,
  what's non-default, and get concrete "this could be improved" suggestions.
- **Guided framework config** — e.g. add an allowed image domain to
  `next.config` through a form with inline helper docs, not by guessing the
  key shape.
- **One-click tooling swaps** — move between Biome and ESLint+Prettier, or to
  oxlint/oxfmt, with a full preview of every file added/removed/changed.
- **npm publish setup** — scaffold and audit `exports`, `files`, provenance,
  and metadata against the latest recommendations, docs in reach.
- **Every change is a reviewed diff** — nothing is written without showing you
  the exact file change first. Reversible by default.

## How you'll use it (intended)

### 1. The `npx` command (Phase 1)

```bash
# In any JS/TS project directory:
npx facet
```

This opens Facet in your browser, pointed at the current project. It reads
your real config files, presents them as a UI, and writes changes back as
minimal diffs you confirm. Install it locally to pin a version:

```bash
npm install -D facet   # then: npx facet  (or a "facet" script)
```

> [!NOTE]
> **On the "npx typo" concern:** the point of Facet is precisely to *stop*
> installing packages by typing names into commands. You run one trusted,
> pinned command (`facet`) and then install everything else by selecting it
> from a catalog backed by verified registry data. See the safety model in
> [`docs/ANALYSIS.md`](docs/ANALYSIS.md).

### 2. The IDE panels (Phase 3+)

VS Code and JetBrains extensions embed the same surface as a **project config
panel** next to your code — with an optional toggle to **hide the raw config
files** from the explorer for those who want them out of sight. One core
engine, shown in the browser or in the IDE. Feasibility and limits are
documented honestly in [`docs/IDE-INTEGRATION.md`](docs/IDE-INTEGRATION.md).

### 3. The MCP server (for agents)

Every operation Facet exposes as a button — install, upgrade, migrate, switch
linter, add an image domain — is also exposed as an **MCP server** so AI
agents get *guided, validated, reversible* config tools instead of free-typing
shell commands:

```bash
# Intended: run Facet's tools as an MCP server for your agent
npx facet mcp
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

| Doc | What's in it |
| --- | --- |
| [MANIFESTO.md](MANIFESTO.md) | Why this exists and what we believe |
| [docs/ANALYSIS.md](docs/ANALYSIS.md) | What's possible + feasibility score on every part of the vision |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phased plan from `npx` tool to IDE plugins to MCP |
| [docs/PRIOR-ART.md](docs/PRIOR-ART.md) | Existing projects in this space and the gap we fill |
| [docs/IDE-INTEGRATION.md](docs/IDE-INTEGRATION.md) | How deep IDE integration can realistically go |
| [docs/DESIGN-LANGUAGE.md](docs/DESIGN-LANGUAGE.md) | Visual + interaction design system |

## Status & contributing

Pre-alpha, planning stage. The repo pushes directly to `main` until v1 (no PR
workflow yet). Issues and design discussion welcome. See the roadmap for the
current milestone and open questions.

## License

See [LICENSE](LICENSE).
