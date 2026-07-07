---
'@apostel/visual-config-core': minor
'@apostel/visual-config-ui': minor
---

Config scaffolding: set up a formatter/linter in one reviewed step.

A new `add-config` operation installs a tool, creates a minimal (non-opinionated)
config it accepts on its defaults, and adds its standard scripts — all as a single
previewed Change. Ships for **Prettier, Biome, and oxlint**. The installer resolves
and pins the version via the project's package manager (npm/pnpm/yarn/bun), so
nothing is hard-coded.

- `Engine.getScaffolds()` lists scaffoldable tools flagged by whether they're already
  set up; exposed over RPC as `getScaffolds`.
- The browser UI's Config section gains a **“Set up a tool”** panel offering each
  tool not yet present (shows what it installs and the config it creates).
- Agents get `plan_add_config`.
