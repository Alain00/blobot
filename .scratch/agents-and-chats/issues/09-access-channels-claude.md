Type: research
Status: resolved
Blocked by: none

# What Claude Code loads from a folder, and what it can be denied

## Question

Ticket 14 decides how *what an Agent can access* (MCP servers, skills, tools) is expressed. The
candidate mechanism is that the Agent's anchor, or its generalist folder, carries the config the
runtime reads as **project scope**, with the operator's user scope still loaded (ADR-0003). It
needs facts first. For **Claude Code**, spawned through the pinned
`@agentclientprotocol/claude-agent-acp` bridge with `cwd` at the AgentWorkspace:

1. Which files in the working directory are read for MCP servers (`.mcp.json`), skills and
   commands (`.claude/skills`, `.claude/commands`), instructions (`CLAUDE.md`), and permissions
   (`.claude/settings.json`, `settings.local.json`); which are read from an *ancestor*
   directory; and whether `--add-dir` or `_meta.claudeCode.options` can point at a directory
   that is not the cwd.
2. Whether project scope can **deny** something user scope allows: a `permissions.deny` on a
   tool or an MCP server, `disallowedTools`, `enabledMcpjsonServers` /
   `disabledMcpjsonServers`, and whether an MCP server defined in `~/.claude.json` can be
   switched off per project.
3. Whether any of this can be supplied on `session/new` (`mcpServers`, `allowedTools`,
   `_meta`) rather than as files, since a file in a worktree can be committed home, which is
   why `adapters/claude/permissions.ts` is not a settings file.
4. Environment variables: which the CLI honours for config location (`CLAUDE_CONFIG_DIR`?) and
   whether a per-agent config dir separates user scope the way Cursor's `CURSOR_CONFIG_DIR` does.

Measure on this machine where it costs no tokens (`claude --help`, `claude mcp list` in a
folder with a `.mcp.json`, settings precedence). Read the docs (`context7`, docs.anthropic.com)
for the rest. Write `.scratch/agents-and-chats/research/access-claude.md`: a table of channel →
file or parameter → scope → can-deny, and the two or three sentences ticket 14 needs.

## Answer

Resolved 2026-09-03 against `claude` 2.1.259, bridge 0.70.0 (SDK 0.3.232), the official docs, and
zero-token probes in a scratch folder. Full table, probe transcript and sources:
`.scratch/agents-and-chats/research/access-claude.md`.

1. **Project scope is the `cwd`'s `.claude/` for settings and hooks — no parent fallback
   (measured) — and an ancestor walk for everything else**: `CLAUDE.md`, `CLAUDE.local.md` and
   `.claude/rules/` to the filesystem root; `.claude/skills/`, `.claude/commands/` and
   `.claude/agents/` to the repository root; and, **measured against the docs' "project root"
   wording, `.mcp.json` too**, merged with the nearest definition winning. So an anchor under
   `~/.local/share/blobot/agents/<agent>/` inherits a `~/CLAUDE.md` or a `~/.mcp.json` through the
   *project* walk, whatever `settingSources` says about `user`. `--add-dir` (ACP
   `additionalDirectories`) contributes skills, commands, subagents and `enabledPlugins` — not
   CLAUDE.md (env flag), not permissions, hooks or `.mcp.json`. There is one config root and it is
   `cwd`.
2. **A project file can deny anything user scope allows, and can grant nothing.** Rules run deny →
   ask → allow across all scopes; `deniedMcpServers` in a project `.claude/settings.json` measured
   removing a `~/.claude.json` server; `disabledMcpjsonServers`, `Skill(x)`, `Agent(x)`,
   `mcp__server` and bare tool names all work from any file. `disabledMcpServers` is *not* a
   settings key (it lives in `~/.claude.json`, measured no effect). A project's `allow` rules and
   `additionalDirectories` wait on the trust dialog an SDK session never shows.
3. **Everything a file says can go on `session/new`**: the bridge spreads
   `_meta.claudeCode.options` into the SDK query and overrides only `cwd`, `permissionMode`,
   `canUseTool` (merging `mcpServers`, `disallowedTools`, `hooks`). So `mcpServers` +
   `strictMcpConfig`, `allowedTools`/`disallowedTools`, `settingSources`, `additionalDirectories`,
   `skills`, `agents`, `plugins`, `env`, and an inline `settings` object at the flag layer — the
   whole settings file in memory — are all available with nothing written into a worktree.
   Forwarding is verified in the bridge source; the live effect of `strictMcpConfig`, `settings`,
   `skills`, `agents`, `plugins` and `env` is **unverified**.
4. **`CLAUDE_CONFIG_DIR` separates user scope completely** (measured: a fresh dir lists no user,
   plugin or connector servers) **but takes the login with it** (measured: `claude auth status`
   → `loggedIn: false`). It is not Cursor's `CURSOR_CONFIG_DIR`; a per-agent dir means a per-agent
   `claude auth login`.

Two side findings for ticket 14: auto memory is keyed on the git repository and shared by every
worktree, read regardless of `settingSources`; and project hooks and `env` run in SDK sessions
before trust, while project `allow` rules do not.
