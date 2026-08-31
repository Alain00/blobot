Type: research
Status: open

# What does each runtime actually inherit, and what actually prompts

## Question

Two facts decide the whole effort and only one of them is measured.

`first-demo/07` established from the bridge source that a Claude agent **inherits the user's
global MCP servers**. `first-demo/14`'s amendment established **live** that Claude prompts for
`mcp__blobot__message_agent` under `default` mode. Neither has been checked on the other three
runtimes, and the fragments on record disagree:

- **fx** does not inherit: *"ACP sessions use only the `mcpServers` supplied by the client. They
  do not inherit servers from `~/.fx/mcp.json`."* Quoted in `fx-runtime/spec.md` from the vendor
  docs. Its mailbox carve-out is marked **precautionary rather than observed**
  (`fx-agent-runtime.ts:558`).
- **Codex** asks about **every** MCP tool call -- observed, and the reason
  `#isOwnMailboxCall` exists there at all. Inheritance unknown; `CODEX_CONFIG` is the only
  channel and the bridge collapses much of it.
- **OpenCode** ungates MCP entirely, per `first-demo/03`. Inheritance unknown. If it ungates,
  a vouch list means nothing there and ticket 04 has a problem.

## What to establish

For each of the four runtimes, both axes, **measured and not read**:

- **Inheritance.** Start an agent with a user-level MCP server configured on this machine (the
  author has meta-ads, linear, posthog and figma). Does the agent see the tools? List them.
- **Gating.** Call one such tool. Does a `session/request_permission` arrive? Under the exact
  posture blobot forces -- `set_mode("default")`, `INITIAL_AGENT_MODE=read-only`,
  `FX_PERMISSION_MODE`, `OPENCODE_CONFIG_CONTENT` -- and not under the runtime's own default.
- **Whether the two are separable.** Can blobot suppress inheritance without losing its own
  injected server? On Claude that means `settingSources`, which the bridge hardcodes, so the
  answer may be no.
- **What the request carries.** The vouch mechanism depends on `rawInput.{server, tool}` being
  present on the `tool_call` sharing the permission's `toolCallId`, which is how the three
  mailbox carve-outs work. Confirm it holds for a **third-party** server, not just for
  `mcp_blobot_message_agent`.

## Why it matters

If Claude inherits and fx does not, then the *capability* is unequal before any permission
question is asked, and nobody chose that -- it fell out of two adapters solving unrelated
problems. `first-demo/14`'s honesty rule then applies to inheritance itself, not only to the
vouching, and this effort is bigger than it looks.

## The cheap version

`--live-claude=<dir>` and `--live-fx=<dir>` already put real agents behind the real UI, and
`BLOBOT_LIVE_*` gate the turns that cost tokens. A tool listing costs nothing on any of the
four; only the gating half needs a turn.
