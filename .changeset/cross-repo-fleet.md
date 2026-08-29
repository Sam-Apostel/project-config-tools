---
'@apostel/visual-config': minor
---

Cross-repo fan-out — the headless "fleet" core plus a `fleet` CLI command.

Because visual-config runs on your machine, it can open many repos at once and
apply one operation across all of them. New in core:

- **`discoverProjects(fs, parent, { depth })`** — config-free discovery of the npm
  projects under a folder. Walks the parent (default depth 3), returns the
  top-most `package.json` in each subtree (so monorepo members don't double-count)
  and finds a manifest that lives in a child folder — the monorepo shape where the
  repo root has no `package.json`.
- **Fleet state** (`loadFleetState`/`saveFleetState`/`rememberParent`/`pinProject`)
  — remembers scanned parents and hand-pinned projects in the user's config dir
  (honoring `XDG_CONFIG_HOME`). It is user-global app state, never a file dropped
  into a scanned repo.
- **`Fleet`** (+ `createFleet`) — `planAcross` dry-runs an operation in every repo
  and returns a Change per repo (repos where it doesn't apply are `skipped`, not
  errored); `applyAcross` writes only the planned ones. Each repo is its own
  engine, so each keeps its own undo journal.

New CLI: **`visual-config fleet <folder>`** lists discovered projects; add
`--op <id> --input <json>` to preview a fan-out and `--apply` to write it;
`--pin <path>` pins a project the walk can't guess. Dry-run by default.

UI and MCP surfaces for fan-out are the next slices.
