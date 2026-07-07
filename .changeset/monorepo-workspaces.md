---
'@apostel/visual-config': minor
---

Add monorepo / workspace support. Project detection now resolves member packages
from `pnpm-workspace.yaml` or the npm/yarn `workspaces` field (globs and
`!`-exclusions), exposing them as `ProjectModel.workspacePackages`. The daemon
gains `getWorkspace` and `setActivePackage` RPCs that re-open the engine at any
member, and the UI adds a package switcher so every view and operation targets
the selected package.
