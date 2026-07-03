# Analysis & Feasibility

> A full read of what's possible, part by part, with a feasibility score on
> **every** piece of the original vision — plus my own opinion on where the
> real value and the real risk live.

---

## How to read the scores

Each capability gets two scores:

- **Feasibility** — how hard is it to build *well*, given today's ecosystem.
  `●●●●●` trivial → `●○○○○` research-grade.
- **Value** — how much daily pain it removes. `●●●●●` transformative →
  `●○○○○` marginal.

And a **verdict**: `Ship early` / `Ship soon` / `Hard but worth it` /
`Careful` / `Defer`.

The guiding technical fact that makes almost all of this feasible: **every
target config is a file we can parse, and almost every action is either
(a) a write to that file or (b) a package-manager command.** The hard parts
are never "can we do it" — they're *doing it safely, with minimal diffs, and
without lying to the user about risk.*

---

## Part-by-part

### 1. A UI that cleanly shows everything in `package.json`

**Feasibility ●●●●●  ·  Value ●●●●○  ·  Verdict: Ship early**

`package.json` is well-specified JSON. Reading, categorizing (deps, scripts,
metadata, workspaces, engines, `exports`, `publishConfig`), and rendering it is
the easiest thing here and the natural v0. The only nuance is *writing* back
with minimal diffs and preserved key order/formatting — solved by
edit-in-place JSON tooling (e.g. `jsonc-parser` edits, or AST-preserving
writers). This is the anchor feature; everything else hangs off it.

### 2. Vulnerabilities + one-click Upgrade / Migrate

**Feasibility ●●●○○  ·  Value ●●●●●  ·  Verdict: Hard but worth it**

Two very different halves:

