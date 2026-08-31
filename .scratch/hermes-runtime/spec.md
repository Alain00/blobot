# Hermes as a runtime

Raised by the author, 2026-08-31, after reading the Nous Research `hermes-agent` clone at
`~/Projects/personal/hermes-agent`. Hermes is not one of the four runtimes `CLAUDE.md` names, so
this is a genuine addition rather than a promise being kept, and it is the first candidate that is
**not a coding CLI**.

Unlike the Cursor effort, **this one can be measured**. Hermes is installed on this machine:
`hermes` and `hermes-acp` are both on `PATH` at `~/.local/bin`, and `~/.hermes/` holds a real
configured home. Everything below is read out of the clone's source; nothing has been run yet, and
every ticket that says *research* is runnable today rather than blocked on an install.

## The finding

**Hermes ships a first-party ACP server** at `acp_adapter/`, entered by `hermes acp` or the
`hermes-acp` console script, spoken over stdio. No bridge to pin, no community package to track,
which puts it ahead of both adapters blobot already has. It answers `initialize`, `session/new`,
`session/load`, `session/resume`, `session/fork`, `session/list`, `session/prompt`,
`session/cancel`, `session/set_mode`, `session/set_model` and `session/set_config_option`, and it
sends `usage_update` with `size` and `used`, which is exactly what blobot's `CONTEXT` gauge reads.

**And the blocker that killed Cursor is not here.** `_register_session_mcp_servers`
(`acp_adapter/server.py:1126`) takes client-supplied MCP servers on `session/new`,
`session/load` and `session/resume`, and it handles `McpServerHttp` **including its headers**.
Ticket 15's loopback server is an HTTP server whose per-agent bearer token is the caller's
identity, and that is precisely the shape Hermes accepts. Nothing has to be written into the
AgentWorkspace.

So the two questions Cursor could not answer, Hermes answers well. What Hermes brings instead is a
different problem, and it is the interesting one.

## What is different in kind

Claude Code, Codex and OpenCode are coding CLIs. **Hermes is an agent platform**, and it already
owns, in its own vocabulary, five things blobot owns in its:

| blobot | Hermes |
| --- | --- |
| the orchestrator's mailbox and `message_agent` | `delegate_task`, subagents with roles and a spawn depth |
| AgentWorkspaces | `tools/subagent_worktree.py`, worktrees under `<repo>/.worktrees/` |
| Routines | `cron/`, the `cronjob` tool, `hermes cron` |
| the handoff at 80% (`.scratch/transcript-scale/10`) | `agent/context_compressor.py` and micro-compaction |
| nothing yet | persistent `MEMORY.md` / `USER.md`, agent-created skills, a curator that ages them out |

The Codex adapter already met a small version of this and answered it: Codex ships a subagent
vocabulary that competes with the mailbox, so the adapter tells it in words that it has none.
Hermes is that problem five times over, and two of the five (compaction, memory) are not
declinable by prose because they run without the model asking.

That is the spine of this effort. The adapter is easy. **Deciding which half of Hermes a team
member is allowed to be is the work.**

## What lines up

- **Permission requests are standard ACP.** `acp_adapter/permissions.py` builds up to five options
  (`allow_once`, `allow_session`, `allow_always`, `deny`, `deny_always`). blobot's inline block
  offers exactly two of them and `allow_always` has no path to the UI, which the protocol allows:
  a client answers with an `option_id` and Hermes maps it. **And its no-answer default is already
  ours**: the callback denies when the client returns nothing and returns a distinct `timeout`
  after 60 seconds. With nobody listening a request is cancelled, never allowed, on both sides.
- **Resume is `session/load`**, and Hermes replays the transcript inside the load call, the way
  Claude does. The Claude adapter already mutes that replay; the same mute applies here.
- **`session/set_model` exists**, so the model is a per-session choice rather than an account-wide
  one, which is more than fx offered. It also means blobot's option groups have something to carry.
- **Detection fits ticket 11.** `hermes-acp` on `PATH` is the probe, `hermes doctor` is the
  diagnosis, and the vendor's published install is `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`,
  landing in a place the cascade already searches.
- **`HERMES_ACP_SKIP_CONFIGURED_MCP=1`** stops the user's own configured MCP catalog from being
  registered at startup, which is a door blobot wants open.

## What does not line up

- **The persona has no ACP channel.** `new_session` takes `cwd` and `mcp_servers` and nothing
  else; no `_meta`, no instructions parameter. Every channel that remains is a file or an
  environment, and one of them (`AGENTS.md` in the cwd) is inside the user's repository and
  therefore refused. Ticket 02.
- **`HERMES_HOME` is the isolation unit, and it carries the credentials.** A Hermes profile owns
  config, `.env`, memory, skills, sessions and cron all at once. Give every agent its own and none
  of them can reach a provider until the user configures each one; share one and two teammates
  share a memory file, a skill store and a session database. Ticket 01, and most of the rest is
  blocked on it.
- **Hermes provides its own inference.** It resolves a provider and a model out of its own config
  and its own `.env`. That is the user's existing local authentication, which is the rule, and
  blobot must not touch `--api-key`, `HERMES_ACP_AUTH_METHOD`, or any of it. But it does mean the
  `AuthMethodAgent` / `TerminalAuthMethod` handshake has to be answered honestly. Ticket 07.
- **`PromptCapabilities(image=True)` and nothing else.** No `embeddedContext` flag, though the
  server imports `EmbeddedResourceContentBlock` and `ResourceContentBlock`. `AgentRuntime.accepts`
  has to say something and the declared capability is narrower than the code looks. Ticket 08.
- **`use_unstable_protocol=True`.** `acp_adapter/entry.py` runs the server on the unstable
  protocol. blobot's shared ACP layer pins what it speaks, and this is a version question before
  it is anything else. Ticket 09.

## Tickets

- `01` Which `HERMES_HOME` does an agent get? (research, blocks 02, 04, 05, 06)
- `02` The persona has no ACP channel.
- `03` The loopback server has a door, and the user's own MCP catalog should not come through it.
- `04` Three words of trust against three edit modes and an approval path that is not a mode.
- `05` Hermes compacts itself, and blobot chose the moment.
- `06` Five things Hermes already owns that blobot owns too.
- `07` Detection, `hermes doctor`, and a provider blobot must not choose.
- `08` What Hermes takes in a prompt.
- `09` The Hermes adapter.

## Out of scope

- The gateway and every messaging platform behind it, the desktop app, Nous Portal, the Tool
  Gateway, and voice. blobot is the client here and none of that is reachable over ACP.
- Kanban, the curator, `hermes cron`, `delegate_task` and the seven terminal backends as
  *features to adopt*. Ticket 06 decides only whether a team member may reach them, not whether
  blobot grows an equivalent.
- Micro-compaction, batch trajectory generation, and trajectory compression, which belong to a
  process that owns its own inference and blobot is not one.
- `HERMES_ACP_AUTO_APPROVE` and anything else that pre-answers a permission request, at every
  trust level, for the reason ticket 14 gives every time.
