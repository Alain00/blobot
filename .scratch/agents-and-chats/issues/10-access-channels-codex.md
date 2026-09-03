Type: research
Status: resolved
Blocked by: none

# What Codex loads from a folder, and what it can be denied

## Question

Same question as ticket 09, for **Codex** through the pinned `@agentclientprotocol/codex-acp`
bridge (`packages/core/src/adapters/codex`, which already hands `CODEX_CONFIG` and
`INITIAL_AGENT_MODE` on the environment):

1. Which files in the working directory or its ancestors Codex reads for MCP servers, skills,
   instructions (`AGENTS.md`) and approvals: `.codex/config.toml` at project level, `AGENTS.md`
   layering, anything else.
2. Whether project-level config can **deny** an MCP server or a tool that `~/.codex/config.toml`
   defines, and whether `CODEX_CONFIG` (already blobot's channel) can carry the whole of an
   Agent's access, including *remove this operator server*.
3. Whether `CODEX_HOME` or an equivalent gives a per-agent config dir, and what the login
   lives in (so a per-agent dir does not lose the sign-in).
4. Whether `session/new` `mcpServers` is honoured, and how a server given there relates to one
   in config.

Measure on this machine where free of tokens (`codex --help`, `codex mcp list`, config
precedence). Read the docs for the rest. Write
`.scratch/agents-and-chats/research/access-codex.md`, same table as ticket 09.

## Answer

Research: `.scratch/agents-and-chats/research/access-codex.md` (2026-09-03, codex 0.151.0 behind
codex-acp 1.7.0; every probe zero-token).

Codex has one layer stack and both of ticket 14's candidate mechanisms sit on it. The workspace's
own `.codex/config.toml` is the **project layer** (above the user's `~/.codex/config.toml`), and
`CODEX_CONFIG` is the **runtime layer** above both — nested JSON or dotted keys, deep-merged, re-sent
on resume. Either one denies an operator MCP server by name: `[mcp_servers.<name>] enabled = false`
in the project file and `{"mcp_servers.<name>.enabled": false}` in `CODEX_CONFIG` both stopped the
operator's server from spawning (measured); `enabled_tools` / `disabled_tools` narrow one to named
tools. A project file **cannot** deny a skill (`skills.config` is read from the user and runtime
layers only) and nothing denies an `AGENTS.md`, which is read from the project root down to `cwd`
with no trust gate. The project layer is live only because **the bridge marks `cwd` as a trusted
project on every `session/new`** — so a repository's committed `.codex/config.toml` (hooks, rules,
`model_instructions_file`, extra servers) configures the agent with no prompt, and ancestors of the
workspace are not read because trust is an exact-path match. `CODEX_HOME` relocates everything
including the login (`auth.json`, or a keyring key hashed from the path), so a per-agent dir is a
signed-out agent; there is no Cursor-style split, and `app-server` has no `--ignore-user-config`.
`session/new.mcpServers` is honoured as `mcp_servers.<name>` in the runtime layer, with one bridge
rule: a client server whose name any config layer already uses is **silently dropped** (config
wins; `DISABLE_MCP_CONFIG_FILTERING=true` turns it off) — an operator server named `blobot` would
take the mailbox. Not verified live: `skills.config` through `CODEX_CONFIG` itself (measured via
`-c`, the same layer), `additionalDirectories` contributing `AGENTS.md`/`.codex/`, and the macOS
keyring store.
