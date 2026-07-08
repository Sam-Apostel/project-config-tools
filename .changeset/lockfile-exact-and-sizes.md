---
'@apostel/visual-config': minor
---

Lockfile-exact diagnostics + per-package install size.

Dependency diagnostics (outdated, vulnerabilities) now compare against the
**exact installed version** read from the lockfile — `pnpm-lock.yaml`,
`package-lock.json`/`npm-shrinkwrap.json`, or `yarn.lock` (classic and berry) —
instead of the floor of the declared semver range, so the numbers reflect what's
actually installed. `DependencyEntry` gains a `resolved` field.

Adds an **install-size** report: `engine.getInstallSizes()` (and a
`getInstallSizes` daemon RPC) returns each dependency's own unpacked size from
the registry, largest first, with a total. The UI Dependencies view shows a size
badge per package, a total "on disk" badge, and the exact installed version.
