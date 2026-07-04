# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).

To record a user-facing change, run `pnpm changeset` and describe it. On merge to
`main`, the release workflow opens a **Version Packages** PR that bumps versions and
updates each package's `CHANGELOG.md`. Merging that PR publishes to npm and cuts a
GitHub Release with the same notes.

All packages here are versioned in lockstep (see `fixed` in `config.json`).
