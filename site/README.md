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

## Who the page talks to

Each section is aimed at a specific audience with a specific hook:

| Audience               | Hook                                                                                  | Section                    |
| ---------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| App developers         | stop hand-editing config; catalog install kills the `npx`-typo risk; undo everything  | hero, demo, gallery        |
| Agent users/builders   | `visual-config mcp` — validated, reversible config tools instead of free-typed shell  | agents strip               |
| Tool/framework authors | built-ins have no privileges a plugin can't have; operations become UI + MCP for free | audiences, package map     |
| Opinion authors        | attributed opinion packs — your taste, labeled as yours, never baked in               | audiences                  |
| Contributors/curious   | the architecture map, honest roadmap status, and all the vision docs                  | package map, roadmap, docs |

## Screenshots

`assets/*.png` are real captures (1440×900 @2x, dark mode) of the built UI
running against a throwaway demo project, driven by a `playwright-core` script.
To regenerate after UI changes: build the UI (`pnpm build:ui`), start the daemon
against a small demo project, and script the flows shown in the gallery
(Overview, Dependencies, Diff Sheet via "Upgrade all", Catalog search,
TypeScript, a running script, a tsconfig edit, History). Keep such scripts out
of the committed tree (`.vc-tmp/` is gitignored) per `CLAUDE.md`.
