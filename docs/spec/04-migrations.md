# Spec 04 — Migrations & Version Bumps

> "Move X to Y" and "migrate vA → vB", backed by **codemods or agent skills**,
> with **changelog-driven, code-aware safety analysis** so a human or an AI can
> tell which major bumps are actually safe for *this* app. Status: draft.

Related: [`01-core-engine.md`](01-core-engine.md) · [`02-plugin-api.md`](02-plugin-api.md) ·
[`05-mcp-and-rpc.md`](05-mcp-and-rpc.md)

---

## 1. The problem with "one-click migrate"

A version bump is trivial; knowing whether it will *break your app* is not. The
honest position (see [`../ANALYSIS.md`](../ANALYSIS.md) #2): we cannot auto-fix
arbitrary breaking changes. What we **can** do is make the decision *informed*
and the mechanical part *assisted*:

1. **Ingest the changelog** between the installed and target version.
2. **Extract breaking changes** into a structured list.
3. **Cross-reference against the app’s actual usage** of the package to classify
   the bump as safe / review / breaking **for this codebase specifically**.
4. **Apply the mechanical part** via a codemod or a guided agent skill — behind
   a previewed, reversible Change.
5. **Never claim done** — always end on "review + run your tests."

Every step is an Operation (spec 01) and therefore available to the UI *and* to
agents over MCP (spec 05). Step 3 is the genuinely useful, novel piece.

## 2. Changelog ingestion

```ts
interface ChangelogSource {
  // Resolve release notes between two versions of a package.
  fetch(pkg: string, from: string, to: string): Promise<ReleaseNotes[]>;
}
```

Sources, tried in order and merged:
- **GitHub Releases** (via the repo in `package.json`), the richest source.
- **`CHANGELOG.md`** in the published tarball or repo (Keep-a-Changelog / common
  formats parsed heuristically).
- **npm version metadata** (dates, deprecations) as a floor.
- Optional plugin override: a package’s ecosystem plugin (spec 02) can
  `registerMigration` with a curated, hand-authored changelog/breaking-change
  list — always preferred over scraping when present.

Output is normalized `ReleaseNotes` with a `breakingChanges: BreakingChange[]`
array where each item is, where possible, structured:

```ts
interface BreakingChange {
  version: string;                     // where it landed
  summary: string;
  kind: 'removed-api' | 'changed-signature' | 'renamed' | 'behavior' |
        'config' | 'peer-dep' | 'node-engine' | 'esm-cjs' | 'unknown';
  symbols?: string[];                  // e.g. ['createStore', 'options.legacy'] — the API touched
  codemod?: CodemodRef;                // if the maintainer/community ships one
  docUrl?: string;
}
```

The `symbols` field is what makes code-aware analysis possible; when a changelog
is prose-only, an extraction step (heuristics + optional LLM, see §4) attempts
to populate it, and we degrade gracefully to "review manually" when we can’t.

## 3. The migration engine: codemods and agent skills

A migration is a recipe registered by a plugin (or built-in) and run as an
Operation:

```ts
interface MigrationRecipe {
  id: string;                          // 'react-18-to-19', 'eslint-to-oxlint'
  match(p: ProjectModelReadonly): boolean;
  from: SemverRange; to: SemverRange;  // or tool→tool
  strategy: MigrationStrategy;
}

type MigrationStrategy =
  | { kind: 'codemod'; ref: CodemodRef }      // jscodeshift/@codemod/ast-grep/framework CLI
  | { kind: 'skill'; ref: AgentSkillRef }     // a structured, agent-run procedure
  | { kind: 'composite'; steps: MigrationStrategy[] };
```

### 3.1 Codemod-backed
Wraps an existing transformer behind the Change/diff flow: `@next/codemod`,
`ng update`, jscodeshift transforms, `@codemod` registry recipes, `biome
migrate`, `@eslint/migrate-config`, `@oxlint/migrate`. The engine runs the
codemod against a working copy, captures the resulting `FileEdit[]`, and returns
them as a **previewed Change** (never applied blind). Lossy transforms disclose
what they couldn’t handle in `Change.notes`.

### 3.2 Skill-backed (for what codemods can’t encode)
When no codemod exists, a migration can ship an **agent skill**: a structured,
machine-followable procedure (steps, checks, edit templates, verification
commands) that an agent executes step-by-step, each edit surfaced as a Change.
This is the bridge to the agent era — the maintainer encodes *how* to migrate,
and the agent does the per-file work under the same guardrails. A skill:

```ts
interface AgentSkill {
  id: string;
  steps: SkillStep[];        // instructions + edit templates + verification (e.g. "run tests")
  inputs?: JSONSchema;       // e.g. which options the app uses
  produces: 'changes';       // every step yields Changes, gated by the Diff Sheet
}
```

The skill runs through MCP: the agent calls the skill’s Operation, receives the
next step + context, proposes a Change, gets approval, continues. The human
watches the same Diff Sheet stream.

## 4. Code-aware safety analysis (the differentiator)

> "letting AI access this and determine, based on the application code, what
> major version bumps are safe, would be really useful."

An Operation `analyze-bump` that answers, for a specific package bump: **will
this break *my* app?**

```ts
interface BumpAnalysis {
  package: string; from: string; to: string;
  verdict: 'safe' | 'review' | 'breaking';
  reasons: BumpFinding[];
  usageSites: UsageSite[];             // where in the app the affected API is used
  unknowns: string[];                  // changelog items we couldn't map to code
}

interface BumpFinding {
  breaking: BreakingChange;
  hits: UsageSite[];                   // your code that touches the changed symbol(s)
  assessment: 'not-used' | 'used-safely' | 'used-affected';
  note: string;
}
```

How it works:

1. **Static usage map.** Build an import/usage graph of the target package in the
   app: which exports are imported, which APIs/options are called, from where.
   (TS compiler API + AST scan; cheap, deterministic, no LLM required.)
2. **Deterministic cross-reference.** For each `BreakingChange.symbols`, check
   the usage map:
   - symbol not imported/used → `not-used`
   - used but the change is additive/compatible → `used-safely`
   - used and removed/changed → `used-affected` (the real risks, with exact
     file:line `usageSites`).
3. **LLM assist (optional, bounded).** For prose-only changelog items with no
   `symbols`, or ambiguous behavioral changes, an LLM step (a) extracts likely
   affected symbols from the changelog text and (b) judges, given the specific
   `usageSites`, whether the app’s usage is affected. The LLM is used as a
   *classifier over concrete evidence we gathered*, never as the source of truth
   — its output is labeled and always downgradeable by the user.
4. **Verdict.** `breaking` if any `used-affected`; `review` if unknowns or
   behavioral items touch used code; `safe` if every breaking change is
   `not-used`/`used-safely`. Verdicts are conservative by default.

This runs two ways:
- **In the UI** as an "Is this safe?" panel on any outdated/major dep — turning a
  scary major bump into a specific, evidence-backed decision.
- **Over MCP** so an agent can call `analyze-bump` across the whole dependency
  set and decide, per package, what to upgrade now vs. defer — using *your*
  code, not generic advice. The agent gets `usageSites` to reason about and to
  drive a skill-backed migration for the ones that need code changes.

## 5. Presenting changelogs as an improvement

Independently of migrating, a **changelog view** is a first-class improvement
surface: for every outdated dependency, show the human-readable notes between
current and latest, with breaking changes flagged and the `analyze-bump` verdict
attached. Turning "you have 40 outdated deps" into "here’s what changed and which
3 actually affect you" is high-value on its own, and it’s the same data the
migration and MCP paths consume.

## 6. Flow summary

```
outdated dep ──▶ ingest changelog ──▶ extract breaking changes
                                           │
                        ┌──────────────────┴───────────────────┐
                        ▼                                       ▼
              static usage map of app            (prose items) LLM symbol-extract
                        │                                       │
                        └──────────────▶ cross-reference ◀──────┘
                                           │
                              verdict: safe / review / breaking
                                           │
                        ┌──────────────────┼──────────────────┐
                     safe              review               breaking
                   bump range     bump + show notes     run codemod OR agent skill
                        │                │                     │
                        └──────── previewed Change (Diff Sheet) ┘
                                           │
                                 "review + run your tests"
```

## 7. Honesty rules (carried from ANALYSIS)

- Never present a migration as complete; always end on review + tests.
- Disclose lossy codemod output and unmapped changelog items explicitly.
- LLM judgments are labeled as such and are conservative/downgradeable.
- When we can’t map a changelog to code, say "review manually" — don’t guess a
  green light.
