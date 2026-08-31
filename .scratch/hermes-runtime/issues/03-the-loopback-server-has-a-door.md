Type: task
Status: open

# The loopback server has a door, and the user's own MCP catalog should not come through it

## Problem

This is the ticket that killed Cursor, and Hermes passes it.

`_register_session_mcp_servers` (`acp_adapter/server.py:1126`) is called from `new_session`,
`load_session` and `resume_session`. It accepts `McpServerStdio`, `McpServerHttp` and
`McpServerSse`, and for the HTTP shapes it carries `url` **and `headers`** straight into
`tools.mcp_tool.register_mcp_servers`, then rebuilds the agent's tool surface so the new tools are
live for that session.

Ticket 15's loopback server is HTTP on `127.0.0.1` with a per-agent bearer token in a header, and
the token *is* the caller's identity. That is exactly the shape. Nothing goes in the repository,
nothing is shared between agents, and `message_agent` can still say who is calling.

Two things to settle:

1. **`register_mcp_servers` looks process-global, not session-scoped.** It takes a name-to-config
   map and mutates the process's MCP registry. blobot spawns one child per agent, the way both
   existing adapters do, so one process holds one agent's token and the question does not arise in
   practice. **Confirm it**, and write down that the one-process-per-agent rule is load-bearing
   here rather than incidental, because the day somebody multiplexes two agents onto one Hermes
   process is the day two agents share an identity.
2. **The user's own MCP servers should not be in a team agent.** `acp_adapter/entry.py:260` fires
   background discovery of everything in the user's `config.yaml` unless
   `HERMES_ACP_SKIP_CONFIGURED_MCP=1` is set. A blobot team member is not the user's personal
   assistant, and ADR-0003's rule applies: the settings scope decides what an agent can do, the
   palette decides what blobot offers. An arbitrary third-party MCP server the user wired up for
   Telegram is not something blobot should hand a teammate without saying so. Default the variable
   to `1` and say why here.

## What to do

- Set `HERMES_ACP_SKIP_CONFIGURED_MCP=1` in the child's environment.
- Hand the loopback server as an `McpServerHttp` with the `Authorization` header, on `session/new`
  **and** on `session/load` and `session/resume`, because Hermes re-registers on all three and the
  Claude adapter already learned that a resumed session has to be re-supplied.
- Verify live: two Hermes agents on one team, each messaging the other, which is the same proof
  `--live-claude` and `--live-codex` already carry. If that works this runtime is real.
