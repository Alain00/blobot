# What Cursor loads from a folder, and what it can be denied

Research for ticket 13, feeding ticket 14 (*how what an Agent can access is expressed*).
Measured 2026-09-03 on this machine against `cursor-agent` **2026.09.02-c22c1a3** (the vendor
auto-updated it; the adapter's `VERIFIED_CURSOR_VERSION` is still `2026.08.25-3e8eec8`, the one
ticket 01 of `.scratch/cursor-runtime/` spent three turns on), the official docs at `cursor.com/docs`
as served that day, and the CLI's own bundle at
`~/.local/share/cursor-agent/versions/2026.09.02-c22c1a3/*.js` — a webpack build of plain
JavaScript, so the file paths, the merge order and the deny check can be read rather than guessed.
Every probe was zero-token: `cursor-agent --help` and the subcommand helps, `status --format json`,
`about`, and `mcp list` in a throwaway folder under the session scratchpad holding a
`.cursor/mcp.json` and a `.cursor/cli.json`, run three times: with the real config, with
`CURSOR_CONFIG_DIR` pointed at an empty directory, and with `CURSOR_DATA_DIR` pointed at another.
No prompt was sent and no ACP session was opened. Nothing under `~/.cursor` was edited by hand;
the CLI itself created `~/.cursor/projects/<probe-slug>/mcp-auth.json` on the first `mcp list`, as
it does for every folder it is run in.

Claims from the docs are marked **(docs)**; claims measured today **(measured)**; claims read
out of the bundle **(bundle)** — the code is there, the behaviour was not exercised; claims that
rest on ticket 01's live turns of 2026-08-31 **(ticket 01)**; anything else is **unverified**.

## The one thing to know first

Cursor keeps **two** roots, and blobot has been relocating only one of them.

```
config dir  = CURSOR_CONFIG_DIR  || $XDG_CONFIG_HOME/cursor || ~/.cursor      → cli-config.json, acp-sessions/
data dir    = CURSOR_DATA_DIR    || ~/.cursor                                 → projects/<slug>/{mcp-approvals,mcp-disabled,mcp-auth}.json, .workspace-trusted, repo.json
```

That is `cursor-config/dist/paths.js` verbatim, minus the minification **(bundle)**. `CURSOR_DATA_DIR`
is undocumented on the CLI reference page and its only argv spelling, `--data-dir`, is a hidden
option described as *"Set the Cursor data directory used for project metadata in this session
(internal only)"* **(bundle)**. Measured today: with both variables pointed at empty scratch
directories, `status` still answers `isAuthenticated: true`, `mcp list` still runs, and the
per-project state (`projects/<slug>/mcp-auth.json`) is written under the relocated data dir and
nowhere under `~/.cursor` **(measured)**. So the login lives outside both, exactly as ticket 01
found for the config dir alone.

