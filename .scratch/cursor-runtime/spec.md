# Cursor as a runtime

Raised by the author, 2026-08-30, after the fx and Codex investigations. Cursor is not one of the
four runtimes `CLAUDE.md` names, so this is a genuine addition rather than a promise being kept.

Not observed: `cursor-agent` is not installed on this machine, only the editor. Everything here is
read out of Cursor's published CLI documentation and none of it has been run.

> **Superseded 2026-08-31**: the CLI is installed now and ticket 01 was measured live. Several of
> this spec's premises are refuted — start from `map.md` in this directory; the tickets hold the
> answers.

## The finding

**ACP is first-party and the best of the four**, and there is one blocker that decides whether any
of the rest matters.

`agent acp` is Cursor's own ACP server: stdio, JSON-RPC 2.0, newline-delimited, with a documented
request flow of `initialize` -> `authenticate` -> `session/new` or `session/load` -> `session/prompt`
-> `session/update` -> `session/request_permission` -> `session/cancel`. No bridge to pin, no
community package to track, and modes and permission requests are standard ACP. It is hidden from
`--help` and called "advanced", but it is documented, versioned with the product, and it is how
Cursor runs inside JetBrains and Android Studio.

**The blocker: Cursor's ACP mode does not take MCP servers from the client.** The docs are explicit
-- "ACP supports MCP servers defined in a project-level or user-level `.cursor/mcp.json`" -- and
that is the one thing ticket 15 cannot do without. blobot's loopback server is how agents talk to
each other, and its per-agent bearer token **is the caller's identity**. Both of the doors Cursor
offers are wrong:

- **Project-level `.cursor/mcp.json`** is inside the AgentWorkspace, which is a checkout of the
  user's repository. Ticket 14 refuses that, and a file carrying a bearer token is the worst
  possible thing to leave somewhere it can be committed home.
- **User-level `~/.cursor/mcp.json`** is one file for every agent at once. A shared token is not an
  identity, `message_agent` could no longer tell who is calling, and the orchestrator's whole
  addressing model collapses.

So Cursor is a runtime blobot can *run* today and cannot put on a *team* today, unless ticket 01
finds the third door.

## The third door

`CURSOR_CONFIG_DIR` sets a custom config directory, and it is a process environment variable. If
it relocates the whole `.cursor` directory -- `mcp.json`, `cli-config.json`, and the rules that
would carry a persona -- then **one environment variable per agent answers three questions at
once**: a private loopback server with its own token, a per-agent permission posture, and a place
to put the persona that is not the user's repository. That is a better answer than fx has and as
good as Codex's.

If it takes the login with it, or if it only moves `cli-config.json`, the answer is much worse and
ticket 02 says what is left. Everything else in this effort is blocked on that one measurement,
which is why it is ticket 01 and why it is research.

## What lines up, assuming 01

- **Permission requests are standard ACP.** `session/request_permission` returning `allow-once`,
  `allow-always` or `reject-once`. Ticket 14's inline block already offers exactly two of those
  and drops the third. The docs also warn that a client which does not answer will block tool
  execution, which is the same hazard ticket 14 already answered: with nobody listening a request
  is cancelled, never allowed.
- **Modes are `agent`, `plan` and `ask`**, and only `agent` is a working team member. `plan` and
  `ask` are read-only. They are not trust levels and must not be offered as any.
- **Resume is `session/load`.**
- **Detection fits ticket 11.** `agent status` (or `whoami`) for the state, `agent login` for the
  remedy, `curl https://cursor.com/install -fsS | bash` for the install, landing in `~/.local/bin`,
  which the cascade already searches.

## What is different in kind

- **Two of Cursor's ACP extension methods block the turn.** `cursor/ask_question` asks the user a
  multiple-choice question and `cursor/create_plan` asks for explicit plan approval, and "the agent
  waits for a response before continuing". These are not decoration: a client that ignores them
  hangs. blobot has no UI for either. Ticket 04.
- **Cursor has its own worktrees** (`--worktree`, under `~/.cursor/worktrees/`) and its own cloud
  handoff (`&`, `agent worker`). Both are somebody else's version of something blobot already owns.
  The adapter uses neither; the AgentWorkspace is ticket 10's and stays ticket 10's.
- **An API key path exists** (`--api-key`, `CURSOR_API_KEY`, `--auth-token`, `CURSOR_AUTH_TOKEN`)
  and blobot must not take it, for the same reason it must not take Codex's. Ticket 05.

## Tickets

- `01` Does `CURSOR_CONFIG_DIR` give an agent its own `.cursor`? (research, blocks everything)
- `02` The loopback server has no client-supplied door.
- `03` Trust, `approvalMode`, and a second sandbox.
- `04` The two extension methods that block the turn.
- `05` Detection, `agent login`, and a binary called `agent`.
- `06` The adapter itself.

## Out of scope

- Cursor's worktrees, Cloud Agent handoff, `agent worker`, and team-level MCP servers from the
  Cursor dashboard, which the docs say ACP mode does not support anyway.
- `-f` / `--force` / `--yolo` and `approvalMode: unrestricted`, at every trust level, for the
  reason ticket 14 gives every time.
