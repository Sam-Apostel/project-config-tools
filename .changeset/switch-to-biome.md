---
'@apostel/visual-config-core': minor
'@apostel/visual-config-ui': minor
---

One-click tooling swap: **Switch to Biome**.

A new `switch-to-biome` operation replaces ESLint + Prettier with Biome in a single
previewed, reversible Change: it creates `biome.json`, deletes the detected
ESLint/Prettier config files, removes their dependencies and scripts from
`package.json`, adds Biome's scripts, and installs Biome (package-manager-aware) +
prunes the removed deps. Rule/format *settings* are not translated — Biome starts on
its defaults, called out on the Change.

- Risk `breaking`, but fully previewed as a diff and reversible via the journal
  (undo restores the deleted configs, deps, and scripts).
- The browser UI's Config section shows a **Switch to Biome** action when ESLint or
  Prettier is present and Biome isn't.
- Agents get `plan_switch_to_biome`.