Why it matters: the **per-project off switch for the operator's own MCP servers** —
`mcp-disabled.json`, the file `agent mcp disable <id>` writes, an array of server ids **(bundle)**
— lives in the data dir. Ticket 07 declined to use it because it meant writing into the user's
real `~/.cursor/projects/`. With a per-agent `CURSOR_DATA_DIR`, it is a file in a directory blobot
owns, per agent, dead with it. What the data dir does **not** move is `~/.cursor/mcp.json` itself,
which is `join(homedir(), ".cursor", "mcp.json")` in every loader in the bundle and loaded under
both relocations **(bundle; measured: all ten of the user's servers listed each time)**.

## Channel → file or parameter → scope → can it be denied

"Discovered from" says where Cursor actually looks when the process's cwd and `--workspace` are
the AgentWorkspace. "Project can deny user" answers whether a file in the anchor can switch off
something the operator's own scope provides. The last column names what does the same thing
without a file in the repository: a `session/new` parameter or a process environment variable.

| Channel | File / parameter | Scope | Discovered from | Project can deny user? | Without a file in the repository |
| --- | --- | --- | --- | --- | --- |
| MCP servers | `~/.cursor/mcp.json` | user | **`homedir()` hard-coded** in every loader; unaffected by `CURSOR_CONFIG_DIR` and `CURSOR_DATA_DIR` **(bundle; measured)**. Loads with no approval step **(bundle: the user file gets no approval layer; ticket 01)** | **Yes, by not loading it**: `<data dir>/projects/<slug>/mcp-disabled.json`, a JSON array of ids, honoured by `mcp list`, the stdio pre-warm and the session loader **(bundle)**; docs: *"Disabled servers won't load or prompt for approval"* **(docs)**. `agent mcp disable <id>` is the vendor's writer **(ticket 01: works)**. **Yes, by blocking the call**: `Mcp(<server>:*)` in any `permissions.deny` → `shouldBlockMcp` returns `permissionsConfig` with no prompt **(bundle)** — the tool stays advertised, the call fails silently, the same trap as the Shell deny | `CURSOR_DATA_DIR=<per-agent dir>` and blobot writes `projects/<slug>/mcp-disabled.json` there **(measured that the dir relocates; that an ACP session then omits the server is unverified — ticket 01 measured the disable itself, on the real data dir)** |
| MCP servers | `<project root>/.cursor/mcp.json` | project | the git root of the cwd, or the cwd outside git **(bundle: `project-paths.ts`)**; one file, no ancestor walk in the code, though the docs say *"project → global → nested"* and *"automatically discovering configurations from parent directories"* **(docs; the walk is unverified)**. Overrides the user file on a name collision (`{...user, ...project}`) **(bundle)**. **Requires approval**: a hash of the resolved config in `<data dir>/projects/<slug>/mcp-approvals.json`; the probe's server listed as `not loaded (needs approval)` **(measured)** | It can *add* servers, which then wait on an approval an ACP session has no UI for; `--approve-mcps` (global flag) or `agent mcp enable <id>` pre-approves **(bundle; docs)** | blobot pre-writing `mcp-approvals.json` under its data dir is possible but moot: the loopback rides `session/new` |
| MCP servers | ACP `session/new.mcpServers`, `session/load.mcpServers` | session | the ACP server passes `e.mcpServers` from **both** requests into the session's MCP lease **(bundle, `5421.index.js`, this version)**; measured live on 2026.08.25 as handshaken with its own header and **no approval** **(ticket 01)**. The docs still say only *"ACP supports MCP servers defined in a project-level or user-level `.cursor/mcp.json`"* **(docs)** | — blobot chooses what it passes | this is the parameter; the live canary in `adapters/cursor/live.test.ts` guards it and **was not re-run today** (it costs tokens) |
| MCP servers | plugins: `~/.cursor/plugins/{cache,local}`, `--plugin-dir` | user / argv | plugin bundles carry `rules, skills, agents, commands, mcpServers, hooks` **(docs)**; a plugin's servers are auto-approved on install and appear as `plugin-<plugin>-<server>` **(bundle; measured: `plugin-linear-linear`, `plugin-RevenueCat-RevenueCat` in this machine's `mcp-auth.json`)** | same `mcp-disabled.json` by id **(bundle; unverified for plugin ids)** | blobot never passes `--plugin-dir` (`FORBIDDEN_CURSOR_ARGS`); the user's installed plugins still load |
| MCP servers | `--add-dir` roots' `.cursor/mcp.json` | argv | each additional workspace root's file is loaded with a `project-<i>-<basename>-` prefix **(bundle)** | — | blobot passes none |
| MCP servers | team-level, from the Cursor dashboard | account | *"not supported in ACP mode"* **(docs)** | — | — |
| Permissions | `<config dir>/cli-config.json` | user (or per agent) | `CURSOR_CONFIG_DIR` → `$XDG_CONFIG_HOME/cursor` → `~/.cursor` **(bundle; docs; ticket 01)**. The whole schema lives here: `permissions.{allow,deny}`, `approvalMode`, `sandbox.{mode,networkAccess,networkAllowlist,readBoundary}`, `webFetchDomainAllowlist`, model, display… **(bundle: `cursor-config/dist/schema.js`)** | — this is the file blobot writes per agent | the file, in blobot's own directory |
| Permissions | `<dir>/.cursor/cli.json` for **every directory from the git root down to the cwd** | project | walked git-root → cwd, each file deep-merged over the previous, with **arrays replaced, not unioned** **(bundle)**. Schema is **strict** `{ permissions?: { allow, deny } }` — *"Only permissions can be configured at the project level"* **(docs; bundle: `k.strict()`)**. A hidden `--disable-project-configs` flag *"Ignore .cursor/cli.json files in the current project"* **(bundle)** | **Yes**: a project `deny` blocks what the user `allow` vouched — *"Deny rules take precedence over allow rules"* **(docs)**; `isMcpExplicitlyDenied` is checked before anything else **(bundle)**. And **a project `allow` replaces the user's `allow` wholesale**, so a committed file can also *widen* what runs unasked **(bundle: the array-replace merge; unverified live)** | `--disable-project-configs` on argv (hidden, unverified live) |
| Deny semantics | any `permissions.deny` | — | evaluated at call time by the permissions service, not at load **(bundle)** | a denied Shell command is a **silent hard block** whose `tool_call` reports `completed` **(ticket 01)**; a denied MCP tool is `BLOCKED (explicitly denied)` with no `session/request_permission` **(bundle)** — it is not removed from the tool list, so the model sees it and fails on it | — |
| Rules | `.cursor/rules/*.mdc`, `AGENTS.md`, `.cursorrules` (root only) | project | from the workspace root, **and every ancestor directory up to the filesystem root** — `loadRulesFromDirAndAncestors(rootDirectory)` reads `<dir>/.cursor/rules/` and `<dir>/AGENTS.md` at each level **(bundle)**; nested `**/.cursor/rules/**/*.mdc` and `**/AGENTS.md` below the root **(bundle; docs: *"Instructions from nested AGENTS.md files are combined with parent directories"*)** | No off switch. Precedence *"Team Rules → Project Rules → User Rules"* **(docs)**. `.cursorignore` gates rule discovery only behind a feature flag defaulting to off **(bundle: `rules_discovery_respect_cursorignore:!1`)** | an `AGENTS.md` in a **parent** of the AgentWorkspace, outside the repository, is read by the code path above — the first non-committable persona channel found on Cursor. **Unverified live**; ticket 08 chose the prompt, and fx's negative result does not transfer |
| Rules | `CLAUDE.md`, `CLAUDE.local.md` | project (third-party) | same walk as `AGENTS.md`, only when *third-party extensibility* is on **(bundle)**; docs: *"The CLI also reads `AGENTS.md` and `CLAUDE.md` at the project root"* **(docs)** | as above | — |
| Rules | `~/.cursor/rules/*.mdc`; account-level User Rules | user | `homedir()` hard-coded in the CLI's rule picker **(bundle)**; User Rules arrive from the account and were seen in the system prompt **(ticket 01)**. `<CURSOR_CONFIG_DIR>/rules/` is **not** read **(ticket 01)** | no | none found |
| Skills | `.cursor/skills/`, `.agents/skills/` (+ `.claude/`, `.codex/`, `.grok/skills/` third-party) — anywhere in the repository | project | *"walks the skills root recursively"*, and *"a `.cursor/skills/` (or `.agents/skills/`) folder anywhere inside your repository is picked up"* **(docs; bundle: the same five roots, `.cursor/skills-cursor` built in)** | only by the author: `disable-model-invocation: true` in the skill's frontmatter **(docs)**; no project-level switch over a user skill found | — |
| Skills | `~/.cursor/skills/`, `~/.agents/skills/` (+ third-party dirs), `~/.cursor/skills-cursor/` | user / built-in | the same root list under a user base directory **(bundle)**; not the config dir **(ticket 01: *"Skills still sync from user level"*)**; that the base is `homedir()` is **unverified** | no | none found |
| Subagents | `.cursor/agents/**/*.md` (+ `.claude/agents` third-party) | project | nested discovery **(bundle)** | — | not blobot's concern; noted because `.cursor/agents` is *exempt* from the sandbox's protected list below |
| Hooks | `/Library/Application Support/Cursor/hooks.json` → team (`.cursor/managed/active-team-hooks/`) → `~/.cursor/hooks.json` → `<ws>/.cursor/hooks.json` → **`~/.claude/settings.json`, `<ws>/.claude/settings.json`, `<ws>/.claude/settings.local.json`** → plugin hooks | enterprise / team / user / project | all of them, in that order **(bundle, `190.index.js`; docs: *"Enterprise → Team → Project → User"*)**; a config path containing a symlink is refused **(bundle)** | **Yes, and audibly**: `beforeShellExecution` / `beforeMCPExecution` / `beforeReadFile` can return `permission: deny` (exit code 2) and *the agent is told why* **(docs)** — the one deny channel on Cursor that is not silent. Whether the ACP path runs hooks at all is **unverified** | `~/.cursor/hooks.json` is `homedir()`, and the Claude-compat paths mean a repository's `.claude/settings.json` hooks run under Cursor too |
| Workspace trust | `<data dir>/projects/<slug>/.workspace-trusted`; `--trust` | machine | written per workspace path **(measured: present for this repo, absent for every blobot worktree that has run)**; `--trust` is *"headless mode only"* **(docs)** | — | ACP sessions opened without it **(ticket 01, and the four worktree project dirs today)**; moves with `CURSOR_DATA_DIR` |
| Sandbox | `sandbox.mode`, `sandbox.networkAccess` | user (or per agent) | `cli-config.json`; vendor default `disabled` / `user_config_with_defaults` **(measured: the fresh file the CLI wrote today)**; blobot writes `enabled` / `allow_all` | — | **When enabled, the agent's own writes are refused** on `**/.cursor/*.json`, `**/.cursor/**/*.json` (so `cli.json`, `mcp.json`, `mcp-approvals.json`, `hooks.json`), `**/.claude/**/*.json`, `.cursorignore`, `.workspace-trusted`, `.git/hooks/**`, `.git/config`, `~/.cursor/sandbox-policies` — with `.cursor/rules`, `.cursor/commands`, `.cursor/skills`, `.cursor/agents`, `.cursor/worktrees` **exempt** **(bundle: the protected-path table; unverified live)** |
| File access | `Read(<glob>)`, `Write(<glob>)` | permissions | *"Relative paths are scoped to the current workspace; absolute paths can target files outside the project"* **(docs)** | as any permission | — |
| Credential | the login | machine | outside both directories; `keychain-error.ts` in the bundle suggests the OS keychain **(unverified where)**; survives both relocations **(measured)** | — | blobot strips `CURSOR_API_KEY` / `CURSOR_AUTH_TOKEN` (ticket 05) |
| Config dir | `CURSOR_CONFIG_DIR` | process | moves `cli-config.json`, `acp-sessions/`, `statsig-cache.json` **(measured today: that is the whole of what the CLI wrote there)** | — | — |
| Data dir | `CURSOR_DATA_DIR` (hidden `--data-dir`) | process | moves `projects/` **(measured)**. Under `cursor-agent worker` the same variable means the worker's log/artifact base, default `/opt/cursor` **(bundle)** — a different meaning, same name | — | — |

