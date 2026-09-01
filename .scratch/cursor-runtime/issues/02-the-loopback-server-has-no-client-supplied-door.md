Type: grilling
Status: resolved
Blocked by: 01

# The loopback server has no client-supplied door

## Problem

Ticket 15's MCP server is not a feature blobot can drop for one runtime. It is how agents on a
team talk to each other: one tool, `message_agent`, over `127.0.0.1`, with a per-agent bearer
token that **is** the caller's identity, and the orchestrator's mailbox on the other side. An
agent that cannot reach it can receive a wake and can answer the user, and cannot address a
teammate. That is not a Cursor agent with a missing feature; it is not a team member.

Claude, OpenCode and Codex all take `mcpServers` from the client on `session/new`. Cursor
documents that it does not: "ACP supports MCP servers defined in a project-level or user-level
`.cursor/mcp.json`."

## What to do

If ticket 01 finds that `CURSOR_CONFIG_DIR` relocates `mcp.json`, this ticket closes with the
mechanism written down: one directory per agent, holding one `mcp.json` with one server and one
token, created at team start and removed with the AgentWorkspace. Say explicitly where it lives
(blobot's own storage, never the workspace, never `~/.cursor`), who deletes it, and what happens
to the file if the app dies mid-run -- a stale token on disk is worth naming even though the
server it points at is gone.

If ticket 01 finds that it does not, grill the remainder honestly. In rough order of how much
they cost:

- **Try `session/new` with `mcpServers` anyway.** The docs describe the configuration path; they
  do not say the parameter is rejected. Measure before believing either way. This is cheap and
  should be step one regardless.
- **Ask Cursor for it.** A client-supplied `mcpServers` on `session/new` is ordinary ACP and every
  other implementation has it. Filing that is a better use of a week than any workaround below.
- **A shared `~/.cursor/mcp.json` with the token moved out of the header.** Only if the loopback
  server can establish identity some other way -- a port per agent, say, with the token still
  unique and the *file* holding a placeholder the child resolves from its environment. Whether
  Cursor expands environment variables in `mcp.json` is a measurable question and worth one hour.
  Do not settle for a shared token: that is not a smaller version of the identity rule, it is the
  absence of it.
- **Ship Cursor as an agent that cannot be addressed.** A team member that can be talked to and
  cannot talk back. Say so in the picker, in blobot's own words, and let the user decide. This is
  the honest floor, and it is still better than a shared token.

Whatever the answer, it is a decision about what a team member *is*, so it belongs in the same
place ADR-0001 does rather than only in this file.

## Answer

The premise measured false, on the cheapest step the ticket itself ordered first. **`session/new`
accepts client-supplied `mcpServers`** — shape `{name, type: "http", url, headers: [{name,
value}]}` — and a server passed only there was handshaken with its own `Authorization` header,
its tool offered and called, **with no approval step**: client-supplied servers bypass
`mcp-approvals.json` entirely (measured 2026-08-31, ticket 01, turn 1). The docs' "ACP supports
MCP servers defined in a project-level or user-level `.cursor/mcp.json`" describes the
configuration path, not a rejection of the parameter, exactly as this ticket suspected.

So the loopback is the same standard ACP door the other three runtimes use: one server per
agent on `session/new`, the per-agent bearer token in the header, no file on disk anywhere, no
stale token to name, nothing to delete. None of the fallback ladder is needed.

Decided by the author, 2026-08-31: resolved this way, **plus a live canary** under
`BLOBOT_LIVE_CURSOR=1` asserting that a `session/new`-supplied server's tool is offered —
because the door contradicts the published docs, and a Cursor release that "fixes" it must
fail by name instead of shipping a team member that silently cannot address a teammate.

No ADR: the ticket said the answer belongs beside ADR-0001 only if it changed what a team
member *is*. It did not — no trade-off was made, the ordinary mechanism simply exists.
