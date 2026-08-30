Type: task
Status: resolved
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

## Answer

Built 2026-08-30, in `packages/core/src/adapters/codex/`, and verified against a real Codex at
every level the other two adapters are.

**It is the smallest of the three**, which was the prediction and is now measured: the runtime is
~470 lines against OpenCode's 628 and Claude's 691, because ticket 03 and the two adapters before
it had already moved the JSON-RPC, the transport, the wire shapes, the `session/update`
translation, the option groups, the attachment blocks and the tool title into `adapters/acp/`.

What is Codex's own, and why:

- **The persona is `CODEX_CONFIG.developer_instructions`** (ticket 01), plus one paragraph this
  adapter adds: `NO_SUBAGENTS`. Codex ships `collaboration.spawn_agent`, `send_message` and
  `list_agents`, and they compete with the mailbox. Both failure modes were observed live: asked
  to message Bob it **started a subagent called `bob`** and reported the message sent, and later
  it consulted its own roster, found no Bob, and answered *"Bob isn't an active agent"* without
  ever reaching `message_agent`. Turning the feature off through `CODEX_CONFIG` was tried first
  and is worse -- **a partial `features` map replaces the defaults instead of merging**, and the
  session came up with no MCP tooling at all. So it is said in words.
- **The posture is `INITIAL_AGENT_MODE=read-only` on the spawn** (ticket 02), asserted against
  the mode the session reports and repaired with `session/set_mode`. A session whose posture
  cannot be confirmed **fails the launch**, unlike OpenCode's persona repair, which only warns:
  an agent answering in the wrong voice is a disappointment and an agent under the wrong posture
  is what ticket 14 exists to prevent.
- **`authMethods` is deliberately not checked.** The Claude adapter refuses a launch when it is
  non-empty, because there an empty list is the proof of a login. Codex advertises `api-key` on a
  machine that is signed in, so the same check would refuse every launch there is.
- **blobot answers permission requests for its own loopback tool.** Codex asks about *every* MCP
  tool call, so an agent messaging a teammate stopped and waited for a human -- on the runtime
  where that is how a team works at all. The request itself names no tool (`_meta.
  is_mcp_tool_approval` and nothing else), but the `tool_call` that precedes it carries
  `rawInput: {server, tool}` and shares its `toolCallId`, so the answer is decided on structure:
  *`message_agent` on a server this process injected*. A server the user configured still asks.
  This is the carve-out `preApprovedTools` already makes for `mcp__blobot` on Claude, and it does
  not touch ticket 02's refusal to vouch for a command by prefix: that was the inside of a shell
  string, this is blobot's own tool by name.
- **An MCP call carries no verb.** Codex types every MCP call `execute`, so the transcript drew
  `run  mcp.blobot.message_agent` until the adapter took it off -- caught in the real UI, and
  DESIGN.md's rule rather than a preference.
- **The palette** is ADR-0003's allowlist over Codex's three skill roots, and the 42 `$`-prefixed
  names reconcile exactly: 36 are the operator's own from `~/.agents/skills`, and **6 are the
  vendor's, hiding inside the operator's directory** at `~/.codex/skills/.system/`. A dot
  directory under a skills root is Codex's staging area, so it is skipped by name. Five vouched
  built-ins; `logout` and `goal` dropped for the reasons this ticket gave, `plan` because it is
  `collaboration_mode` under another name, `mcp` and `skills` because they are introspection.
- `mode` is subtracted from the picker; `model`, `reasoning_effort`, `fast-mode` and
  `collaboration_mode` stay.

One shared-half change fell out of it, in `adapters/acp/target.ts`: **Codex sends no `locations`**
on an edit -- the path is in the `diff` block instead -- so the target is now read from either
field. That is still reading the protocol rather than learning a vendor's habits, and it keeps
the title of an edit the same string on all three runtimes.

**Done when, all met:**

- Typecheck, tests and build pass: 440 in core, 248 in the desktop app.
- `BLOBOT_LIVE_CODEX=1` runs four live tests and all four pass against codex-cli 0.148.0 behind
  codex-acp 1.7.0: persona in voice under `read-only`, an edit titled `notes.txt` with no
  permission prompt, the palette, and the loopback mailbox with no permission handler attached.
- **Two real Codex agents on a real team messaged each other through the orchestrator**, via
  `--live-codex=<dir>`, and the run is on screen: both handshakes, `alice-codex → Bob-codex:
  started`, `bob-codex → Alice-codex: queued`, and the CONTEXT gauge reading 20k/258k for each.
- **A mixed team ran**, via `--live-mixed=<dir>`: Alice on Claude at 28k/1m and Bob-codex on
  Codex at 19k/258k, a message each way. The orchestrator could not tell them apart, which is the
  point of the whole architecture.

`--live-claude=<dir>` is now one of three roster shortcuts sharing a table, and `detect`'s
`supported` flag is true, so the picker offers Codex and the readiness remedies lead somewhere.

**Two gaps, both named rather than left:**

- An edited persona and a resumed session, which is issue `06`, opened by this one.
- **Codex has no runtime mark in the rail.** `RuntimeMark` draws nothing for an id it does not
  know, which is handled rather than broken, but a Codex agent's row is missing the one thing
  that says which runtime is behind it.
