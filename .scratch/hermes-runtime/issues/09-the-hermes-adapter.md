Type: task
Status: open
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08

# The Hermes adapter

## Problem

`packages/core/src/adapters/hermes`, and a fourth arm in `runtimeFor`
(`apps/desktop/src/main/runtime-for.ts`), which is the one place a `runtime_id` becomes a class.

Most of it is already written. `packages/core/src/adapters/acp` holds JSON-RPC, the child-process
transport, the wire shapes and the `session/update` translation, which turned out to be the
protocol's shape rather than a provider's -- and Hermes is the test of that claim. Claude and Codex
are both bridges written by the same protocol authors. Hermes wrote its own server, with its own
opinions about what a mode is and what a usage update means. **If the shared ACP layer takes a
third implementation without changes, the seam is real. If it does not, the changes it needs are
the most valuable thing this effort produces.**

## What goes in the adapter

- Spawn `hermes-acp` over stdio, with the environment the earlier tickets settled:
  `HERMES_HOME` (01), `HERMES_ACP_SKIP_CONFIGURED_MCP=1` (03).
- The persona through whatever door ticket 02 chose.
- `session/set_mode` for ticket 04's mapping, asserted against the mode the session reports back,
  the way the Codex adapter asserts `read-only`. OpenCode taught the other half of this: a resumed
  session may restore the last used mode rather than the configured one, so re-assert after
  `session/load`.
- The loopback server on `session/new`, `session/load` and `session/resume`.
- `session/set_model` mapped into blobot's option groups, minus anything blobot decides itself.
  Hermes has a model and no effort, so the group list is shorter than Claude's.
- Permission requests answered with `allow_once` or `deny` and nothing else.
- `usage_update` into the `CONTEXT` gauge; a ceiling entry in `ceilingFor` and `CEILING_TABLES` if
  ticket 05's measurement gives one worth shipping.

## Two things to watch

**The protocol version.** `acp_adapter/entry.py` runs `acp.run_agent(agent, use_unstable_protocol=True)`.
Find out what that changes on the wire and whether blobot's shared layer, which pins what it
speaks, negotiates to something both sides accept. `initialize` echoes back
`acp.PROTOCOL_VERSION` rather than the client's, which is worth reading carefully.

**The name.** Hermes is not a coding CLI, and every line of copy blobot has written about
runtimes assumes one. The runtime picker, the hire dialog, the disclosure at the end of the
creation flow: check each against a runtime whose CLI is a chat agent that happens to have a
terminal tool. DESIGN.md is binding here and this is the sort of thing that only shows up on
screen.

## Verification

The bar the other three cleared: two real Hermes agents on one team who message each other
through the orchestrator's mailbox, behind the real UI, under a live flag beside `--live-claude`,
`--live-codex` and `--live-mixed`. Then one Hermes agent and one Claude agent on one team, which
is the point of the whole architecture and the only thing that proves the provider-agnostic rule
held against a runtime that is not like the others.
