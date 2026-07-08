# site/ — the project homepage

A single static page (`index.html` + `tokens.css` + `assets/`), deployed to
GitHub Pages by [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
on pushes to `main`. No build step — open `index.html` in a browser to preview.

## Design

The page consumes the same design tokens as the product
(`tokens.css` is a copy of [`docs/design/tokens.css`](../docs/design/tokens.css);
keep them in sync), and follows [`docs/DESIGN-LANGUAGE.md`](../docs/DESIGN-LANGUAGE.md):
dark as the reference mode, light as a peer (theme toggle in the header), mono for
literal values, status never conveyed by color alone.

The page is kept clean against [impeccable.style](https://impeccable.style/)'s
anti-pattern detector (`npx impeccable detect site/index.html`). Its one
remaining finding, Inter as an "overused font", is deliberate:
the design language commits to Inter, and identity-preservation wins over
novelty. If you edit the page: no uppercase tracked eyebrow labels above
sections, no identical card grids, AA contrast in both themes (`--text-faint`
is for the product UI's placeholders, not for prose on this page), and go easy
on em-dashes.

## Structure (post-feedback rework)

The page is written from the reader's chair, not the builder's: pain before
pitch, relief before architecture. Section order: hero (sharpest pain line in
the subhead, one command, annotated screenshot) → the problem (the manifesto's
aches, plus the solo-adoption line: your teammate opens ordinary files and
never knows) → features (shown with real screenshots; agents/MCP included;
"coming next" merged in) → interactive demo (a lodash CVE fixed by a reviewed
patch bump, then undone) → get started → ecosystem tiles → "What we guarantee"
→ a three-row docs section (manifesto, architecture, everything else) →
closing CTA with the GitHub star ask at the end. Deliberately absent: the
package map / monorepo diagram (architecture flexing; it lives in
docs/spec/00-architecture.md), defensive proof-of-realness copy, and internal
phase/milestone language.

**TODO:** a hosted, clickable demo instance was reportedly prepared by another
agent, but no deployment exists on Railway/Vercel and the repo has no deploy
config; the closest artifact is the `visual-config try <owner/repo>` CLI flow.
When a hosted URL exists, link it prominently from the demo section.

## Screenshots

`assets/*.png` are real captures (1440×900 @2x, dark mode) of the built UI
running against a throwaway demo project seeded with vulnerable (`lodash@4.17.20`),
deprecated (`request`), and outdated packages plus a `.prettierrc.json`, so the
health facts and Config view have something to show. `diff-sheet-crop.png` is an
element screenshot of just the sheet, used as the mobile hero image.
To regenerate after UI changes: build the UI (`pnpm build:ui`), start the daemon
against a small demo project, and script the flows shown on the page
(Overview, Dependencies, Diff Sheet via "Upgrade all", Config, Catalog search,
TypeScript, a running script, a tsconfig edit, History). Keep such scripts out
of the committed tree (`.vc-tmp/` is gitignored) per `CLAUDE.md`.
