Type: research
Status: resolved
Blocked by: none

# What Cursor loads from a folder, and what it can be denied

## Question

Same question as ticket 09, for **Cursor** (`cursor-agent acp`, `packages/core/src/adapters/cursor`,
which already gives each Agent a `CURSOR_CONFIG_DIR` holding `cli-config.json` and measured
that `session/new` accepts client-supplied `mcpServers`):

1. Which files in the working directory Cursor reads: `.cursor/mcp.json`, `.cursor/rules`,
   `AGENTS.md`, skills, and how they merge with `~/.cursor/` and the User Rules.
2. Whether a project-level file, or `cli-config.json` in the per-agent dir, can **deny** an MCP
   server, a tool or a skill the user's own config provides. `.scratch/cursor-runtime/` found
   `permissions.deny` is a silent hard block whose `tool_call` reports `completed`: does that
   make deny unusable for this, or only for the nine dangerous verbs?
3. Whether the per-agent `CURSOR_CONFIG_DIR` already *is* a per-agent user scope (does
   `~/.cursor/mcp.json` still load when it is set?).
4. What the ACP docs say versus what `session/new` accepts, re-checked against the version on
   this machine, since the canary exists because the two disagreed.

Measure on this machine, zero tokens (`cursor-agent --help`, `status --format json`, a probe
folder). Write `.scratch/agents-and-chats/research/access-cursor.md`, same table as ticket 09.

## Answer

Measured 2026-09-03, zero tokens, against `cursor-agent` 2026.09.02-c22c1a3 (the vendor updated
it; the adapter's verified version is still 2026.08.25), the docs, and the CLI's own JavaScript
bundle. Full table and reasons: `.scratch/agents-and-chats/research/access-cursor.md`.

**Cursor keeps two roots, and blobot relocates one.** `CURSOR_CONFIG_DIR` moves `cli-config.json`
and `acp-sessions/` — the posture and the resume state, as ticket 01 found — and nothing the
operator authored. A second, undocumented `CURSOR_DATA_DIR` (hidden `--data-dir`, "internal only")
moves `projects/<slug>/`: the per-project `mcp-approvals.json`, `mcp-disabled.json`, `mcp-auth.json`
and `.workspace-trusted`. Measured today: with both pointed at empty directories the login
survives and the per-project state lands in the relocated one. `~/.cursor/mcp.json` is
`homedir()` hard-coded in every loader and loads under both relocations, so **the per-agent config
dir is not a user scope (question 3)**; config dir plus data dir together is the nearest thing
Cursor has, and it is enough for the one channel that matters.

**Deny (question 2).** The silent-block finding stands for the nine dangerous verbs and does not
sink access restriction: for *this agent may not use the operator's server* the right tool is
never a call-time deny (the tool stays advertised and fails in prose) but **not loading the
server**, which `mcp-disabled.json` does — the vendor's own `mcp disable` shape, an array of ids,
honoured by every loader in the bundle, and per agent once the data dir is. A project file can
only *add*: `.cursor/mcp.json` adds servers that then wait on an approval an ACP session cannot
grant, and `.cursor/cli.json` (strict schema `{permissions:{allow,deny}}`, walked from the git
root down to the cwd) denies tools only as a silent block — while **replacing blobot's `allow`
list wholesale**, because the merge replaces arrays. That is a committed file widening what runs
unasked, the inverse of Claude's committable-file problem; the enabled sandbox refuses the
agent's own writes to it, and a hidden `--disable-project-configs` is the only off switch. Skills
and User Rules have no per-agent switch at all.

**What is read (question 1).** MCP: project `.cursor/mcp.json` spread over `~/.cursor/mcp.json`,
project wins on a name. Rules: `.cursor/rules/*.mdc` and `AGENTS.md` from the workspace root
**and every ancestor to `/`** (plus `CLAUDE.md` when third-party extensibility is on; nested ones
below; `~/.cursor/rules`; account User Rules) — the ancestor walk is a non-committable persona
channel ticket 08 did not have, unverified live. Skills: `.cursor/skills`, `.agents/skills` and
the Claude/Codex/Grok dirs, anywhere in the repository and under the user's base. Hooks: seven
files in order, **Claude's `settings*.json` among them**.

**ACP versus the docs (question 4).** The docs still say `.cursor/mcp.json` only; the bundle on
this machine reads `mcpServers` off both `session/new` and `session/load` into the session's MCP
lease. The door is in the code seven days after ticket 01 measured it open; the no-approval
behaviour was not re-measured (a turn) and the canary stays the right guard.

Unverified, each one live turn: an ACP session omitting a server disabled under a relocated data
dir; the canary on 2026.09.02; the `AGENTS.md` ancestor walk reaching the model; the `allow`
replacement at runtime; hooks under ACP; the sandbox's protected paths.
