---
'@apostel/visual-config': minor
---

Toolchain presets — curated baselines applied as one change.

A new `apply-preset` operation composes several mechanical setup facets —
tsconfig strictness, config files, package.json scripts, and installs — into a
single previewed, reversible `Change`. It ships three presets: `strict-ts` (the
strict compiler-option family + `.editorconfig`), `biome` (install Biome +
`biome.json` + `.editorconfig` + format/lint/check scripts), and `ts-biome` (the
full baseline). Being a built-in operation it also appears as an MCP
`plan_apply-preset` tool.

Presets are the opt-in place for taste: unlike base diagnostics (facts only), a
preset is a baseline the user explicitly selects and reviews before applying.
Applying one is **idempotent** — existing files and scripts are kept rather than
clobbered, already-set tsconfig options and installed packages are no-ops, so
re-applying only fills what's missing. `engine.getPresets()` (and a `getPresets`
daemon RPC) flags whether each preset would do anything here; the UI Config view
gains a **Toolchain presets** section.
