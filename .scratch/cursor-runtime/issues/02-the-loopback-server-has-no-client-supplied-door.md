Type: grilling
Status: open
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
