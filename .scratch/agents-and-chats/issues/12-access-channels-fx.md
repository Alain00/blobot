Type: research
Status: resolved
Blocked by: none

# What fx loads from a folder, and what it can be denied

## Question

Same question as ticket 09, for **fx** (`fx acp`, `packages/core/src/adapters/fx`; `.scratch/fx-runtime/`
already measured that `AGENTS.md` above the worktree and `--add-dir` contribute no instructions
and that `/allowlist` writes into `~/.fx/settings.json`):

1. Which files in the working directory fx reads: `AGENTS.md`, `.fx/`, MCP config (where fx
   takes MCP servers from at all, since the adapter uses `server/discover` for the loopback),
   skills (`~/.claude/skills` is read, per the diagnostic fx wrote into the message stream).
2. Whether a project-level file can **deny** a tool, an MCP server or a skill that
   `~/.fx/settings.json` allows, and whether `FX_PERMISSION_MODE` is the only posture channel.
3. Whether any environment variable relocates `~/.fx` per agent, and where the sign-in lives.
4. Whether `session/new` `mcpServers` is honoured beside `server/discover`.

Measure on this machine, zero tokens (`fx --help`, `fx status --json`, a folder with a probe
`AGENTS.md`). fx's docs are thin; the binary's own `--help` strings and the `fx-runtime`
transcripts are primary. Write `.scratch/agents-and-chats/research/access-fx.md`, same table
as ticket 09.

## Answer

**Measured 2026-09-03 against the same fx 0.0.7, zero tokens** (`--help`, `fx status --json`,
`fx permissions`, `fx mcp trust`, `strings`, the docs, and one `initialize` + `session/new` under a
throwaway `HOME` with a bogus gateway key; the real `~/.fx` was never written).
`../research/access-fx.md` has the table.

1. **fx's project scope is the cwd, exactly** — not the git root and not an ancestor. `AGENTS.md`,
   `.fx.json` and `.mcp.json` are read from the directory `fx acp` starts in and nowhere above it
   (measured from `sub/deeper/` with and without a `.git` at the parent). Skills come from seven
   workspace roots (`skills/`, `.fx/`, `.agents/`, `.claude/`, `.codex/`, `.opencode/`, `.claw/`)
   and six home roots including `~/.claude/skills`; the docs alone say the workspace roots are
   "checked upward". `.fx/mcp.json` and `.cursor/mcp.json` in the workspace are not read.
2. **A project-level file can deny almost nothing.** `.fx.json` takes exactly `max_agent_steps`,
   `max_tool_result_bytes` and `context`; `permission_mode`, `model` and `context_limits` in it are
   refused aloud, `permission` / `mcp` / `skills` silently. No file can carry a permission rule
   (docs, verbatim) and no skill-deny channel exists anywhere. The one project-level deny is
   `"context": false`, which drops `AGENTS.md` wholesale (docs only, unmeasured). **`FX_PERMISSION_MODE`
   is the only posture channel blobot uses and it wins over every file**; the other channel is the
   user's own `~/.fx/settings.json`, whose `workspaces["<path>"]` entry can set `permission_mode`
   and a `permission` deny map — which, as `fx permissions` displays it, *replaces* the global map —
   and which `fx-runtime/03` decided blobot never writes. That stands.
3. **Nothing relocates `~/.fx` but `HOME` itself.** Every `FX_*` string was enumerated; there is no
   `FX_HOME` or config-dir variable. Moving `HOME` moves settings, the MCP profile, sessions **and
   the sign-in** (`auth: "missing"`), so a per-agent home is not available to blobot. Sign-in lives
   in `~/.fx/chatgpt-auth.json`, `~/.fx/grok-auth.json`, the Vercel session under `~/.fx/`, and the
   Gateway key in the macOS Keychain.
4. **`session/new` `mcpServers` is honoured beside `.mcp.json`, and `server/discover` is not a
   config source** — it is fx's first message to any server. Measured at `session/new`: the client
   server was contacted with its bearer header; an **approved** `.mcp.json` server was contacted;
   a **pending** one was not; `~/.fx/mcp.json` was never contacted (docs: *ACP never inherits* it).
   Approval is `fx mcp trust`, stored as `enabledMcpjsonServers` / `disabledMcpjsonServers` /
   `enableAllProjectMcpServers` under the canonical path in `~/.fx/settings.json`, never in
   `.mcp.json`.

**For ticket 14, in one line:** on fx an anchor *is* the project scope with nothing to arrange, its
MCP surface is blobot's loopback plus whatever `.mcp.json` servers the user approved by hand, and
skills are the open door — the operator's whole collection, with no deny short of a `HOME` that
would also discard the login. Also noted for the trust card: the ACP `mode` option now labels
`code` as `permissionMode: "auto"` (the reviewer-model mode, not `yolo`), and fx has its own
`subagent` tool whose children inherit the caller's mode and cannot widen it. Unverified on this
ticket: `context: false`, skills "checked upward", and whether rule *evaluation* (as opposed to the
listing) also drops global rules when a workspace map is present — all three need a turn.
