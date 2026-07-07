# @apostel/visual-config-mcp

## 0.2.0

### Minor Changes

- [#9](https://github.com/Sam-Apostel/project-config-tools/pull/9) [`9c46cad`](https://github.com/Sam-Apostel/project-config-tools/commit/9c46cad412b30319dda9342fc73c4c04577b6a69) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Richer dependency facts: vulnerabilities, deprecations, alternatives, and changelogs.

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

### Patch Changes

- Updated dependencies [[`9c46cad`](https://github.com/Sam-Apostel/project-config-tools/commit/9c46cad412b30319dda9342fc73c4c04577b6a69)]:
  - @apostel/visual-config-core@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies []:
  - @apostel/visual-config-core@0.1.0