## The four questions

### 1. What is read from the working directory, and how it merges with `~/.cursor` and the User Rules

- **MCP**: `<git root>/.cursor/mcp.json` over `~/.cursor/mcp.json`, by object spread, so a project
  server with a user server's name replaces it **(bundle)**. Project servers need an approval that
  lives in the data dir and that an ACP session cannot grant; user servers need none. Both are read
  whatever `CURSOR_CONFIG_DIR` says; nothing in either directory is read from
  `CURSOR_CONFIG_DIR` **(ticket 01; measured again today on the newer version)**.
- **Permissions**: `~/.cursor/cli-config.json` (or the relocated one) as the base, then every
  `.cursor/cli.json` from the git root down to the cwd merged over it, arrays replacing arrays.
  Only `permissions` is accepted at project level, strictly **(docs; bundle)**.
- **Rules**: `.cursor/rules/*.mdc` and `AGENTS.md` from the workspace root and every ancestor to
  `/`, plus nested ones below; `.cursorrules` at the root; `CLAUDE.md` when third-party
  extensibility is on; `~/.cursor/rules/*.mdc`; and the account's User Rules from the server.
  Applied Team → Project → User **(docs; bundle)**.
- **Skills**: five root names (`.cursor`, `.agents`, and third-party `.claude`, `.codex`, `.grok`,
  each `/skills/`) under the repository, recursively and anywhere inside it, and the same five
  under the user's base; `~/.cursor/skills-cursor` is the built-in set **(docs; bundle)**.
