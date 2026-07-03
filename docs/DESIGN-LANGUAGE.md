# Design Language

> The look, feel, voice, and interaction rules for **Facet**. This is a
> design *system spec*, not an implementation. It exists so that the web UI,
> the IDE panels, and the docs all read as one product.

---

## 1. Name & brand

**Working name: Facet.** A facet is one flat face of a cut gem — and this
tool gives each part of your project configuration its own clean face while
the whole remains a single object. It also evokes *faceted search*, which is
exactly how the package catalog works.

- **Provisional binary / npm name:** `facet` (⚠️ availability unverified — see
  `docs/ROADMAP.md` open questions before committing to it).
- **Tagline:** *One surface for every config.*
- **Voice in one line:** a calm, precise senior engineer who has read all the
  docs so you don't have to.

If `facet` is unavailable, backup directions that fit the concept: **Overlay**
(sits on top), **Dials** (controls), **Panel**, **Cartograph**. The design
language below is name-agnostic.

---

## 2. Design principles

These are the tie-breakers. When two designs are equally pretty, the one that
serves these principles wins.

1. **Legible over clever.** Every screen answers "what is true right now?"
   before it offers "what can I change?". State first, action second.
2. **The diff is the product.** No mutation is committed without showing the
   exact change to the exact file. The confirm-diff surface is the most
   important component we build, not an afterthought dialog.
3. **Calm, not busy.** This is a tool you open to reduce anxiety about your
   config. It should feel like a clean workshop, not a cockpit with 200
   blinking lights. Generous whitespace, few accent colors, restraint.
4. **Docs are ambient.** The relevant documentation for any option is one hover
   or one click away, inline — never "go read the website."
5. **Reversible by default.** Undo is a first-class citizen, visually present,
   for both human and agent actions.
6. **Terminal-native, not terminal-nostalgic.** We respect the developer
   aesthetic (mono for values, dark mode as a peer, keyboard-first) without
   cosplaying a 1980s TTY. Modern, crisp, high-contrast.
7. **The same language everywhere.** A "switch tooling" action looks and
   behaves the same in the web UI, the VS Code panel, and (as a described
   operation) the MCP tool. Consistency across faces is a feature.

---

## 3. Color

A restrained, two-mode palette. Dark is the primary/reference mode (developers
live there); light is a first-class peer, not an afterthought. Both are
designed for **WCAG AA** on text and interactive elements.

### 3.1 Neutrals (the canvas)

Warm-leaning slate. Warmth keeps a config tool from feeling clinical.

| Token            | Dark        | Light       | Use                                  |
| ---------------- | ----------- | ----------- | ------------------------------------ |
| `--bg`           | `#0E1116`   | `#FBFBFA`   | App background                       |
| `--bg-subtle`    | `#151A21`   | `#F4F4F2`   | Sunken panels, code wells            |
| `--surface`      | `#1B212A`   | `#FFFFFF`   | Cards, rows, editors                 |
| `--surface-hi`   | `#232B36`   | `#FFFFFF`   | Raised / hovered surfaces            |
| `--border`       | `#2A323D`   | `#E4E4E1`   | Hairlines, dividers                  |
| `--border-hi`    | `#3A4552`   | `#CFCFCB`   | Focused / emphasized borders         |
| `--text`         | `#E6E9ED`   | `#1A1D21`   | Primary text                         |
| `--text-muted`   | `#9AA4B2`   | `#5C636E`   | Secondary text, labels               |
| `--text-faint`   | `#6B7482`   | `#8A909A`   | Placeholder, disabled, hints         |

### 3.2 Brand & accent

One brand color, used sparingly — primary actions, active nav, focus rings.

| Token            | Dark        | Light       | Use                                  |
| ---------------- | ----------- | ----------- | ------------------------------------ |
| `--brand`        | `#5B8DEF`   | `#2F6BE0`   | Primary buttons, active state, links |
| `--brand-hi`     | `#7BA4F2`   | `#1E5AD1`   | Hover on brand                       |
| `--brand-quiet`  | `#1A2536`   | `#EAF1FE`   | Brand-tinted backgrounds/badges      |
| `--focus-ring`   | `#7BA4F2`   | `#2F6BE0`   | Keyboard focus outline (2px)         |

