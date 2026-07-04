# Spec 07 — Opinions (Neutral Base, Installable Opinions)

> The base tool is **completely unopinionated**. Recommendations come only from
> **opinion packs** a user chooses to install — each attributed to a named
> person or organization (e.g. "the TypeScript team", Matt Pocock, Kent C.
> Dodds, Vercel, Tanner Linsley). This makes getting started easy *and* keeps
> the maintainer's personal taste out of the tool by default. Status: draft.

Related: [`01-core-engine.md`](01-core-engine.md) · [`02-plugin-api.md`](02-plugin-api.md) ·
[`../ANALYSIS.md`](../ANALYSIS.md)

---

## 1. The idea

There is no neutral "best" tsconfig, linter, or dependency set — reasonable
experts disagree, and any default we bake in is *our* opinion smuggled in as a
default. So we don't bake any in. Instead:

- **Base = facts only.** Out of the box, the tool tells you what *is* true and
  never what you *should* prefer (§2).
- **Opinions = installed, attributed, composable.** You install
  `@mattpocock/visual-config-opinions` or `@vercel/...` or "the TypeScript
  team"'s pack, and the tool starts surfacing *their* recommendations, clearly
  labeled as theirs.
- **You can install several.** Stack Matt's TypeScript opinions with Vercel's
  Next.js ones; when they disagree, you see both, attributed (§6).

This resolves ROADMAP open question #3 ("how opinionated?") with a principle
rather than a compromise: **neutral by default; opinion is a choice you make and
can see the source of.**

## 2. Facts vs. opinions — the load-bearing line

Every diagnostic the core produces is classified. Only **facts** ship in the
base; **opinions** exist only if an opinion pack contributes them.

| | **Facts** (base, always on) | **Opinions** (installed, attributed) |
|---|---|---|
| Nature | Verifiable, uncontroversial | Preference; experts disagree |
| Examples | vulnerability (CVE), outdated version, deprecation, type-resolution error (`attw`), publish-config error (`publint`), schema-invalid config, "value is non-default" (as neutral observation), unused dependency | "enable `strict`", "prefer Biome over ESLint", "use `noUncheckedIndexedAccess`", "recommended testing setup", "these are the deps we suggest for forms" |
| Phrasing | "`lodash@4.17.20` has a known high-severity advisory." | "**Matt Pocock recommends** `noUncheckedIndexedAccess: true`." |
| Source | Registry / OSV / publint / attw / TS compiler | An opinion pack, named |

The tell: the base describes **what is**; an opinion prescribes **what you
should do about it** (beyond security/correctness, which are facts). "Outdated"
is a fact; "you should take this major" is an opinion — except the *safety
analysis* of a bump (spec 04) is a fact about your code, so it stays in base.

The core’s `Diagnostics` gains a `source` on every entry:

```ts
interface Diagnostic {
  id: string;
  kind: 'vulnerability' | 'outdated' | 'deprecation' | 'types' | 'publish'
      | 'invalid' | 'non-default' | 'recommendation';
  source:
    | { type: 'fact'; provider: string }              // 'osv' | 'publint' | 'attw' | 'registry' | 'tsc'
    | { type: 'opinion'; pack: string; author: OpinionAuthor }; // attributed
  // …message, target, severity, and (for recommendations) the fix Operation
}
```

The UI renders facts plainly and opinions with an author chip ("via Vercel").
An opinion recommendation is never shown as if it were a fact.

## 3. What an opinion pack contributes

An opinion pack is **pure data** — a set of attributed recommendations. No code,
no operations of its own (it reuses the core’s generic operations to apply a
recommendation as a normal, previewed Change).

```ts
interface OpinionPack {
  id: string;                         // 'mattpocock-typescript'
  author: OpinionAuthor;
  displayName: string;                // "Matt Pocock — TypeScript"
  description: string;
  extends?: string[];                 // compose other packs (e.g. a "T3 stack" pack)
  recommendations: Recommendation[];
}

interface OpinionAuthor {
  name: string;                       // "Matt Pocock" | "TypeScript team" | "Vercel"
  kind: 'person' | 'org';
  url?: string;                       // homepage / profile
  official: boolean;                  // true only when verified (see §5)
}

type Recommendation =
  | { kind: 'config-value'; file: string; path: JsonPath; value: unknown; rationale: string; docUrl?: string }
  | { kind: 'tool-choice'; slot: ToolSlot; prefer: string; rationale: string }   // linter/formatter/test-runner/pm…
  | { kind: 'package'; name: string; role: string; rationale: string }           // "for schema validation, use zod"
  | { kind: 'avoid'; target: string; rationale: string; alternative?: string }   // discourage a dep/pattern
  | { kind: 'script'; name: string; run: string; rationale: string }             // recommended package.json script
  | { kind: 'scaffold'; title: string; changes: RecommendationRef[]; rationale: string }; // a starting setup
```

Each recommendation carries a **rationale** and (ideally) a **doc link** — so an
opinion is never a bare assertion; it explains itself and points to the author’s
own writing. This is also where the "docs in reach" value shows up: the opinion
*is* the doc.

## 4. An opinion pack is a restricted plugin class

Opinion packs ride the plugin system (spec 02) but are the **most restricted,
safest** class:

- **Declarative only.** They register recommendations, nothing else — no
  `registerOperation`, no `registerPanel`, no network, no code path. The daemon
  loads them as data.
