---
'@apostel/visual-config': minor
---

New `visual-config try <owner/repo>` command — the prototype behind the hosted
"point at any repo → diff" flow.

It shallow-clones a public GitHub repo (read-only, never executing its code), runs
the real engine against it, prints what it finds (outdated / vulnerable / deprecated
dependencies), and emits a **format-preserving patch** that upgrades the outdated
deps — to stdout, so you can pipe it to `git apply`. Nothing is written and no
package-manager command is run; it's diff-only.

```
npx @apostel/visual-config try sindresorhus/got
```

This is the engine reused verbatim over a cloned repo — the same core that powers
the local UI and MCP server, pointed at a URL.