- **Hooks**: seven files in a fixed order, Claude's `settings*.json` among them **(bundle)**.

The one surprise in this list against ticket 08 is the **ancestor walk for `AGENTS.md`**. Ticket 08
ruled out the parent directory on fx's evidence; Cursor's code walks to the filesystem root. That
also means a user with `~/AGENTS.md` (or `~/CLAUDE.md` with third-party on) is feeding every Cursor
agent whose workspace sits under their home, which every blobot AgentWorkspace does.

### 2. Can a project file, or `cli-config.json`, deny a server, tool or skill the user provides — and is deny unusable?

**Deny is unusable for the nine dangerous verbs and usable for access, and the two do not
conflict.** Ticket 01's finding stands: a deny is a silent hard block, `tool_call: completed`, no
prompt. For `rm` and `git push` that is the wrong semantics because *the user may still say yes*.
For *this agent may not use the operator's `supabase` server* there is no yes to preserve — but a
call-time deny is still the wrong tool, because the model keeps seeing the tool and keeps failing
on it, with the refusal only in prose. The right tool is **not loading the server**, which Cursor
has: `mcp-disabled.json` in the data dir, per project path, honoured by every loader in the
bundle. With `CURSOR_DATA_DIR` per agent that file is blobot's, and no repository is touched.