### 3.3 Semantic (status is everything in a config tool)

Config is a domain of health signals — vulnerabilities, outdated, drift,
deprecations. Status color is load-bearing, so it's a full scale, and it is
**never** the only signal (always paired with an icon + label for
accessibility and color-blind users).

| Meaning       | Token         | Dark      | Light     | Where it shows up                          |
| ------------- | ------------- | --------- | --------- | ------------------------------------------ |
| Healthy / OK  | `--ok`        | `#3FB27F` | `#1E8E5A` | Up to date, no vulns, config valid         |
| Info / hint   | `--info`      | `#5B8DEF` | `#2F6BE0` | "Could be improved", suggestions           |
| Attention     | `--warn`      | `#E0A44B` | `#B87413` | Outdated (minor), deprecation, drift        |
| Danger        | `--danger`    | `#E5715F` | `#C0392B` | Vulnerabilities, breaking, destructive act  |
| Critical vuln | `--critical`  | `#C0455E` | `#9B1C3A` | Critical/high CVEs, will-break actions      |

Each semantic token also has a `-quiet` tinted-background variant (e.g.
`--danger-quiet`) for badges, banners, and row highlights.

### 3.4 Severity mapping (npm audit / OSV)

Fixed mapping so severity always reads the same everywhere:

- `critical` → `--critical`
- `high` → `--danger`
- `moderate` → `--warn`
- `low` → `--text-muted` (dot only, no alarm)
- `info` → `--info`

---

## 4. Typography

Two families. A humanist sans for the interface, a mono for anything that is a
literal config value, package name, version, path, or code.

- **UI sans:** `Inter` (fallback: system-ui, -apple-system, Segoe UI, Roboto).
- **Mono:** `JetBrains Mono` (fallback: ui-monospace, SFMono-Regular, Menlo).
  Mono is not decoration — it signals "this is a literal value from a file."
  Package names, versions, file paths, and JSON keys are **always** mono.

### Type scale (1.25 major-third, base 14px — dense but readable dev UI)

| Token        | Size / line-height | Weight | Use                          |
| ------------ | ------------------ | ------ | ---------------------------- |
| `--t-display`| 28 / 34            | 600    | Empty states, onboarding     |
| `--t-h1`     | 22 / 28            | 600    | Page titles                  |
| `--t-h2`     | 18 / 24            | 600    | Section headers              |
| `--t-h3`     | 15 / 20            | 600    | Card titles, group labels    |
| `--t-body`   | 14 / 20            | 400    | Default body                 |
| `--t-small`  | 13 / 18            | 400    | Secondary, table cells       |
| `--t-mono`   | 13 / 20            | 450    | Values, code, versions       |
| `--t-caption`| 12 / 16            | 500    | Badges, metadata, hints      |

Only two weights carry the UI: **400** (regular) and **600** (semibold). No
light weights (they die on projectors and low-DPI). Mono uses 450 for optical
balance against Inter.

---

## 5. Space, grid, radius, elevation

- **Spacing scale (4px base):** `2, 4, 8, 12, 16, 24, 32, 48, 64`. Use tokens
  `--sp-1`…`--sp-9`. Nothing off-scale.
- **Layout:** a persistent left **rail** (icon + label nav for the config
  domains), a main **column** (max content width ~960px for readability), and
  a right **inspector/diff drawer** that slides in for detail + confirm.
- **Radius:** `--r-sm 6px` (inputs, badges), `--r-md 10px` (cards, buttons),
  `--r-lg 14px` (modals, drawers). Nothing fully rounded except avatars/dots.
- **Elevation:** flat by default. Elevation is *meaningful* — only things that
  float above the page (drawers, menus, the diff-confirm sheet) get a shadow.
  - `--shadow-1`: menus/popovers — `0 4px 12px rgba(0,0,0,.24)`
  - `--shadow-2`: drawers/modals — `0 12px 32px rgba(0,0,0,.32)`
  In light mode, shadows are softer and paired with a `--border` hairline.

---

## 6. Iconography

