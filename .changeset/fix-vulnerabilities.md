---
'@apostel/visual-config': minor
---

One-click vulnerability remediation.

`engine.getRemediation()` (and a `getRemediation` daemon RPC) turns advisory
findings into concrete upgrade targets: for each vulnerable direct dependency it
picks the **minimal safe version** that escapes every advisory affecting it,
flags when that crosses a major, and reports anything with no safe published
version as `unfixable`. A new `fix-vulnerabilities` operation applies the bumps
as one reviewed, reversible package.json Change (and appears as an MCP
`plan_fix-vulnerabilities` tool). The UI Dependencies view gains a **Fix
vulnerabilities** button. Adds `registry.versions()`.