- **No privileged actions.** Applying a recommendation routes through the core’s
  existing generic operations (`set-config`, `install-package`, `swap-linter`,
  `add-script`) → a previewed **Change** → the Diff Sheet → undo journal. An
  opinion can *suggest* `swap to Biome`; the swap itself is the same reversible
  transaction any user could trigger.
- **This makes them trivially safe to install** — the common reason to fear a
  third-party package (arbitrary code on install) doesn’t apply. An opinion pack
  is closer to a JSON file than a program.

Consequence: opinion packs need no security review anxiety and can be installed
liberally, which is exactly what you want for a low-friction "try this person’s
setup" experience.

## 5. Attribution, provenance & trust (the part with real people’s names)

Opinion packs are named after real people and orgs, so impersonation and
misattribution are real risks. Proposed rules (this is the design decision most
worth a human call):

- **Truthful attribution required.** `author.official` may be `true` **only**
  when the pack is published under the named author’s own npm scope/org (e.g.
  `@mattpocock/*`, `@vercel/*`) or links a verified identity. The UI shows a
  **verified** badge only then.
- **Community interpretations are allowed but labeled.** A fan-made
  "Kent C. Dodds-style" pack is fine, but must render as *"community
  interpretation of Kent C. Dodds’ public guidance — not by him"*, never as
  official. `official: false`, distinct styling.
- **Namespacing convention.** Encourage authors to own their pack under their
  scope; a first-party curated index (`@visual-config/opinions-*`) may exist but
  only as verified mirrors or clearly-labeled community sets — never
  impersonation.
- **No editorial ranking by us.** When we present available packs to install
  (the starter picker, §7), ordering is **neutral** — download count, verified
  status, recency — not the maintainer’s taste. Keeping our thumb off the scale
  is the whole point.

> Open question for you: how strict on verification? Options range from
> "honor-system + label" (lightest) to "verified authors only in the official
> index, everything else clearly community" (recommended) to "require a signed
> attestation from the named author" (heaviest). I’ve specced the middle.

## 6. Composition, precedence & conflicts

- **Multiple packs, explicit order.** A project lists installed opinion packs in
  `visual-config.config.ts` in priority order.
- **Later overrides earlier** on the *same* recommendation target (last-wins,
  like `extends`), so a user can layer a personal pack on top of a team one.
- **Genuine conflicts are surfaced, never auto-resolved.** When two equal-weight
  packs disagree on a value (`strict: true` vs a looser stance), the UI shows
  **both, attributed**, and asks the user to choose — it does not silently pick.
  Choosing records the decision (and optionally pins it in the config).
- **`extends` composes packs** — a "T3 stack" pack can extend Tanner’s Query
  opinions + a TS pack + a lint pack, giving curated bundles ("profiles") without
  a new primitive.

## 7. Onboarding: "install a starting point"

The neutral base is powerful but empty of guidance — which is fine for experts
and daunting for newcomers. The bridge is a **starter picker**: an optional
first-run surface listing well-known opinion packs to install, presented
neutrally (verified badge, downloads, author). Pick one (or a bundle), and the
tool immediately has an opinionated-but-attributed setup to recommend from — the
"easy to get started" you asked for, without the maintainer choosing *for*
everyone. Installing nothing is a first-class choice; the base stays fully
usable with facts only.

## 8. Worked examples

- **`@typescriptteam/visual-config-opinions`** — `strict: true`,
  `noUncheckedIndexedAccess`, `moduleResolution: 'bundler'` for bundler projects,
  each with a link to the handbook. `author.official = true` (published under a
  TS-team scope).
- **`@mattpocock/visual-config-opinions`** — his well-known TS settings +
  recommended libraries, each linking his articles/courses.
- **`@vercel/visual-config-opinions`** — Next.js config defaults, recommended
  `next.config` shape, deployment-friendly settings.
- **`@tanstack/visual-config-opinions`** — Query/Router/Start setup, recommended
  testing configuration, extends a base TS pack.
- **`visual-config-opinions-kentcdodds` (community)** — a community pack modeled
  on Kent’s public guidance, labeled as a community interpretation, `official:
  false`.

Installing any of these is `npm i -D <pack>`; the tool discovers it (same
mechanism as any plugin) and starts attributing recommendations to that author.

## 9. Why this is the right call

- **Keeps the tool honest.** The maintainer’s opinions are literally not in the
  codebase; the base is a fact engine. That’s a credibility asset for a config
  tool.
- **Turns a weakness into an ecosystem.** "How opinionated?" was a no-win
  question; opinion packs make opinionation a *feature users assemble*, and a
  growth flywheel (authors publish and promote their packs, like
  `eslint-config-*` but across the whole config surface).
- **Safe by construction.** Declarative-only packs are the safest thing you can
  install, so the low-friction "try their setup" flow carries no code-execution
  risk.

## 10. Open questions

1. **Verification strictness** (§5) — honor-system vs verified-only index vs
   signed attestation. Recommended: verified-only in the official index,
   community packs clearly labeled.
2. **Fact/opinion edge cases** — is "unused dependency" (knip) a fact or an
   opinion? Is "prefer latest major when safe" a fact (given the safety
   analysis) or an opinion? Draw the line explicitly per diagnostic kind.
3. **Bundled profiles** — do we bless a few curated bundles ("popular starting
   points") in the picker, and if so how do we choose them *neutrally* without
   re-introducing our taste?
4. **Team enforcement** — should an opinion pack optionally act as *policy*
   (warn/block when config drifts from it in CI), or stay purely advisory? (Ties
   to the post-v1 "team config policies" idea.)
