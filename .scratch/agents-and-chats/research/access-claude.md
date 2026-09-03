# What Claude Code loads from a folder, and what it can be denied

Research for ticket 09, feeding ticket 14 (*how what an Agent can access is expressed*).
Measured 2026-09-03 on this machine against `claude` **2.1.259**, the pinned
`@agentclientprotocol/claude-agent-acp` **0.70.0** (which bundles `@anthropic-ai/claude-agent-sdk`
**0.3.232**), and the official docs at `code.claude.com/docs` as served that day. Every probe was
zero-token: `claude --help`, `claude mcp list`, `claude mcp get`, `claude auth status`, in a
throwaway folder under the session scratchpad. No prompt was sent, nothing under `~/.claude` or
`~/.claude.json` was touched, and the probe folder is not a git repository. Claims that rest on
docs alone are marked **(docs)**; claims measured here are marked **(measured)**; anything neither
is marked **unverified**.

## The one thing to know first

The bridge spreads `_meta.claudeCode.options` straight into the SDK `query()` options and then
overrides only a fixed list (`cwd`, `permissionMode`, `canUseTool`, `includePartialMessages`,
`forwardSubagentText`, `pathToClaudeCodeExecutable`; `mcpServers`, `disallowedTools`, `hooks` and
`extraArgs` are *merged*, not replaced) — `dist/acp-agent.js:4866-4930`. So every SDK option that
is not on that list is available on `session/new` **without a file**: `settingSources` (blobot
already sends it), `allowedTools`, `additionalDirectories`, `strictMcpConfig`, `settings` (an inline
settings object at the *flag* layer, above local and project), `skills`, `agents`, `plugins`, `env`.
That is the answer to question 3 and it changes the shape of question 2: the project scope is one
way to deny, and not the only one.

## Channel → file or parameter → scope → can it be denied

"Discovered from" says where Claude Code actually looks when `cwd` is the AgentWorkspace.
"Project can deny user" answers whether a file in the anchor can switch off something the
operator's own scope provides. "On `session/new`" names the parameter that does the same with no
file.

