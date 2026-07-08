---
'@apostel/visual-config': minor
---

Add a headless `check` command for CI.

`visual-config check` opens the project, computes fact-based diagnostics
(outdated / vulnerable / deprecated), prints a summary — or `--json` for a
machine-readable report — and exits non-zero when the policy is violated.
`--fail-on` selects which kinds gate the build (`vuln` by default; also
`deprecation`, `outdated`, `any`, `none`, comma-separated). Read-only: it never
runs the project's code, so it's safe to drop into any pipeline.
