---
'@apostel/visual-config': minor
---

Cross-repo fan-out in the browser — daemon RPCs + a Fleet view.

Wires the fleet core (discovery, plan-across/apply-across, per-repo journals)
into the daemon and the SPA:

- **Daemon RPCs** (`fleetBrowse`, `fleetDiscover`, `fleetPlan`, `fleetApply`,
  `fleetPin`/`fleetUnpin`, `fleetGetState`). `fleetPlan` holds the plan per
  connection so a following `fleetApply` writes exactly what was previewed — the
  same plan → present → apply-on-confirm contract as the single-repo flow. The
  service takes an injectable filesystem/opener so it's testable headless.
- **Fleet view** in the UI: a folder browser to pick a parent, the discovered
  (and pinned) projects, and an "upgrade a dependency everywhere" action that
  previews a per-repo diff for every repo that has the package (others skipped)
  before applying across all of them.

Tested: daemon fleet RPCs over the in-memory harness, plus end-to-end over a live
daemon against on-disk repos and a browser smoke of the Fleet view. MCP fan-out
tools are the next slice.
