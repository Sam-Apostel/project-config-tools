# Manifesto

> **visual-config** — a visual interface for your project's config files.

## The problem

Configuring a modern JavaScript/TypeScript project means editing a dozen
text files that nobody enjoys editing:

- `package.json` holds dependencies, scripts, workspaces, publish settings,
  and metadata — all in one flat blob of JSON with no comments allowed.
- `tsconfig.json` has ~100 compiler options, half of which interact, and the
  "right" values drift every TypeScript release.
- `next.config.js`, `vite.config.ts`, `astro.config.mjs` each invent their
  own shape for the same ideas (aliases, env, image domains, plugins).
- Linters and formatters — ESLint, Prettier, Biome, oxlint, oxfmt — overlap,
  conflict, and change flat-config formats on a whim.
- Publishing to npm means remembering `files`, `exports`, `publishConfig`,
  provenance, `.npmignore`, and a changelog tool you set up once a year.

None of this is hard *knowledge*. It's hard *bookkeeping*. It rewards
memorization of command flags and file schemas over actual engineering. It
drifts. It conflicts in merges. A single typo in an `npx` invocation can
execute an arbitrary package. And the feedback loop is terrible: you don't
find out a config is wrong until a build breaks or an audit fails.

We accept this because "it's just config." But config is the operating
system of a project. It deserves a real interface.

## What we believe

**1. Configuration should have a surface, not just a file.**
A file is a serialization format, not a user interface. You should be able to
*see* your whole project's configuration at a glance — dependencies, scripts,
type settings, lint rules, publish setup — and change any of it through an
interface designed for that change, with the docs for that option one click
away. The file is still there. It is just no longer the only way in.

**2. The files stay the source of truth.**
We are not a new config format. We are not a lock-in layer. We do not add a
hidden config of our own that shadows your real settings. We read and write the exact files
git already tracks — `package.json`, `tsconfig.json`, `eslint.config.js` — and
we write them the way a careful human would: minimal diffs, preserved
formatting, preserved comments where the format allows. If you uninstall us
tomorrow, your project is unchanged and your git history is clean.

**3. Doing the safe thing should be the easy thing.**
Installing a package should be browsing a catalog, not typing a name you might
misspell into a command that runs on execution. Running a script should be a
button, not a recalled incantation. Upgrading across a breaking change should
surface the migration guide and the codemod, not a version bump and a prayer.
The interface is where we get to make the correct, secure, reversible path the
path of least resistance.

**4. Agents are first-class users.**
The same operations we expose to humans as buttons — install this, upgrade
that, switch linters, add an image domain — we expose to AI agents as an MCP
server. Agents shouldn't be free-typing shell commands to mutate your config
any more than you should. They should call *guided, validated, reversible*
tools with the same guardrails a human gets. As agents write more of our code,
the config layer is exactly where we want them constrained, observable, and
correct.

**5. Every action is legible and reversible.**
No action happens without showing the diff it will produce. No destructive
step runs without a way back. The interface is a *proposal-and-confirm*
machine, not a magic wand. You always know what changed, why, and how to undo
it — whether the actor was you or an agent.

**6. The tool meets you where you work.**
It starts as `npx visual-config` — zero install, opens in a browser, works on any
project. It grows into IDE panels — VS Code, JetBrains — where your config
lives beside your code and, if you want a calmer file tree, the raw files can be
tidied out of the way using the IDE's own native features (they stay on disk,
one click from view; we never lock them away). One core engine, many faces: web,
IDE, and MCP.

**7. The ecosystem extends it.**
No core team can keep up with every framework, linter, and toolchain. So the
tool owners do it themselves: anyone can ship a plugin that adds a config UI,
catalog filters, docs, improvements, tool swaps, and migrations for their
ecosystem — against the exact same API our built-in features use. The built-ins
have no privileges a plugin can't have. A plugin's actions get the same diff
preview, undo, and agent (MCP) access as everything else, for free.

## What we are not

- **Not another config format.** We don't want you to learn a new schema. We
  want you to stop hand-editing the ones you already have.
- **Not a build tool.** We don't compile, bundle, or replace your toolchain.
  We configure the tools you already chose.
- **Not a lock-in.** Everything we do is a diff to a file you own. Leaving is
  `npm uninstall` and nothing else.
- **Not opinionated about your stack.** Biome or ESLint, npm or pnpm, Next or
  Vite — we describe your setup and offer improvements; we don't force ours.

## The bet

The bet is that config is a UI problem wearing a text-file costume. That the
reason config is miserable is not that the decisions are hard, but that we
make them through the wrong medium. Give configuration a real surface —
visible, safe, reversible, documented, and equally usable by humans and
agents — and a whole category of daily friction and drift disappears.

If we're right, `npx visual-config` becomes the first thing you run in a new repo, and
the last time you open `tsconfig.json` by hand is the day you install it.
