Type: research
Status: resolved
Blocked by: none

# What OpenCode loads from a folder, and what it can be denied

## Question

Same question as ticket 09, for **OpenCode** (`opencode acp`, `packages/core/src/adapters/opencode`,
which already delivers the persona and the permission posture through `OPENCODE_CONFIG_CONTENT`):

1. Which files in the working directory or its ancestors OpenCode reads: `opencode.json` /
   `opencode.jsonc` at project level, `.opencode/` (agents, commands, skills), `AGENTS.md`, and
   how project config merges with `~/.config/opencode/`.
2. Whether project config, or `OPENCODE_CONFIG_CONTENT`, can **disable** an MCP server, a tool
   or an agent the user's global config defines (`mcp.<name>.enabled: false`, `tools`,
   `permission`), and whether `OPENCODE_CONFIG_CONTENT` *replaces* or *merges over* the global
   file.
3. Whether `OPENCODE_CONFIG_DIR` or `XDG_CONFIG_HOME` gives a per-agent dir and where the
   sign-in (`auth.json`) lives.
4. Whether `session/new` `mcpServers` is honoured.

Measure on this machine, zero tokens (`opencode debug config`, `opencode debug agent`, which
the adapter's tests already use). Write `.scratch/agents-and-chats/research/access-opencode.md`,
same table as ticket 09.

## Answer

Measured 2026-09-03 against `opencode` **1.17.9** (the only copy on this machine; the adapter
is pinned to 1.18.4), zero tokens, plus the binary's own embedded source and the docs.

1. **What a folder reads.** `opencode.json`/`opencode.jsonc` and `.opencode/` (its own
   `opencode.json`, `agents/`, `commands/`, `skills/`, `plugins/`) from the **git worktree root
   down to cwd**, root first, nearest wins, deep-merged onto `~/.config/opencode/`. Skills also
   from `.claude/skills` and `.agents/skills` on the same walk, and from `~/.config/opencode/
   skill(s)`, `~/.claude/skills`, `~/.agents/skills`. Instructions: the first of `AGENTS.md`,
   `CLAUDE.md`, **`CONTEXT.md`** that hits, every ancestor's copy up to the root, plus
   `~/.config/opencode/AGENTS.md` or `~/.claude/CLAUDE.md`. **Without git the walk does not stop
   at the folder** — a `plain` anchor reads every `opencode.json` above it (measured two levels).
2. **A lower layer can deny.** A project file or `OPENCODE_CONFIG_CONTENT` disables a global MCP
   server (`mcp.<name>.enabled:false` → `mcp list` says `disabled`), a global or built-in agent
   (`agent.<name>.disable:true` → gone from `agent list`), any tool including MCP tools
   (`permission: {"<server>_*": "deny"}`, resolved in `debug agent`), and skills by pattern
   (`permission.skill` — the rule resolves, though `debug skill` still lists the skill, so the
   hiding is at tool time). **`OPENCODE_CONFIG_CONTENT` merges over the global file, never
   replaces it**, and sits after every file layer; only `OPENCODE_PERMISSION` and the admin's
   managed config come later.
3. **Per-agent dir.** `OPENCODE_CONFIG_DIR` on 1.17.9 is an *extra* `.opencode`-style directory
   (global still loads); the `dev` docs say it replaces the global dir — version-sensitive,
   re-measure on 1.18.x. `XDG_CONFIG_HOME` does replace the global config dir and leaves the
   sign-in alone: `auth.json` lives in the **data** dir, `~/.local/share/opencode/auth.json`
   (0600, `XDG_DATA_HOME`), with `OPENCODE_AUTH_CONTENT` as an env override. `~/.claude/skills`,
   `~/.agents/skills` and `~/.claude/CLAUDE.md` are hard-coded under `$HOME` and only the
   `OPENCODE_DISABLE_EXTERNAL_SKILLS` / `OPENCODE_DISABLE_CLAUDE_CODE` switches remove them.
4. **`session/new` `mcpServers` is honoured** (`ACP.newSession` reads it; the loopback already
   rides it); whether they merge with config-defined servers for that session is unverified.

Full table, probe record and sources: [`../research/access-opencode.md`](../research/access-opencode.md).
