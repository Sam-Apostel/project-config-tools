---
'@apostel/visual-config-core': minor
'@apostel/visual-config-mcp': minor
'@apostel/visual-config-ui': minor
---

Richer dependency facts: vulnerabilities, deprecations, alternatives, and changelogs.

- **Vulnerabilities** — security advisories from the npm advisory DB, per dependency,
  surfaced as `vulnerability` diagnostics (severity-mapped) with the advisory link.
- **Deprecations** — flags deprecated packages with the maintainer's message, and
  extracts the suggested **alternative** when the message names one (e.g. "use `got`").
  The UI offers a one-click install of the alternative.
- **Changelogs** — a new `getChangelog` engine method / `get_changelog` MCP tool and a
  **Changelog** button per dependency in the UI, showing GitHub release notes between
  your version and latest with breaking changes highlighted.

The browser UI's Dependencies view now shows vuln/deprecated badges alongside outdated,
and a repo-wide "N vulnerable" count. All of these are verifiable facts (files stay the
source of truth); curated opinions still come only from installed packs.
