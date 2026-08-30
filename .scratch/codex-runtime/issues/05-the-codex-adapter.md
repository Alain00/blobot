Type: task
Status: open
Blocked by: 01, 02, 03, 04

# The Codex adapter

## Problem

With 01 through 04 answered this is ordinary work, and it is the smallest of the three adapters
because it is the second one built on a pinned npm bridge rather than the first.

## What to do

In `packages/core/src/adapters/codex/`:

- The bridge spawn from 03, `CODEX_PATH` set from detection, `cwd` the AgentWorkspace.
- The persona from 01 and `permissions.ts` from 02, each with its reason in a comment, in the
  voice `adapters/claude/permissions.ts` uses.
- `palette.ts`: ADR-0003's allowlist. The bridge advertises `/status`, `/mcp`, `/skills`,
  `/goal`, `/review`, `/review-branch`, `/review-commit`, `/compact`, `/logout` "as well as
  configured skills". Measure what a real install advertises before writing the filter, the way
  the 223-of-which-40 measurement was made for Claude. `/logout` in particular has no business
  in a blobot composer, and `/goal` belongs to an extension this effort declines.
- Resume: check which of `session/load` and a resume-shaped method the bridge implements, and
  whether history is replayed. `TeamPool` wants a resume that does not replay; if only `load`
  exists, mute the replay as the Claude adapter does. Fall back to a new session when the
  provider has forgotten the old one.
- Decline the subagent and goal capabilities at `initialize`. They are opt-in after bilateral
  negotiation, so declining is the default; declining it on purpose, with a comment, is what
  stops a later reader from switching it on because it looked useful.

Outside it:

- A case in `apps/desktop/src/main/runtime-for.ts` and a label beside it. Nothing in the renderer.
- The advertised config options minus what 02 subtracts.

## Done when

Typecheck, tests and build pass; two Codex agents on a team message each other through the
orchestrator's mailbox, the way `--live-claude` proves for Claude; a live test file exists behind
`BLOBOT_LIVE_CODEX`, matching the other two; and one mixed team -- a Claude agent and a Codex
agent -- runs a turn each, since the point of the whole architecture is that the orchestrator
cannot tell them apart.
