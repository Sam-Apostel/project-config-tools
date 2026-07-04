# Spec 08 — Registry & Distribution

> How plugins and opinion packs are **found, browsed, and loaded** — without
> turning your `package.json` into a wall of dependencies. Short answer:
> **selection is data** (a tiny id-list in one file), discovery is an **in-tool
> marketplace** backed by an open registry index, and **opinions are never npm
> packages**. Status: draft.

> [!IMPORTANT]
> **v1 decision: start with npm.** For the first implementation, plugins **and**
> opinion packs are ordinary npm packages, auto-discovered from
> `devDependencies` (the ESLint/Vite-plugin mechanism, spec 02 §2). This lets us
> lean on npm's existing lockfile, registry, provenance, and `npm audit` and
> **ship without building any of the tool-managed / cache / `visual-config.lock`
> / hosted-registry machinery** below. The clutter-free, data-fetched model in
> this spec (id-list + lock + registry) is the **deferred future direction**, to
> revisit once there's real usage — the `visual-config.lock` format is
> intentionally **not** specced yet. Everything below §2 is post-v1 design.

Related: [`02-plugin-api.md`](02-plugin-api.md) · [`07-opinions.md`](07-opinions.md) ·
[`../PRIOR-ART.md`](../PRIOR-ART.md)

---

## 1. The problem

Two things must be true at once:
1. **Discoverable** — a user should browse and pick plugins/opinions the way
   they browse packages, not hunt npm for the right string.
2. **Zero clutter** — installing 10 opinion packs and 5 plugins must **not** add
   15 lines to `package.json`, 15 folders to `node_modules`, and 15 lockfile
   entries to the *project*. That clutter is exactly why shareable-config
   sprawl (`eslint-config-*`, `@types/*`, …) feels bad.

The `eslint-config-*` model (every opinion is an npm dependency) is the thing to
**avoid**. The models to **copy**: Renovate presets (`extends: ["github>org/repo"]`
— referenced by name, not installed), shadcn/ui’s registry (pull items on demand,
not a dependency), and VS Code extensions (installed to a tool-owned location,
browsed in-app, *recommended* in a tiny `.vscode/extensions.json`).

## 2. The core move: separate *selection* from *fetch*

Your **selection** — what you chose — is a small ordered list of **ids** in one
file. How those ids are fetched, cached, and loaded is the tool’s job, not your
repo’s.

```jsonc
// visual-config.json — the ONLY footprint in your repo (plus a lockfile)
{
  "opinions": [
    "typescript-team",                 // registry id (verified author)
    "mattpocock/typescript",           // registry id under an author scope
    "github:acme/eng-standards"        // a private team pack, straight from a repo
  ],
  "plugins": [
    "oxc",                             // registry id → tool-managed install
    "tanstack"
  ]
}
```

That’s the whole clutter footprint: one human-readable file listing names. No
per-item `devDependencies` line. Order matters for opinions (precedence, spec 07
§6). A companion **`visual-config.lock`** pins resolved versions + integrity
hashes for reproducibility (see §6).

## 3. Discovery: an in-tool marketplace over an open registry

Since `visual-config` is *already* a browsable catalog for npm packages,
browsing extensions should feel identical — **dogfood the catalog UX** (design
language §8.4): search box, filter rail (category, verified, author, downloads,
"works with Next", …), result cards, one-click add.

The backing **registry** is:
- **An index, not a gatekeeper.** A hosted search API in front of an **open,
  git-backed data repo** (the model of SchemaStore / a structured awesome-list /
  the `@codemod` registry). Anyone can submit an entry via PR; listing ≠
  endorsement.
- **Metadata-rich.** Each entry: id, kind (`plugin` | `opinion`), author +
  verification, description, categories, homepage/docs, source ref, downloads,
  and (for opinions) a preview of what it recommends.
- **Where trust lives.** The `verified`/`official` badge from spec 07 is a
  **registry-level attestation** (entry published under the author’s own scope or
  a verified identity). Discovery and trust co-locate.
- **Cached locally.** The index is pulled and cached; browse/search works offline
  from cache. No account needed to browse or install — only to *publish*.

```ts
interface RegistryEntry {
  id: string;                          // 'oxc' | 'mattpocock/typescript'
  kind: 'plugin' | 'opinion';
  author: OpinionAuthor;               // includes `official: boolean`
  description: string;
  categories: string[];                // 'linting' | 'typescript' | 'testing' | …
  source: SourceRef;                   // how to fetch it (§4)
  stats?: { downloads?: number; updated?: string };
  preview?: unknown;                   // opinions: sample recommendations; plugins: contribution summary
}
```

## 4. Resolution: many sources, decentralized by design

An id in `visual-config.json` resolves through a **source scheme**, so the
central registry is the *discovery* layer but never the *only* way in — critical
for **private/team** packs and the long tail:

| scheme | example | resolves to | best for |
|---|---|---|---|
| registry id | `mattpocock/typescript` | the registry entry’s `source` | curated, discoverable |
| `github:` | `github:acme/eng-standards#v2` | a git repo at a ref | private/team, long tail |
| `npm:` | `npm:@oxc/visual-config-plugin` | an npm package in your deps | supply-chain pinning (opt-in) |
| `url:` | `https://…/pack.json` | a data document (opinions only) | ad hoc / hosted |
| `file:` | `file:./config/team-opinions.json` | a local path | in-repo team standards |

