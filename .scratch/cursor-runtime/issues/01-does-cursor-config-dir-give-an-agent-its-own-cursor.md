Type: research
Status: open

# Does `CURSOR_CONFIG_DIR` give an agent its own `.cursor`?

## Problem

This is the linchpin. Three separate things blobot needs from Cursor all live in the same
directory, and Cursor documents one environment variable that may move it:

| What blobot needs | Where Cursor keeps it |
| --- | --- |
| A loopback MCP server with a per-agent bearer token | `~/.cursor/mcp.json` or `<project>/.cursor/mcp.json` |
| Ticket 14's permission posture, per agent | `~/.cursor/cli-config.json` (`permissions.allow` / `permissions.deny`, `approvalMode`, `sandbox.*`) |
| The persona | the rules system, `.cursor/rules` plus `AGENTS.md` / `CLAUDE.md` at the project root |

Every project-level path is inside the AgentWorkspace, which is a checkout of the user's
repository, and ticket 14 refuses to write there. Every user-level path is one file shared by
every agent at once, which is fatal for the token specifically: a bearer token that two agents
share is not an identity, and `message_agent` stops being able to say who is calling.

The documentation offers `CURSOR_CONFIG_DIR`, "custom directory path", alongside an
`XDG_CONFIG_HOME` variant that resolves to `$XDG_CONFIG_HOME/cursor/cli-config.json`. It is a
process environment variable, which is the shape blobot wants: it dies with the child, it writes
nothing into the repository, and it can differ per agent. What it actually relocates is not
documented.

## What to do

Install the CLI, point `CURSOR_CONFIG_DIR` at a scratch directory, and answer these in order.
Stop at the first *no* that matters.

1. **Does it move `mcp.json`?** Put an HTTP MCP server in `<dir>/mcp.json`, run `agent mcp list`
   and then a real ACP session, and see whether the tool is offered. This is the one that decides
   whether Cursor can be a team member at all.
2. **Does the login survive?** Run `agent status` with the variable set. If authentication also
   lives in the relocated directory, a per-agent config directory signs every agent out, and any
   fix involves blobot arranging for a credential to be found -- which the no-credential-storage
   rule does not allow. Record exactly which file the auth is in.
3. **Does it move `cli-config.json`?** Write a `permissions.deny` entry and check it is enforced.
   That is ticket 03's whole mechanism.
4. **Does it carry rules?** Find out whether user-level rules resolve out of the relocated
   directory. If they do, the persona is an environment variable and Cursor is as good as Codex on
   the question fx cannot answer at all.
5. **Does an MCP server still need approving?** The docs say to "approve the servers you want to
   use", and `--approve-mcps` exists as a flag. A loopback server that waits for a human to approve
   it has not started. Check whether `agent mcp enable <id>` writes into the relocated directory
   too, which would let blobot pre-approve its own server without approving anybody else's.

## Then

Write the answer as a table of what the variable moves and what it does not, and say in one
sentence whether Cursor can be a blobot runtime. Tickets 02, 03 and 06 are all waiting on it, and
a *no* at step 1 or step 2 is a real answer that should be published rather than worked around.
