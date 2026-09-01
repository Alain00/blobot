Type: research
Status: resolved

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

## Answer

Measured live 2026-08-31 against `cursor-agent` 2026.08.25-3e8eec8, logged in, on this machine.
Three real turns spent (authorized). Raw logs in the session scratchpad; the decisive facts:

| What | Does `CURSOR_CONFIG_DIR` move it? |
| --- | --- |
| `cli-config.json` (permissions, approvalMode, sandbox) | **Yes.** Created fresh in the relocated dir; a `permissions.deny: ["Shell(touch)"]` written there was enforced in a real ACP turn. |
| ACP session state (`acp-sessions/<id>/store.db`) | **Yes.** Resume state is per config dir, i.e. per agent. |
| The login | **Survives.** `status` still says logged in with a fresh empty dir; the fresh `cli-config.json` has no `authInfo`. The credential lives outside the config dir. |
| `mcp.json` | **No.** A relocated `mcp.json` was ignored by both `agent mcp list` and a real ACP session. |
| Rules (`rules/*.mdc`) | **No.** An `alwaysApply` rule in the relocated dir never reached the model. |
| Skills, project state, MCP approvals | **No.** Skills still sync from user level; approvals land in `~/.cursor/projects/<ws-path-slug>/mcp-approvals.json`. |

**And the blocker dissolves for a different reason: `session/new` accepts client-supplied
`mcpServers`.** The docs say ACP only takes MCP servers from `.cursor/mcp.json`; measured, a
server passed only on `session/new` (`{name, type: "http", url, headers: [{name, value}]}`) was
handshaken with its own `Authorization` header, its tool offered and listed by the agent, **with
no approval step** — client-supplied servers bypass `mcp-approvals.json` entirely. So the
loopback door is the same standard ACP door the other three runtimes use, and no `mcp.json` is
needed anywhere. The PR's whole `<config-dir>/mcp.json` + `rules/blobot-persona.mdc` mechanism
is refuted on both halves.

Also measured, for the tickets downstream:

- **Unlisted shell commands raise `session/request_permission`** ("Shell allowlist is empty"),
  options `allow-once` / `allow-always` / `reject-once`. An `allow-always` answer wrote nothing
  into `cli-config.json` — it persists only in the session store under the relocated dir, so it
  is per agent and dies with blobot's own directory.
- **A denied command's `tool_call` reports `status: completed`.** The refusal is only in the
  message text. Same trap family as the mock's cancelled-tool-reports-completed.
- **`${env:VAR}` expands in `mcp.json` headers**, and the approval hash covers the *resolved*
  config. Moot for the loopback now, but real.
- **Contamination**: the ACP session loaded the user's own `~/.cursor/mcp.json` servers (supabase,
  Sanity, Playwright… — every `ready` one), the account-level User Rules, and the operator's
  `~/.agents/skills`, all visible in the session's system prompt. New ticket 07.
- **`agent mcp disable <id>` is per workspace path**, written to
  `~/.cursor/projects/<slug>/mcp-disabled.json`, and works — a suppression door for 07.

**One sentence: Cursor can be a blobot runtime** — the loopback rides `session/new` like every
other runtime, `CURSOR_CONFIG_DIR` carries the posture and the session state per agent, the login
survives, and what it does not carry (persona, the user's own servers walking in) are tickets 07
and 08.
