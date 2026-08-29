---
'@apostel/visual-config': minor
---

Cross-repo fan-out for agents — `fleet_*` MCP tools.

The MCP server gains four tools so an agent can drive fan-out the same way the
CLI and browser do: `fleet_discover` (npm projects under a parent folder),
`fleet_plan` (dry-run one operation across them — repos where it doesn't apply
are skipped, not errored), `fleet_apply` (write the plan `fleet_plan` previewed
in this session), and `fleet_pin` (pin a monorepo child folder the walk can't
guess). `createMcpServer` takes an injectable filesystem/opener so the tools are
testable headless.

Also extracts a shared `resolveFleetTargets(fs, parent, depth?)` in core — the
discovered projects plus any pinned ones — used by both the daemon and the MCP
server, so all three faces compute the fan-out target set identically.

This completes cross-repo fan-out across every face — CLI, browser, and MCP.