By channel:

- **MCP server, user-level** — deny by omission: yes (`mcp-disabled.json`, per agent under
  `CURSOR_DATA_DIR`). Deny by block: yes (`Mcp(<server>:*)` in `deny`), silent.
- **MCP server, project-level** — a project file can only *add*, and what it adds waits on an
  approval.
- **Tool** — `Shell(...)`, `Read(...)`, `Write(...)`, `WebFetch(...)`, `Mcp(server:tool)` in
  `deny`, from either file; silent. A hook can deny the same calls *and tell the agent why*
  **(docs)**, which is the only non-silent deny — if hooks run under ACP, which is unverified.
- **Skill** — no. Not from a project file, not from `cli-config.json`, not from an argv. The only
  switch is the skill's own `disable-model-invocation`, which belongs to whoever wrote it.
- **Rule** — no.

And a Cursor-specific hazard ticket 14 has to hold: a repository's `.cursor/cli.json` **replaces**
the `permissions.allow` blobot wrote for that agent, because the merge replaces arrays. That is a
committed file widening what runs unasked — the inverse of the committable-file problem
`adapters/claude/permissions.ts` refused. The enabled sandbox refuses the *agent's* writes to
that file (bundle), so an agent cannot author it mid-turn, but a repository can arrive with one.
The hidden `--disable-project-configs` is the only off switch, and passing it also discards any
narrowing the repository intended.

### 3. Is the per-agent `CURSOR_CONFIG_DIR` already a per-agent user scope?

**No.** It is a per-agent *permissions and session* scope: `cli-config.json`, `acp-sessions/`, and
a Statsig cache, measured again today on the newer version. `~/.cursor/mcp.json` still loads under
it — the path is `homedir()` in every loader **(bundle; measured: ten user servers listed with the
config dir relocated)** — and so do `~/.cursor/rules`, the user skills roots, `~/.cursor/hooks.json`
and the account's User Rules, none of which go through the config-dir function.

Adding `CURSOR_DATA_DIR` per agent moves the per-project *state* too: approvals, the disabled
list, the trust marker, the OAuth client registrations. Together the two variables are as close to
a per-agent user scope as Cursor offers: the operator's servers, rules, skills and hooks still walk
in by the parity argument (ADR-0003; ticket 07), and the servers, uniquely, can then be switched
off per agent in a directory blobot owns.

### 4. The ACP docs versus `session/new`, on the version on this machine

The docs are unchanged: *"ACP supports MCP servers defined in a project-level or user-level
`.cursor/mcp.json`"* and *"Launch `agent` from your project directory and approve the servers you
want to use"* **(docs, 2026-09-03)**. The bundle on this machine (`2026.09.02-c22c1a3`, seven days
newer than the one ticket 01 measured) reads `e.mcpServers` off **both** `session/new` and
`session/load` and hands it to the session's MCP lease builder **(bundle, `5421.index.js`)**. So
the door is still in the code; whether it still opens with no approval step was last measured live
on `2026.08.25` **(ticket 01)** and the canary was not re-run today because it costs a turn. The
disagreement between the docs and the code is what the canary exists for, and it is still the
right guard: the docs describe the configuration path and are silent on the parameter, and a
release could close it without a changelog line.

## Two things ticket 14 did not ask and should know

- **`AGENTS.md` above the worktree is a persona channel on Cursor**, by the bundle's ancestor walk.
  A v2 generalist's anchor is `~/.local/share/blobot/agents/<agent>/`, blobot's own folder, so an
  `AGENTS.md` *inside* it is not committable and needs no ancestor trick; for an anchored Agent,
  `~/.local/share/blobot/worktrees/<chat>/<agent>/AGENTS.md` would need the worktree one level
  deeper (`.../<agent>/tree`) to be per agent. Unverified live; and ticket 08's reason for the
  prompt (immunity to a compaction blobot cannot see) still applies to a file, which is re-read
  on rule load and not on every turn. Named here so the next person does not rediscover it.