- **Set:** [Lucide](https://lucide.dev) — MIT, comprehensive, consistent 1.5px
  stroke that matches our line-based aesthetic. One set, no mixing.
- **Sizing:** 16px inline, 20px in the rail, 1.5px stroke throughout.
- **Status icons are mandatory companions to status color** (accessibility):
  - OK → `check-circle`, Info → `info`, Warn → `alert-triangle`,
    Danger → `alert-octagon`, Critical → `shield-alert`.
- **Domain icons** (stable identity per config area): Packages → `package`,
  Scripts → `terminal`, TypeScript → `file-code`, Lint/Format → `sparkles`,
  Framework config → `settings-2`, Publishing → `upload-cloud`, Security →
  `shield`.

---

## 7. Motion

Motion clarifies causality; it never entertains.

- **Durations:** `--motion-fast 120ms` (hover, press), `--motion-base 200ms`
  (drawer/panel), `--motion-slow 320ms` (diff reveal, only when it aids
  comprehension).
- **Easing:** `--ease-out cubic-bezier(.2,.8,.2,1)` for entrances,
  `--ease-in-out cubic-bezier(.4,0,.2,1)` for moves.
- **Diff transitions** animate additions/removals so the eye can follow what
  changed. This is the one place we spend motion budget generously.
- **Respect `prefers-reduced-motion`:** all non-essential motion becomes an
  instant state change.

---

## 8. Core components (behavioral spec)

The components that define the product. Each is described by behavior, not
markup.

1. **Config domain card** — a titled surface summarizing one area (e.g.
   "Dependencies · 42 · 3 outdated · 1 vulnerable"). Status glanceable via the
   severity dot row. Click to enter the domain.
2. **Value row** — label (sans) + value (mono) + optional inline action. The
   atom of every detail view. Editable rows show a subtle edit affordance on
   hover; committing routes through the diff surface.
3. **The Diff Sheet** — the signature component. Any mutation (button press,
   form submit, catalog install, tooling swap) opens a bottom/right sheet
   showing: the human summary ("Install `zod@3.23` as a dependency"), the exact
   file diff(s), any commands that will run, and **Confirm / Cancel**. Nothing
   writes without it. Agent-initiated actions render in the same sheet so a
   human can watch/approve when in supervised mode.
4. **Catalog grid** — faceted package browser: search box, filter rail (type,
   popularity, last-publish, license, has-types, install size, maintained),
   result cards with name/desc/weekly-downloads/size/types badge. Selecting →
   Diff Sheet. **No free-typed install path** — installation is always a
   selection from verified registry data. (Directly serves the "no npx typo
   runs a random script" goal.)
5. **Script button** — a script from `package.json` rendered as a labeled
   button with a run/stop toggle and a live output drawer. Long-running
   scripts show status in the rail.
6. **Improvement chip** — an `--info` suggestion attached to a domain
   ("`strict` is off — recommended on"). One click opens the Diff Sheet
   pre-filled with the fix and the doc excerpt explaining why.
7. **Doc popover** — hover/click any option to get the authoritative
   description, allowed values, and a link to source docs, inline.
8. **Tooling-swap wizard** — a guided flow (e.g. Biome → ESLint+Prettier) that
   previews every file added/removed/changed in one Diff Sheet before running.

---

## 9. Tone of voice

- **Plain, declarative, second person.** "You have 3 outdated packages." Not
  "3 packages were detected as outdated by the system."
- **Never scold.** Drift and outdated deps are normal. We inform and offer a
  fix; we don't wag a finger.
- **Precise about risk.** Distinguish "safe to auto-apply" (patch bump, format)
  from "review this" (major bump, config swap) from "this can break your build"
  in consistent, honest language.
- **Docs voice = the manual, quoted.** When we surface official docs we quote
  and attribute; we don't paraphrase and pretend it's ours.

---

## 10. Accessibility baseline (non-negotiable)

- WCAG AA contrast on all text and interactive elements, both modes.
- Status **never** conveyed by color alone — always icon + text label too.
- Full keyboard operability; visible 2px `--focus-ring` on every focusable.
- The Diff Sheet and all dialogs are focus-trapped and screen-reader labeled.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

---

## 11. Design tokens

Machine-readable tokens live in `docs/design/tokens.json` (source of truth) and
a ready-to-drop `docs/design/tokens.css` (CSS custom properties for both
modes). Every value above is defined there so the eventual web UI and IDE
panels consume one token set. No component hard-codes a hex, size, or duration.
