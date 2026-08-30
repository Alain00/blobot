Type: task
Status: open
Blocked by: 01, 02, 03, 04, 05

# The Cursor adapter

## Problem

With the five above answered this is ordinary work, and it is the least of the four adapters:
there is no bridge to pin and no wire format to reverse, because `agent acp` is Cursor's own.

## What to do

In `packages/core/src/adapters/cursor/`:

- The stdio spawn of `agent acp`, `cwd` the AgentWorkspace, `--workspace` set to it explicitly
  since the flag exists and an implicit cwd is a worse contract. **Never** `--worktree`: the
  AgentWorkspace is ticket 10's and Cursor's own worktrees are a different thing in a different
  place.
- `CURSOR_CONFIG_DIR` per agent, from ticket 01, carrying whatever it turned out to carry.
- The persona from ticket 01, `permissions.ts` from ticket 03, and the loopback server's
  `mcp.json` from ticket 02, each with its reason in a comment.
- The extension-method handlers from ticket 04, including the error reply for an unknown blocking
  method.
- Mode pinned to `agent`. `plan` and `ask` are read-only and are not offered, at any trust level.
- `palette.ts`: ADR-0003's allowlist over what a person authored. Cursor has slash commands,
  skills and Custom Modes; measure what a real install advertises before writing the filter, the
  way the 223-of-which-40 measurement was made for Claude. `--plugin-dir` is a surface worth
  understanding before it surprises somebody.
- Resume through `session/load`, muting the replay if history is replayed, falling back to a new
  session when the provider has forgotten the old one.

Outside it:

- A case in `apps/desktop/src/main/runtime-for.ts` and a label beside it. Nothing in the renderer.
- The advertised config options minus what blobot decides itself.

## Done when

Typecheck, tests and build pass; two Cursor agents on a team message each other through the
orchestrator's mailbox -- which is the whole of ticket 02 and the reason this runtime might not
ship at all; a live test file exists behind `BLOBOT_LIVE_CURSOR`; and a mixed team runs a turn
each on two different runtimes.
