Type: grilling
Status: resolved

# The user's own servers, rules and skills walk into the session

## Problem

Measured on ticket 01: a Cursor ACP session loads, on top of what blobot supplies, (a) every
`ready` server in the user's own `~/.cursor/mcp.json` — supabase `execute_sql`, Sanity
`create_documents`, Playwright, with their MCP instructions in the system prompt — (b) the
account-level User Rules, and (c) the operator's `~/.agents/skills`. `CURSOR_CONFIG_DIR` moves
none of them.

ADR-0003 cuts one way: the settings scope decides what an agent can do, the operator authored
those servers and skills, and on Claude the operator's user scope loads too. But a teammate
holding the user's live `execute_sql` against a production database is a different blast radius
from a teammate holding the user's skills, and nothing on screen says the agent has them.

## The doors

- Leave it, and record the parity argument (ADR-0003) where the adapter can be read.
- `agent mcp disable <id>` per AgentWorkspace: measured, per workspace path, written by the
  vendor's own CLI into `~/.cursor/projects/<slug>/mcp-disabled.json`. blobot would enumerate the
  user's servers and disable each, per worktree — writes into the user's real `~/.cursor`, but
  into the vendor's own per-project state, not the repository.
- Find a config switch that stops user-level `mcp.json` loading wholesale, if one exists.

User Rules and skills have no known off switch and are the strongest parity case; the servers are
where the decision really lives.

## Answer

**Leave it, and record the parity argument** — the author, 2026-08-31: "si están ahí es porque
el usuario los agregó." ADR-0003's line holds: the settings scope decides what an agent can do,
the operator configured those servers, and their skills and account-level User Rules load by the
same principle. The adapter carries the reason in a comment where it can be read.

What this does *not* settle, and is deliberately deferred to a future cross-runtime effort
(recorded on the map as out of scope for this one): **per-agent restriction of which MCP
servers, skills and tools an agent gets** — a real feature with a real UI, not a Cursor quirk.
When that effort runs, the doors measured here are its inventory: `agent mcp disable <id>` is
per workspace path, written by the vendor's own CLI into
`~/.cursor/projects/<ws-slug>/mcp-disabled.json`, and works.