| Channel | File / parameter | Scope | Discovered from | Project can deny user? | On `session/new` (`_meta.claudeCode.options` unless noted) |
| --- | --- | --- | --- | --- | --- |
| Instructions | `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md` | project | `cwd` **and every ancestor to the filesystem root**, at launch; subdirectories on demand when a file there is read **(docs)** | Only by path: `claudeMdExcludes` (any file, arrays merge, absolute-path globs) skips named files; managed CLAUDE.md cannot be excluded **(docs)**. Whether a project file can exclude `~/.claude/CLAUDE.md` this way is **unverified** | `settings: { claudeMdExcludes }` or drop `user` from `settingSources` |
| Instructions | `CLAUDE.local.md` | local | same walk as above **(docs)** | n/a | `settingSources` without `local` |
| Instructions | `~/.claude/CLAUDE.md`, `~/.claude/rules/*.md` | user | config dir **(docs)** | see row 1 | `settingSources` without `user` |
| Instructions | `--add-dir` directories' CLAUDE.md | — | **not loaded** unless `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` **(docs)** | — | `env` |
| MCP servers | `.mcp.json` | project | **`cwd` and every ancestor**, merged, the nearest definition winning on a name collision **(measured)** — the docs say only "at your project's root directory" | Yes: `disabledMcpjsonServers` from any file, a project `.claude/settings.json` included, rejects a `.mcp.json` server by name **(docs; measured: it vanishes from `claude mcp list`)** | `settings: { disabledMcpjsonServers }`, or `strictMcpConfig: true` to ignore the file entirely |
| MCP servers | `~/.claude.json` top-level `mcpServers` | user | config dir, always read regardless of `settingSources` **(docs)** | **Yes**: `deniedMcpServers: [{serverName}]` in a project `.claude/settings.json` removed a `~/.claude.json` server from the listing **(measured)**. `permissions.deny: ["mcp__<server>"]` removes that server's tools from context **(docs)**. `disabledMcpServers` does *not* work from a settings file — it is a per-project list inside `~/.claude.json` written by the `/mcp` toggle **(docs; measured: no effect from `.claude/settings.json`)** | `settings: { deniedMcpServers }`, or `strictMcpConfig: true` |
| MCP servers | `~/.claude.json` `projects[<path>].mcpServers` | local | config dir, keyed on the absolute path of the folder **(docs)** | as above | as above |
| MCP servers | plugin `.mcp.json`; claude.ai connectors | plugin / account | config dir; fetched on claude.ai login **(docs; measured: 3 plugin servers and 9 connectors listed)** | `deniedMcpServers` covers both; `disableClaudeAiConnectors: true` is honoured from *any* file and a project `false` cannot undo a user `true` **(docs)** | `strictMcpConfig: true`, or `env: { ENABLE_CLAUDEAI_MCP_SERVERS: "false" }` |
| MCP servers | ACP `session/new.mcpServers` | session | merged over `_meta.claudeCode.options.mcpServers` by the bridge (`acp-agent.js:4877`) **(measured in code)** | — | this is the parameter; `strictMcpConfig` makes it exclusive **(docs; forwarding is visible in the bridge, exclusivity unverified live)** |
| Skills, commands | `.claude/skills/<name>/SKILL.md`, `.claude/commands/*.md` | project | `cwd` and every parent **up to the repository root** at launch; nested ones below on demand; **`--add-dir` directories too**, when `project` is in `settingSources` **(docs)** | Yes: `permissions.deny: ["Skill(<name>)"]`, `["Skill(<name> *)"]` or `["Skill"]` from any file; `skillOverrides: { "<name>": "off" }` from any file; `disable-model-invocation: true` in the skill's own frontmatter **(docs)** | `settings: { permissions.deny, skillOverrides }`; SDK `skills: [...]` is an allowlist by name (`[]` disables all) **(docs; unverified live)** |
| Skills, commands | `~/.claude/skills/`, `~/.claude/commands/` | user | config dir **(docs)** | same rules. Note the collision rule runs *against* the project: **personal overrides project** when names clash, and both beat a bundled skill **(docs)** | `settingSources` without `user` |
| Skills | bundled (`/code-review`, `/verify`…) and plugin skills | vendor / plugin | always **(docs)** | `disableBundledSkills`; a plugin is disabled per scope with `enabledPlugins` **(docs)** | `settings: { disableBundledSkills, enabledPlugins }` |
| Subagents | `.claude/agents/*.md` | project | walked up from `cwd` to the repository root; `--add-dir` directories too; closest wins on collision **(docs)** | Yes: `permissions.deny: ["Agent(<name>)"]` or `["Agent"]` from any file **(docs)** | `agents: {...}` JSON (highest non-managed priority); `env: { CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS: "1" }` |
| Subagents | `~/.claude/agents/*.md` | user | config dir **(docs)** | same | `settingSources` without `user` |
| Permissions | `.claude/settings.json` | project | **`cwd` only, no parent-directory fallback** **(docs; measured: an ancestor's `disabledMcpjsonServers` did not apply from a subfolder)** | **Yes, for `deny` and `ask`**: rules are evaluated deny → ask → allow across *all* scopes, so "if user settings allow a permission and project settings deny it, the deny rule blocks it" **(docs)**. **No, for `allow`**: a project's `allow` rules and `additionalDirectories` wait on the workspace-trust dialog, which an SDK session never shows — they are *not used* and a stderr warning says so, unless `projects["<git root>"].hasTrustDialogAccepted` is already true in `~/.claude.json` **(docs)** | `allowedTools`, `disallowedTools`, `settings: { permissions }` |
| Permissions | `.claude/settings.local.json` | local | `cwd` in SDK sessions (the CLI reads it from the git root since 2.1.211) **(docs)** | as above; applied without trust only while untracked by git **(docs)** | as above |
| Permissions | `~/.claude/settings.json` | user | config dir **(docs)** | a user `deny` also blocks a project `allow` — the arrow is symmetric **(docs)** | `settingSources` without `user` |
| Permissions | managed | org | `/Library/Application Support/ClaudeCode/managed-settings.json` on macOS; read regardless of `settingSources` **(docs; the bridge watches the same path)** | nothing below can widen it **(docs)** | — |
| Permission mode | `permissions.defaultMode` | any file | `auto` and `bypassPermissions` are ignored from project and local files since 2.1.257 **(docs)** | — | **not** on `session/new`: the bridge overrides `permissionMode` from resolved settings; blobot uses `session/set_mode` |
| Working directories | `--add-dir` | session | grants file access **plus** skills, commands, subagents, and the `enabledPlugins` / `extraKnownMarketplaces` keys of the added directory's settings; nothing else from its `.claude/` **(docs)** | — | ACP standard `session/new.additionalDirectories`, merged with `_meta.claudeCode.options.additionalDirectories` (`acp-agent.js:4798`) **(measured in code)** |
| Working directories | `permissions.additionalDirectories` | any file | file access **only**, loads no configuration **(docs)** | project entries wait on trust **(docs)** | `settings: { permissions.additionalDirectories }` |
| Hooks | `hooks` in `.claude/settings.json` | project | `cwd` only **(docs)**; **run in SDK sessions even in an untrusted folder** **(docs)** | `disableAllHooks` — but a project file can set it back to `false` over a user `true`, so it belongs at the flag layer **(docs)** | `settings: { disableAllHooks: true }`, or `settingSources` without `project` |
| Plugins | `enabledPlugins` | any file (per scope) | config dir holds installs; a project file can enable one **(docs)** | `strictPluginOnlyCustomization` is managed-only **(docs)** | `plugins: [{ path }]`, `settings: { enabledPlugins }` |
| Auto memory | `~/.claude/projects/<project>/memory/` | machine | **keyed on the git repository, shared by every worktree of it**; outside git, by the folder path; read regardless of `settingSources` **(docs)** | `autoMemoryEnabled: false` from any file **(docs)** | `env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" }` or `settings: { autoMemoryEnabled: false }` |
| Global state | `~/.claude.json` | user | config dir; always read; holds the login, user and local MCP servers, per-project trust, `disabledMcpServers` **(docs)** | — | relocate with `env: { CLAUDE_CONFIG_DIR }` |

## The four questions

### 1. What is read from the working directory, what from an ancestor, and can a parameter point elsewhere

- **From `cwd` only:** `.claude/settings.json` and `.claude/settings.local.json` (settings, hooks,
  every non-list key). The docs say it — *"no parent-directory fallback"* — and the probe agrees:
  a `disabledMcpjsonServers` in `probe/.claude/settings.json` hid `probe-b` from `probe/` and not
  from `probe/sub/`.
- **Walked up from `cwd`:** `CLAUDE.md`, `CLAUDE.local.md` and `.claude/rules/` to the filesystem
  root; `.claude/skills/`, `.claude/commands/` and `.claude/agents/` to the repository root; and,
  **measured against the docs' wording**, `.mcp.json`: from `probe/sub/deeper/`, `claude mcp list`
  showed servers from both `probe/.mcp.json` and `probe/sub/.mcp.json`, and the `probe-a` defined in
  both took `sub/`'s command. The docs say `.mcp.json` lives "at your project's root"; the probe
  folder has no git root, so what was measured is the plain ancestor walk. Whether a git root stops
  the walk is **unverified**.
- **What that means for the anchor.** A generalist's folder at
  `~/.local/share/blobot/agents/<agent>/` has `~` as an ancestor, so a `~/CLAUDE.md`, a
  `~/.claude/rules/`, a `~/.mcp.json` would all reach the agent through the *project* walk, not the
  *user* scope, and dropping `user` from `settingSources` would not remove them. blobot's worktrees
  under `~/.local/share/blobot/worktrees/` sit on the same chain. `claudeMdExcludes` and
  `disabledMcpjsonServers` are the per-file answers; `strictMcpConfig` is the whole answer for MCP.
- **Pointing at a directory that is not `cwd`:** ACP `session/new.additionalDirectories` becomes
  `--add-dir`, and an added directory contributes its skills, commands, subagents and its
  `enabledPlugins`, **not** its `CLAUDE.md` (env flag required), **not** its permissions, hooks or
  `.mcp.json`. So a generalist folder cannot be "attached" to a repository worktree as a second
  config root; the one config root is `cwd`.

### 2. Can project scope deny what user scope allows

**Yes for everything that restricts, no for anything that grants.**

- Permission rules: deny → ask → allow, first match wins, **across all scopes** — a project `deny`
  beats a user `allow` and a user `deny` beats a project `allow` **(docs, permissions §Settings
  precedence)**. Lists merge across files rather than override. A bare tool name in `deny`
  (`Bash`, `mcp__<server>`, `mcp__*`, `Skill`, `Agent`, `*`) removes the tool from the model's
  context; a scoped rule (`Bash(rm *)`, `Skill(deploy *)`, `Agent(Explore)`) leaves the tool and
  blocks the call **(docs)**.
- An MCP server the operator configured in `~/.claude.json` **can be switched off from a project
  file**: `deniedMcpServers: [{ "serverName": "context7" }]` in `probe/.claude/settings.json`
  removed `context7` from `claude mcp list` in that folder **(measured)**. `deniedMcpServers`
  reaches plugin servers, `--mcp-config` servers and claude.ai connectors too, merges from every
  file, and beats `allowedMcpServers` **(docs)**. `disabledMcpServers` is *not* that lever: it is
  written into `~/.claude.json` by the `/mcp` toggle and did nothing from a settings file
  **(measured)**.
- `disabledMcpjsonServers` rejects a `.mcp.json` server from any file **(docs; measured)**. The
  docs say it shows as `✘ Rejected`; here it was simply absent from the listing. `disallowedTools`
  on `session/new` is the same deny list for one session, and it is the only route for an `mcp__`
  rule with parentheses, which settings files skip **(docs)**.
- The exception is trust. A project's `permissions.allow` and `permissions.additionalDirectories`
  are held until the workspace-trust dialog is accepted, an SDK session never shows it, and
  *"trusting a parent folder doesn't count"* for these rules. Trust is keyed on the git root (the
  main checkout's root for a worktree), or on the folder itself outside git, in
  `projects["<path>"].hasTrustDialogAccepted` in `~/.claude.json` **(docs)**. So a file blobot
  puts in an anchor can only *narrow*; anything it needs to *widen* goes on `session/new`, which
  is where `permissions.ts` already puts it.
- What a project file cannot do: reach `auto`/`bypassPermissions` via `defaultMode`; override a
  managed rule; unhide a skill a user file hid (both merge, both restrict).

### 3. What can be supplied on `session/new` instead of as a file

Everything in the table's last column, because of the spread at `acp-agent.js:4869`. In
particular, and in the order ticket 14 is likely to want them:

- `mcpServers` (ACP standard) plus `strictMcpConfig: true` — the loopback and only the loopback,
  with `.mcp.json`, `~/.claude.json`, plugins and connectors ignored. **Forwarding measured in
  code; exclusivity unverified live.**
- `allowedTools` / `disallowedTools` — already used; note bare names in `disallowedTools` *remove*
  tools from context.
- `settings` — an inline settings object at the flag layer, *"populates the flag-settings layer in
  the precedence order"*, above local, project and user. It carries any settings key:
  `permissions.deny`, `deniedMcpServers`, `disabledMcpjsonServers`, `claudeMdExcludes`,
  `skillOverrides`, `disableBundledSkills`, `disableAllHooks`, `autoMemoryEnabled`,
  `enabledPlugins`, `permissions.additionalDirectories`. The bridge forwards it and re-reads it
  from `cwd` when it is a path (`acp-agent.js:4829-4849`). This is the "settings file that is not a
  file" and **has not been exercised live by blobot**.
- `settingSources` — sent today as `["user","project","local"]`; per ADR-0003.
- `skills` (allowlist by name), `agents` (inline subagents), `plugins` (paths), `env` (merged over
  `process.env`, so `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY`,
  `ENABLE_CLAUDEAI_MCP_SERVERS` can be per session). **All unverified live.**
- `additionalDirectories` — ACP standard field, merged with the `_meta` one.
- **Not** available: `permissionMode` (overridden from resolved settings; blobot's `set_mode`
  route stands) and `canUseTool`.

### 4. Environment variables, and whether a per-agent config dir is Cursor's `CURSOR_CONFIG_DIR`

- `CLAUDE_CONFIG_DIR` relocates *"all settings, session history, and plugins"* and, per the SDK
  docs, `~/.claude.json` too; the bridge reads it (`acp-agent.js:18`) and `palette.ts` already
  honours it. It is ignored inside a project or local `env` block, so it has to come from the
  process environment — `_meta.claudeCode.options.env` reaches it **(docs)**.
- **Measured with a fresh directory:** `claude mcp list` showed only the `.mcp.json` server —
  every user-scope server, every plugin server and every claude.ai connector was gone — and the
  CLI created `.claude.json` and `backups/` in the new directory. **But `claude auth status`
  reported `loggedIn: false, authMethod: none`.** On this macOS machine the login does not
  survive the switch, which is the opposite of Cursor, where the login lives outside
  `CURSOR_CONFIG_DIR`. A per-agent Claude config dir would mean a per-agent `claude auth login`,
  which the no-credential-storage rule can tolerate (the CLI owns it) but the user would have to
  repeat per agent. Whether `CLAUDE_CODE_OAUTH_TOKEN` or a copied credentials file bridges it is
  **unverified and out of scope** — it would be blobot handling a credential.
- `CLAUDE_CODE_PROJECT_DIR_NAME`, honoured only beside `CLAUDE_CONFIG_DIR`, names the
  `projects/<name>/` directory transcripts and auto memory land in **(docs)**.
- `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` loads CLAUDE.md from `--add-dir` directories;
  `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` stops the shared-per-repo memory;
  `ENABLE_CLAUDEAI_MCP_SERVERS=false` drops connectors; `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1`
  removes Explore/Plan/general-purpose in `-p` mode **(docs)**.

## Two things ticket 14 did not ask and should know

- **Auto memory is shared across worktrees of one repository** and is read regardless of
  `settingSources`. An agent on a worktree of the user's repo reads the user's own auto-memory
  index and writes into it with `Write`/`Edit`. Nothing in blobot chose that.
- **Project hooks and a project `env` block run in SDK sessions before trust**, while project
  `allow` rules do not. A folder an agent can write to can therefore add a hook that runs on the
  agent's next start. `disableAllHooks` at the flag layer is the counter, and only there.

## What ticket 14 needs, in three sentences

Claude Code's project scope is **the `cwd`'s `.claude/` for settings and hooks, and an ancestor
walk for everything else** — instructions, rules, skills, subagents and (measured) `.mcp.json` —
so an anchor under `~/.local/share/blobot/agents/<agent>/` inherits from `~` through the project
walk whatever the user-scope switch says. A file in that folder **can deny anything the user
scope allows** (deny beats allow from any scope; `deniedMcpServers` from a project file measured
removing a `~/.claude.json` server; `Skill(x)`, `Agent(x)`, `mcp__server` rules likewise) but
**cannot grant**, because a project's `allow` rules wait on a trust dialog an SDK session never
shows. And every one of those files has a `session/new` twin — `mcpServers` + `strictMcpConfig`,
`allowedTools` / `disallowedTools`, `settingSources`, `additionalDirectories`, and an inline
`settings` object that is the whole settings file in memory — so blobot can express access
without writing anything an agent could commit home; `CLAUDE_CONFIG_DIR` separates the user scope
completely but takes the login with it, which is the one way it is not `CURSOR_CONFIG_DIR`.

## Probe transcript (redacted)

Folder: `<scratchpad>/probe/` with `.mcp.json` `{probe-a: /usr/bin/true, probe-b: /usr/bin/true}`
and `.claude/settings.json` `{disabledMcpjsonServers: ["probe-b"]}`; later `probe/sub/.mcp.json`
`{probe-a: /usr/bin/false, probe-c: /usr/bin/true}`; later still the settings file grew
`deniedMcpServers: [{serverName: "context7"}]`, `disabledMcpServers: ["Sanity"]`,
`permissions.deny: ["mcp__shadcnio"]`.

```
$ cd probe && claude mcp list
… 9 "claude.ai <name>" connectors, 3 "plugin:<x>:<y>" servers, 4 user servers (posthog, context7, Sanity, shadcnio) …
probe-a: /usr/bin/true  - ⏸ Pending approval (run `claude` to approve)
                                      # probe-b absent: disabledMcpjsonServers honoured from the project file

$ cd probe/sub && claude mcp list
probe-a: /usr/bin/true  - ⏸ Pending approval
probe-b: /usr/bin/true  - ⏸ Pending approval   # ancestor .mcp.json read; ancestor settings.json NOT applied

$ cd probe/sub/deeper && claude mcp list       # after adding probe/sub/.mcp.json
probe-a: /usr/bin/false - ⏸ Pending approval   # nearest definition wins
probe-b: /usr/bin/true  - ⏸ Pending approval
probe-c: /usr/bin/true  - ⏸ Pending approval

$ cd probe && claude mcp get probe-a
  Scope: Project config (shared via .mcp.json)

$ cd probe && CLAUDE_CONFIG_DIR=<scratchpad>/cfg claude mcp list
probe-a: /usr/bin/true  - ⏸ Pending approval   # the only server; cfg/ gained .claude.json and backups/

$ CLAUDE_CONFIG_DIR=<scratchpad>/cfg claude auth status
{ "loggedIn": false, "authMethod": "none", … "projectsDirectory": "<scratchpad>/cfg/projects" }
$ claude auth status
{ "loggedIn": true, "authMethod": "claude.ai", … }

$ cd probe && claude mcp list                  # with deniedMcpServers / disabledMcpServers / permissions.deny added
posthog … Sanity … shadcnio …                  # context7 gone (deniedMcpServers); Sanity still listed (disabledMcpServers
probe-a …                                      #   is a ~/.claude.json list, not a settings key); shadcnio listed (permissions
                                               #   act at call time, not in the listing)
```

`claude mcp list` prints stdio servers' full command lines, API keys included; the raw output is
deliberately not kept.

## Unverified

- That `strictMcpConfig` through `_meta.claudeCode.options` actually excludes `.mcp.json`, plugin
  and connector servers in a live session (forwarding is visible in the bridge; the SDK documents
  the behaviour).
- That `settings` through `_meta.claudeCode.options` applies `permissions.deny`, `deniedMcpServers`
  and `claudeMdExcludes` in a live session.
- That `skills: [...]`, `agents`, `plugins` and `env` pass through with effect.
- Whether the `.mcp.json` ancestor walk stops at a git root (the probe folder had none).
- Whether `claudeMdExcludes` from a project file can exclude `~/.claude/CLAUDE.md`.
- Whether a bare `mcp__<server>` in `permissions.deny` removes the tools (docs say yes; the listing
  cannot show it).
- Whether any credential mechanism carries a login into a fresh `CLAUDE_CONFIG_DIR` without blobot
  touching a credential.

## Sources

- `claude --help`, `claude mcp --help`, `claude mcp list --help`, `claude auth --help`, 2.1.259,
  this machine.
- Bridge: `node_modules/.pnpm/@agentclientprotocol+claude-agent-acp@0.70.0*/…/dist/acp-agent.js`
  lines 18 (`CLAUDE_CONFIG_DIR`), 4716-4745 (`SettingsManager`, `mcpServers` from the ACP field),
  4764-4800 (`_meta.claudeCode.options`, `additionalDirectories`), 4829-4849 (`settings`),
  4866-4930 (the spread and the overrides); `dist/settings.js` (`resolveSettings({cwd})`, watched
  paths). SDK 0.3.232 `sdk.d.ts` lines 1358, 1401, 1421, 1734, 1954, 1989, 2012, 2038.
- https://code.claude.com/docs/en/settings — precedence, *Lists merge instead of overriding*,
  *Settings files and who they affect*, `CLAUDE_CONFIG_DIR` note.
- https://code.claude.com/docs/en/settings-reference — `permissions.deny`,
  `permissions.additionalDirectories`, `permissions.defaultMode`, `allowedMcpServers`,
  `deniedMcpServers`, `disabledMcpjsonServers`, `enabledMcpjsonServers`,
  `enableAllProjectMcpServers`, `allowManagedPermissionRulesOnly`, `strictPluginOnlyCustomization`.
- https://code.claude.com/docs/en/permissions — *Manage permissions* (deny → ask → allow),
  *MCP*, *Agent*, *Working directories*, *Additional directories grant file access, not
  configuration*, *Settings precedence*, *Project allow rules and workspace trust*, *What runs
  before you trust a folder*.
- https://code.claude.com/docs/en/mcp — scopes, *Project scope*, *Disable a server without
  removing it* (`disabledMcpServers`), `--strict-mcp-config`.
- https://code.claude.com/docs/en/memory — *How CLAUDE.md files load*, *Load from additional
  directories*, `.claude/rules/`, `claudeMdExcludes`, auto memory storage.
- https://code.claude.com/docs/en/skills — *Where skills live*, precedence on collision,
  *Discovery from parent and nested directories*, *Skills from additional directories*,
  `Skill(name)` rules, `skillOverrides`, `disableBundledSkills`.
- https://code.claude.com/docs/en/sub-agents — locations and priority, ancestor walk, `Agent(name)`.
- https://code.claude.com/docs/en/cli-reference — `--add-dir`, `--allowedTools`,
  `--disallowedTools`, `--mcp-config`, `--strict-mcp-config`, `--settings`, `--setting-sources`.
- https://code.claude.com/docs/en/env-vars — `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_PROJECT_DIR_NAME`,
  `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY`.
- https://code.claude.com/docs/en/agent-sdk/typescript — Options: `mcpServers`, `strictMcpConfig`,
  `settingSources`, `additionalDirectories`, `allowedTools`, `disallowedTools`, `settings`, `env`.
- https://code.claude.com/docs/en/agent-sdk/claude-code-features — *Control filesystem settings
  with settingSources* (the per-source table), *What settingSources does not control*.
- https://code.claude.com/docs/en/claude-directory — `~/.claude.json` contents, `CLAUDE_CONFIG_DIR`.
- In-repo: `docs/adr/0003-what-an-agent-inherits.md`, `packages/core/src/adapters/claude/permissions.ts`,
  `palette.ts`, `claude-agent-runtime.ts:369-377`.