- **Detecting vulns:** solved data problem. `npm audit`'s JSON output, the
  [OSV.dev](https://osv.dev) API, and the GitHub Advisory Database all give
  machine-readable advisories keyed to version ranges. Rendering severity and
  "safe fix available" is straightforward.
- **Upgrade:** a patch/minor bump is easy and safe to automate (compute the
  target, write the range, re-install, show the diff). This ships early.
- **Migrate (across a breaking major):** this is the hard, high-value part.
  We *cannot* reliably auto-fix arbitrary breaking changes. What we **can** do
  well: detect the major jump, surface the package's **migration guide** and
  any published **codemod** (jscodeshift/`@codemod`, framework-specific
  upgrade CLIs like `npx @next/codemod`, Angular `ng update`), run that codemod
  behind a diff preview, and never pretend the result is done — always end on
  "review these changes + run your tests." Honest scoping is the whole game
  here. *Over-promising "one-click migrate any package" is the fastest way to
  lose trust.*

### 3. Show the TypeScript setup + what could be improved

**Feasibility ●●●●○  ·  Value ●●●●○  ·  Verdict: Ship soon**

The TypeScript compiler API resolves the **effective** config (following
`extends`) and exposes every option and its default. So we can show "here's
your effective config, here's what's non-default, here's what's unset." The
"what could be improved" layer is a **curated rules engine**: e.g. "`strict`
is off → recommend on", "`moduleResolution` is `node` → `bundler` for your
setup", "no `skipLibCheck` → faster builds". These are opinionated but
well-established recommendations (tsconfig/bases, the TS team's own guidance).
Feasible; the ongoing cost is *maintaining* the recommendation set as TS
evolves. Great candidate for community-contributed rules.

### 4. Install a package by browsing a catalog (search + filters)

**Feasibility ●●●●○  ·  Value ●●●●●  ·  Verdict: Ship soon**

The npm registry exposes search (`registry.npmjs.org/-/v1/search`), and rich
metadata is available for size ([Bundlephobia](https://bundlephobia.com)/
`pkg-size`), types (does it ship `.d.ts` / is there a `@types` package —
[arethetypeswrong](https://arethetypeswrong.github.io) data), popularity
(downloads), license, and maintenance (last publish). A faceted catalog over
this is very buildable and directly kills "type a name into a command." The
subtle work is *quality signals* (trust, provenance, deprecation) so the
catalog nudges toward good choices rather than just popular ones. This is one
of the most differentiated, delightful features — prioritize it.

### 5. Run a script as a button

**Feasibility ●●●●●  ·  Value ●●●●○  ·  Verdict: Ship early**

Scripts are in `package.json`; run them via the user's package manager as a
child process and stream stdout/stderr to the UI. Trivial mechanically. The
polish is: detecting long-running vs one-shot, showing live output, stop/
restart, and remembering which package manager (npm/pnpm/yarn/bun) the project
uses. Ships in v0 alongside part 1.

### 6. Guided framework config (e.g. Next.js allowed image domains)

**Feasibility ●●●○○  ·  Value ●●●●○  ·  Verdict: Careful (per-framework)**

This is where "config as data" gets hard, because framework configs are often
**executable JavaScript** (`next.config.js` exporting a function, with spreads,
conditionals, imports). Reliable strategies:

- For the *common, well-shaped cases* (a static object literal), AST-edit the
  file surgically (add a domain to `images.remotePatterns`) with a preview.
- For *dynamic/complex* configs, detect that we can't safely edit and fall back
  to "here's the exact snippet to paste + the docs," rather than corrupting a
  file. **Refusing to edit safely is a feature, not a failure.**

This means building **per-framework adapters** (Next, Vite, Astro, SvelteKit,
Nuxt…), each encoding that framework's config shape + the doc links. High value
per adapter, but it's N ongoing integrations, not one. Start with one framework
done extremely well (Next.js) as the proof.

### 7. One-click tooling swap (Biome ⇄ ESLint+Prettier, oxlint/oxfmt)

**Feasibility ●●○○○  ·  Value ●●●●○  ·  Verdict: Hard but worth it**

The single most impressive *and* most dangerous feature. A swap means:
remove/add dev deps, delete/create config files, translate settings between
tools with non-overlapping rule sets, update `package.json` scripts, and touch
editor config (`.vscode/settings.json`). Tools ship official migration
commands (`biome migrate eslint`, ESLint's flat-config migrator) we can wrap.
But rule-set translation is **inherently lossy** — no two linters have the same
rules. The right product answer: present the swap as a **fully previewed,
reversible transaction** (one Diff Sheet showing every file change), be honest
that "N rules had no equivalent and were dropped/approximated," and make undo
trivial. Do *not* market it as lossless. Nail one direction first
(Biome → ESLint+Prettier or the reverse) before fanning out.

### 8. npm publish setup with latest config + docs in reach

**Feasibility ●●●●○  ·  Value ●●●○○  ·  Verdict: Ship soon**

Strong, bounded, high-confidence feature. There is an authoritative, testable
checklist: `name`/`version`/`exports`/`main`/`types`/`files`/`sideEffects`/
`publishConfig`/provenance/`license`, plus dry-run validation via
[publint](https://publint.dev) and
[arethetypeswrong](https://arethetypeswrong.github.io) (both have programmatic
APIs). We can *audit* an existing package against best practice and *scaffold*
a new one with the current recommendations and inline docs. Lower daily
frequency than deps/scripts (you set up publishing rarely), hence Value ●●●,
but it's a lovely, correct, self-contained module.

### 9. An integrated experience that lives on top of existing files

**Feasibility ●●●●○  ·  Value ●●●●●  ·  Verdict: The core bet**

Feasible *if* we hold one architectural line: **the files are the only source
of truth; we never introduce a shadow config.** Everything is read from and
written to the real files as minimal diffs. The integration is in the *UI and
the shared engine*, not in a new data store. This is the defining constraint
of the project and the thing that makes it trustworthy rather than another
layer that drifts. (See "My opinion" below — this is non-negotiable.)

### 10. Global/project package that registers an `npx` command → browser UI

**Feasibility ●●●●●  ·  Value ●●●●●  ·  Verdict: Ship early (this is v1's shape)**

Textbook: a CLI bin that boots a local server (project logic + file I/O) and
opens the browser to a local web app. This is exactly how Nuxt DevTools, Vite
plugins, and dozens of tools work. No obstacles. This is the delivery vehicle
for everything above and should be the first runnable thing.

### 11. IDE plugins with an in-IDE config panel + hide config files (toggle)

**Feasibility ●●●○○ (panel) / ●●○○○ (hiding) · Value ●●●●○ · Verdict: Defer to Phase 3, scope honestly**

- **The panel:** very feasible. Both VS Code (Webview Views) and JetBrains
  (tool windows) let us embed the same web UI inside the IDE, talking to the
  same local engine. This is a well-trodden path (Nuxt DevTools, Console Ninja,
  GitLens panels).
- **Hiding config files:** feasible but *leaky*, and honesty matters. VS Code
  can visually hide/nest files (`files.exclude`, `explorer.fileNesting`) and
  JetBrains has file scopes — but the files still exist, git still shows them,
  CI still reads them, and other tools still open them. So "hide config files"
  is a **view convenience, not a real abstraction**, and we must present it
  that way. Details and limits in [`IDE-INTEGRATION.md`](IDE-INTEGRATION.md).

### 12. Expose the same tools as an MCP server for agents

**Feasibility ●●●●○  ·  Value ●●●●●  ·  Verdict: Ship soon (huge strategic upside)**

If we build the engine correctly — every operation as a pure, validated,
reversible "tool" with a schema — then exposing those same tools over MCP is
almost free, because the UI buttons and the MCP tools call the *identical*
core. This is why the architecture (a tool-oriented core, with UI/IDE/MCP as
thin faces) matters so much. Giving agents *guarded, diff-previewed, schema'd*
config operations instead of raw shell access is genuinely valuable and, I'd
argue, one of the strongest reasons for this project to exist in 2026.

### 13. Safety: no `npx` typo instantly installs/executes a random script

**Feasibility ●●●●○  ·  Value ●●●●●  ·  Verdict: Design principle, not a feature**

This is addressed structurally, not with a checkbox:

- You run **one** trusted, pinnable command (`facet`). Everything else is
  selected from a catalog backed by verified registry data — there is no
  free-typed install path to typo.
- Every mutating action routes through a **confirmed diff** before it writes or
  runs anything.
- We can additionally warn on install-time lifecycle scripts
  (`preinstall`/`postinstall`), show provenance, and default to *not* executing
  untrusted lifecycle scripts without consent. This inverts the current
  `npx <typo>` failure mode entirely.

---

## Scorecard (at a glance)

| # | Capability | Feasibility | Value | Verdict |
|---|---|:---:|:---:|---|
| 1 | Visualize `package.json` | ●●●●● | ●●●●○ | Ship early |
| 2 | Vulns + upgrade/migrate | ●●●○○ | ●●●●● | Hard but worth it |
| 3 | TS setup + improvements | ●●●●○ | ●●●●○ | Ship soon |
| 4 | Package catalog (search/filter) | ●●●●○ | ●●●●● | Ship soon |
| 5 | Scripts as buttons | ●●●●● | ●●●●○ | Ship early |
| 6 | Guided framework config | ●●●○○ | ●●●●○ | Careful (per-framework) |
| 7 | One-click tooling swap | ●●○○○ | ●●●●○ | Hard but worth it |
| 8 | npm publish setup | ●●●●○ | ●●●○○ | Ship soon |
| 9 | Lives on top of files | ●●●●○ | ●●●●● | The core bet |
| 10 | `npx` → browser UI | ●●●●● | ●●●●● | Ship early |
| 11 | IDE panel + hide files | ●●●○○ / ●●○○○ | ●●●●○ | Defer, scope honestly |
| 12 | MCP server for agents | ●●●●○ | ●●●●● | Ship soon |
| 13 | Anti-typo safety model | ●●●●○ | ●●●●● | Design principle |

---

## My opinion (you asked for it)

**The idea is genuinely good and the timing is right.** Not because visualizing
config is novel — plenty of tools nibble at pieces of this (see
[`PRIOR-ART.md`](PRIOR-ART.md)) — but because **nobody has unified it into one
surface that is equally a human UI and an agent MCP server, sitting
non-destructively on top of the real files.** That combination is the whole
thesis, and it's the part I'd protect most fiercely.

Where I'd push back or focus you:

1. **The engine is the product; the UI is a face.** Build a headless,
   tool-oriented core (`installPackage`, `upgrade`, `swapLinter`,
   `addImageDomain`…) where each tool is pure, schema-validated, and returns a
   *previewable diff*. The web UI, the IDE panels, and the MCP server are all
   thin clients of that core. If you build UI-first, you'll rewrite everything
   to add MCP. If you build engine-first, MCP is nearly free (part 12). **This
   is the single most important architectural decision.**

2. **"Minimal, formatting-preserving diffs" is a hard requirement, not a
   nice-to-have.** The instant Facet reformats someone's `package.json` or
   clobbers a comment, trust is gone and they uninstall. Treat the
   diff/write layer as core infrastructure with its own test suite from day
   one.

3. **Be ruthlessly honest about what can't be auto-done.** Migrations across
   majors, linter rule translation, and editing dynamic JS configs are all
   *lossy or impossible in the general case*. The tools that win trust here are
   the ones that say "I can do X safely, and for Y here's the guide + snippet"
   rather than silently doing Y wrong. Refusing to act is often the correct,
   trust-building behavior.

4. **The "hide the config files" IDE feature is the weakest part of the
   vision** — not because you can't do it, but because the files don't actually
   go away (git, CI, other tools all still see them). Ship it as an explicit
   *view* preference with a clear "these still exist on disk" note. Don't let it
   imply an abstraction that isn't real.

5. **Lead with the boring wins.** `package.json` viewer + script buttons +
   package catalog + `npx` delivery is a genuinely useful tool you can ship in
   weeks and that people will actually run. The flashy stuff (one-click linter
   swaps, migrations) is the marketing but also the risky, slow part. Ship the
   dependable core first; earn the right to attempt the hard swaps.

6. **The agent angle may be the bigger long-term market than the human UI.**
   As agents write more config, "a safe, guided, reversible MCP surface for
   config mutations" could matter more than the pretty dashboard. I'd design
   the core so that's a first-class outcome, not an afterthought.

**Net:** high-conviction yes on parts 1, 4, 5, 9, 10, 12, 13; do them well and
you have a real tool. Parts 2, 3, 6, 7, 8 are where the depth and
differentiation live — approach each as "do one instance impeccably, then fan
out." Part 11 (IDE, especially file-hiding) is real but should follow, and be
scoped with honesty about its limits.