This is Renovate’s `github>org/repo` insight generalized: **teams keep private
opinions in a repo and reference them by shorthand** — no publish, no npm, no
clutter.

## 5. Installation by type — the key distinction

Plugins and opinions are *not* the same kind of artifact, so they don’t load the
same way.

### 5.1 Opinions = pure data → **never an npm package**
Opinion packs are declarative data (spec 07 §4). They are **fetched and cached
as data**, never installed into `node_modules`, never a dependency:
- Resolve the source → download a small JSON/JSONC document → validate → cache
  under a tool dir (`~/.cache/visual-config/opinions/<id>@<hash>`).
- Pin by content hash in `visual-config.lock`. Offline = use cache.
- **Footprint in your project: one line in `visual-config.json`.** That’s it.

This is the whole answer to "I don’t want an npm package for each" — for
opinions, there simply isn’t one.

### 5.2 Plugins = code → tool-managed install (default) *or* npm (opt-in)
Plugins can execute (sandboxed, spec 02 §5), so they’re closer to real
dependencies. Two supported paths:

- **Tool-managed (default, low-clutter):** install the plugin’s code into a
  **tool-owned location** — a project-local `.visual-config/plugins/`
  (gitignored) or a shared `~/.visual-config/`, with `visual-config` keeping its
  **own** `visual-config.lock`. Your `package.json` and `node_modules` stay
  clean; teammates reproduce from `visual-config.json` + the lock. This is the
  **VS Code-extensions model**: browsed in-app, installed to the tool’s space,
  recommended by a tiny project file.
- **Explicit npm (opt-in):** for teams who *want* plugins pinned in their
  project’s dependency tree — for npm-native supply-chain auditing, provenance,
  private registries, or monorepo hoisting — reference `npm:<pkg>` and it’s a
  normal devDependency, auto-discovered (the spec 02 §2 mechanism). Clutter, but
  deliberate and sometimes correct.

Both paths end at the same place: the plugin id appears in `visual-config.json`.

## 6. Reproducibility, integrity & the honest tradeoff

Going clutter-free means running a **second dependency system alongside npm’s**,
so we take on what npm otherwise gives us:
- **`visual-config.lock`** pins every opinion/plugin to a resolved version +
  **integrity hash** (subresource-integrity style). Commit it; it’s the
  reproducibility guarantee for teammates and CI.
- **Integrity-checked fetch** — a cached artifact whose hash doesn’t match the
  lock is rejected. Data opinions are validated against the opinion schema before
  use.
- **Offline-first** — everything runs from cache; a missing network degrades to
  "what’s cached", never to a broken project.
- **Honest cost:** we don’t free-ride on `npm audit`/provenance for the
  tool-managed path, so **we** own integrity + trust there. For **opinions**
  (tiny, data-only, no code) this is clearly worth it. For **plugins** (code) it’s
  a real tradeoff — which is exactly why the `npm:` path stays available for
  those who’d rather lean on npm’s supply chain. We don’t pretend one size fits
  all.

## 7. In-tool UX

- **Browse** — an "Extensions" / "Opinions" catalog inside the tool, same faceted
  UX as the package catalog. Filter by verified, author, category; preview an
  opinion’s recommendations before installing.
- **Add** — one click: appends the id to `visual-config.json`, fetches + caches,
  updates the lock, and the contributions light up immediately (facts unchanged;
  new opinions appear as attributed chips).
- **Manage** — see everything enabled with provenance badges, reorder opinions
  (precedence), disable/remove (deletes the id + cache, never touches your real
  config files).
- **Agents** — the registry search and install/enable are Operations too, so an
  agent can propose "install the TypeScript-team opinions" as a reviewable
  Change via MCP.

## 8. Why this is the right shape

- **Matches user intent:** opinions carry *zero* package cost; plugins carry cost
  only when you opt into the npm path.
- **Discovery where it belongs:** a config tool that’s already a catalog should
  let you shop for extensions the same way — no leaving to npm.
- **Decentralized + private-friendly:** registry for discovery, `github:`/`file:`
  for team/private, so internal standards never need publishing.
- **Trust co-located:** verification is a registry attestation feeding the
  attribution model (spec 07).
- **Local-first preserved:** cached index, offline install, no account to
  consume.

## 9. Open questions

1. **Registry hosting & governance** — who runs the index, what’s the submission/
   verification process, and how do we fund/host search without compromising the
   no-account, local-first stance? (An open git-backed data repo + a thin cached
   search API is the proposed shape.)
2. **Plugin default: tool-managed vs npm.** ✅ Resolved for v1: **npm first** —
   both plugins and opinions are npm packages to start, leaning on npm's
   lockfile/registry/audit. The tool-managed + `visual-config.lock` path is
   deferred (and the lock format is not specced yet). Revisit clutter-free
   distribution once there's usage.
3. **Where the cache lives** — project-local `.visual-config/` (gitignored,
   simple, per-project) vs a shared `~/.visual-config/` (dedup across projects,
   but cross-project state). Probably shared cache + project lockfile.
4. **Integrity/supply-chain for the tool-managed path** — how far do we go
   (hashes only? signatures? a provenance attestation like npm’s)? Ties to
   plugin trust (spec 02 §5, ROADMAP open question #8).
5. **Config file format/name** — `visual-config.json`, a `visualConfig` key in
   `package.json` (ironic but zero-new-files), or `visual-config.config.ts`
   (programmable, but that’s code again). Leaning `visual-config.json` + lock.
