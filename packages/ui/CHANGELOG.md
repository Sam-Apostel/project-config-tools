# @apostel/visual-config-ui

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

## 0.1.2

## 0.1.1

### Patch Changes

- [#4](https://github.com/Sam-Apostel/project-config-tools/pull/4) [`2e4f32d`](https://github.com/Sam-Apostel/project-config-tools/commit/2e4f32ddd009bf6b5f555b77e627fd3480b4fab9) Thanks [@Sam-Apostel](https://github.com/Sam-Apostel)! - Script runner improvements in the browser UI:

  - The output terminal now renders with a **JetBrains Mono Nerd Font** stack (falls
    back to plain JetBrains Mono / system mono), so glyph/powerline output from
    scripts displays correctly.
  - Added a **Stop** button for running scripts — in each script's row and above its
    live output — so a UI-launched process (e.g. a dev server) can be terminated from
    the UI instead of being orphaned. It calls the existing `stopScript` (SIGTERM).

## 0.1.0