- **Cursor reads Claude's files.** `CLAUDE.md`, `CLAUDE.local.md`, `.claude/skills/`,
  `.claude/agents/`, and the hooks in `~/.claude/settings.json`, `.claude/settings.json` and
  `.claude/settings.local.json`. A Claude agent's `allow_always` answer — which ticket 14's second
  amendment measured as `permissions.allow` in `<workspace>/.claude/settings.local.json` — is
  not a hook and does not cross over; but a hook the user wrote for Claude runs under a Cursor
  agent in the same tree, and a `.claude/settings.json` committed to a repository brings its
  hooks to every Cursor agent that checks it out. Third-party extensibility is a flag in the
  vendor's hands.

## What ticket 14 needs, in three sentences

On Cursor, **restricting** an Agent's access to the operator's MCP servers is possible without a
file in the repository and without touching `~/.cursor`: a per-agent `CURSOR_DATA_DIR` beside the
existing `CURSOR_CONFIG_DIR`, holding `projects/<slug>/mcp-disabled.json` (an array of server ids,
the vendor's own `mcp disable` shape), so the server is *not loaded* — no tool advertised, no
silent block — which is mechanism (b), blobot's vocabulary translated by the adapter into a file
blobot owns. Mechanism (a), a project file, can only **add** on Cursor: `.cursor/mcp.json` adds
servers that then wait on an approval, and `.cursor/cli.json` can deny tools only as a silent
block while also **replacing** blobot's allow list, so the word for a project file is *add* and
the word for blobot's directory is *restrict*. Skills and User Rules have no per-agent switch on
Cursor at all, so for them the parity argument is not a choice but the only option, and the
sentence on the Agent's definition has to say *servers* and not *everything*.

## Probe transcript (redacted)

```
$ cursor-agent --version                        # 2026.09.02-c22c1a3 (adapter verified 2026.08.25-3e8eec8)
$ cursor-agent status --format json             # isAuthenticated: true
$ cursor-agent acp --help                       # no options of its own
$ cursor-agent mcp --help                       # login, list, list-tools, enable, disable
$ cursor-agent --help | grep -c disable-project # 0 — the flag is hidden; the bundle has it

# probe folder: .cursor/mcp.json {blobot-probe: http://127.0.0.1:65530/mcp, Authorization: Bearer ${env:BLOBOT_PROBE_TOKEN}}
#               .cursor/cli.json {permissions: {allow: [Shell(ls)], deny: [Shell(touch), Mcp(supabase:*)]}}
$ cursor-agent mcp list
supabase: ready … Sanity: ready                 # the ten servers of ~/.cursor/mcp.json
blobot-probe: not loaded (needs approval)       # the project file's server
$ CURSOR_CONFIG_DIR=<empty> cursor-agent mcp list
<identical>                                     # config dir moves nothing MCP reads
<empty>/ now holds cli-config.json, statsig-cache.json
$ CURSOR_DATA_DIR=<empty2> CURSOR_CONFIG_DIR=<empty> cursor-agent status --format json
isAuthenticated: true                           # login outside both
$ CURSOR_DATA_DIR=<empty2> CURSOR_CONFIG_DIR=<empty> cursor-agent mcp list
<identical>
<empty2>/projects/<probe-slug>/mcp-auth.json    # per-project state relocated
~/.cursor/projects/<probe-slug>/                # created by the *first* (unrelocated) run only

# fresh cli-config.json the CLI wrote: approvalMode allowlist, sandbox {mode: disabled, networkAccess: user_config_with_defaults}
# blobot's four per-agent dirs: cli-config.json, acp-sessions/, statsig-cache.json (coco_* also acp-config.json); deny [] in all
# ~/.cursor/projects/<blobot worktree slugs>/: mcp-auth.json, repo.json, worker.log — no .workspace-trusted, no mcp-approvals, no mcp-disabled
```

Bundle locations, for whoever re-checks on the next version: `cursor-config/dist/paths.js`
(the two roots), `cursor-config/dist/schema.js` (`cli.json` = `k.strict()`, `cli-config.json` =
`S`), the `FileBasedConfigProvider` merge (`Failed reading project .cursor/cli.json` is the
string to search), `src/mcp/project-paths.ts` (`mcp-approvals.json`, `mcp-disabled.json`),
`InteractivePermissionsService.shouldBlockMcp` / `matchesMcpPattern`,
`LocalCursorRulesService.loadRulesFromDirAndAncestors`, the skills root table (`skills-cursor`),
the hooks path table in `190.index.js`, the sandbox protected-path table (`**/.cursor/*.json`),
and `5421.index.js` for the ACP `session/new` / `session/load` handlers.

## Unverified

- That an **ACP session** omits a server listed in `mcp-disabled.json` under a relocated
  `CURSOR_DATA_DIR`. Ticket 01 measured `mcp disable` working on the real data dir; today
  measured the relocation; the combination needs one live turn.
- That `session/new.mcpServers` still opens with **no approval** on `2026.09.02`. The code path is
  present; the canary was not run.
- The **ancestor walk for `AGENTS.md`** reaching the model in an ACP session. Read in the bundle
  only.
- That a project `.cursor/cli.json` `allow` **replaces** the global one at runtime — read from the
  merge function; not exercised.
- Whether **hooks** run in the ACP path, and whether a hook's deny reason reaches the agent there.
- That the **sandbox** refuses the agent's writes to the protected paths when `sandbox.mode` is
  `enabled` — the table is a policy input; the enforcement was not watched.
- The base directory of the **user-level skills** roots (`homedir()` is the obvious reading; the
  caller was not found in the bundle).
- Where the **login** is stored (keychain by the module name; not confirmed).
- The docs' *"project → global → nested"* MCP precedence: no ancestor walk for `mcp.json` was found
  in the code; "nested" may mean subfolders of a monorepo and was not tested.
- `--disable-project-configs` on the `acp` subcommand (it is a root-command option; whether it
  applies under `acp` was not tried).

## Sources

- `cursor.com/docs/cli/reference/configuration` — global vs project files, *"Only permissions can
  be configured at the project level"*, `CURSOR_CONFIG_DIR`, `XDG_CONFIG_HOME`.
- `cursor.com/docs/cli/reference/permissions` — `Shell/Read/Write/WebFetch/Mcp` syntax,
  `command:args`, *"Deny rules take precedence over allow rules"*, workspace-relative paths.
- `cursor.com/docs/cli/mcp` — `agent mcp` subcommands, *"Disabled servers won't load or prompt for
  approval"*, `--approve-mcps`, *"project → global → nested"*.
- `cursor.com/docs/cli/acp` — *"ACP supports MCP servers defined in a project-level or user-level
  `.cursor/mcp.json`"*, `session/request_permission`, team-level servers unsupported.
- `cursor.com/docs/cli/using` — *"The CLI also reads `AGENTS.md` and `CLAUDE.md` at the project
  root"*.
- `cursor.com/docs/context/mcp` — schema, `${env:NAME}` / `${workspaceFolder}` interpolation.
- `cursor.com/docs/context/rules` — rule types, Team → Project → User, nested `AGENTS.md`.
- `cursor.com/docs/skills` — the four roots, Claude/Codex compatibility dirs, recursive discovery,
  `disable-model-invocation`.
- `cursor.com/docs/hooks` — the file locations, the blocking hooks, exit code 2, Enterprise → Team →
  Project → User.
- `cursor.com/docs/plugins` — *"Plugins package rules, skills, agents, commands, MCP servers, and
  hooks"*, `~/.cursor/plugins/local`.
- `cursor.com/docs/cli/reference/parameters` — the documented flag list (no `CURSOR_CONFIG_DIR`
  description, no `--disable-project-configs`, no `--add-dir`).
- `~/.local/share/cursor-agent/versions/2026.09.02-c22c1a3/{index,190,227,1066,3385,4209,4347,5421,7438}.index.js`
  — the bundle, as cited inline.
- `.scratch/cursor-runtime/issues/01`, `02`, `03`, `07`, `08` — the live measurements of
  2026-08-31 this file leans on.
- `packages/core/src/adapters/cursor/{config,permissions,stdio,cursor-agent-runtime}.ts` — what
  blobot does today.
- `docs/adr/0003-what-an-agent-inherits.md` — the parity argument.
