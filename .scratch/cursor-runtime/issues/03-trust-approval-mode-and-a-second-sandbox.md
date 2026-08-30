Type: task
Status: open
Blocked by: 01

# Trust, `approvalMode`, and a second sandbox

## Problem

Cursor is the second runtime with a real sandbox and the second where blobot's three words have
to be split across more than one axis. Ticket 02 of the Codex effort works the same ground, and
its answer -- *the sandbox is not a trust level, it is a constant* -- is the starting position
here rather than something to rederive.

What Cursor offers:

| Lever | Values |
| --- | --- |
| `approvalMode` | `allowlist`, `auto-review`, `unrestricted` |
| `permissions.allow` / `permissions.deny` | entries like `Shell(ls)`, in `cli-config.json` |
| `sandbox.mode`, `sandbox.networkAccess` | config, or `--sandbox enabled\|disabled` |
| modes | `agent`, `plan`, `ask` |

Three traps:

- **The modes are not trust levels.** `plan` and `ask` are read-only, so an agent in either cannot
  do the work a team member exists to do. `agent` is the only mode a blobot agent runs in, and
  the picker never offers the other two, however tempting the word *ask* looks next to *careful*.
- **`unrestricted`, `--force` and `--yolo` are the same refusal ticket 14 makes every time.** Not
  at `trusting`, not anywhere.
- **`auto-review` is worth reading before assuming it is the middle.** If it means a model reviews
  the call, it has fx's problem: blobot would be delegating the decision it claims to be making,
  and paying for it. Find out what it actually does before mapping anything onto it.

## What to do

Write `adapters/cursor/permissions.ts`, the counterpart to `adapters/claude/permissions.ts`, with
the reason beside the mapping.

Expected shape, to be argued with:

- `approvalMode: allowlist` at every trust level, with `permissions.allow` widening as trust
  widens and `permissions.deny` holding the closed list that asks at every level: `rm`, `sudo`,
  `chmod`, `chown`, `ssh`, `scp`, `docker`, `git push`, `git remote`. Check what Cursor's entry
  syntax can express -- `Shell(ls)` is a name, not obviously a prefix pattern, and if it cannot
  say `git push *` then the deny list has to be built some other way and this ticket says so.
- The sandbox on, scoped to the AgentWorkspace, at every level, as ticket 10's enforcement rather
  than ticket 14's dial. Decide `networkAccess` once, deliberately, and write down why: an agent
  that cannot reach the network cannot install a dependency, and one that can is a different blast
  radius.
- The editor's own `.cursor/rules` and the repository's `AGENTS.md` keep working, because ADR-0003
  says the settings scope decides what an agent can do and the repository's instructions still
  apply. blobot narrows nothing there.

All of it has to travel through the config directory from ticket 01. If that directory turns out
not to be per agent, then trust is per machine on this runtime, which would be a reason not to
ship it rather than a thing to paper over.
