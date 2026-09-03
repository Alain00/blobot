# What OpenCode loads from a folder, and what it can be denied

Findings for `issues/11-access-channels-opencode.md`, the OpenCode half of ticket 14's
question. Same table shape as `access-claude.md` (ticket 09).

Date: 2026-09-03. Measured against **`opencode` 1.17.9** at `~/.bun/bin/opencode` (the only
copy on this machine — `~/.opencode/bin` does not exist here; the adapter's
`VERIFIED_OPENCODE_VERSION` and research 16 were on 1.18.4, on another machine). Every probe
below is zero-token: `opencode debug config`, `opencode debug agent`, `opencode debug skill`,
`opencode agent list`, `opencode mcp list`, `opencode debug paths`, plus the JS embedded in the
1.17.9 binary read with `strings`. No prompt was sent, no TUI started, nothing under
`~/.config/opencode` touched. Probe folders lived under the session scratchpad and are gone.

Tags: **[OBS]** observed on this machine · **[SRC]** read out of the 1.17.9 binary's embedded
JS (OpenCode's own shipped source, minified, read not run) · **[DOC]** opencode.ai docs or the
docs source on the `dev` branch · **[PRIOR]** measured earlier by research 03/16 on 1.18.4 or by
the adapter's live suite · **[UNVERIFIED]** not measured here.

The operator's real global config was the fixture for the "global" column: one remote MCP
server (`Sanity`, with a bearer header, redacted everywhere below) and no agents. Global
skills exist at both `~/.config/opencode/skill/` (2) and `~/.config/opencode/skills/` (10
symlinks into `~/.agents/skills`).

---

## The table

Channel → where it comes from → scope → can a **lower** layer (project folder, or blobot's
`OPENCODE_CONFIG_CONTENT`) deny what the operator's global config grants?

| Channel | File or parameter | Scope | Can-deny |
|---|---|---|---|
| **Main config** | `~/.config/opencode/{config.json,opencode.json,opencode.jsonc}` (`XDG_CONFIG_HOME` moves the dir) | global | — (this is the layer being denied) |
| | `$OPENCODE_CONFIG` (one explicit file) | between global and project | yes, same keys as below [SRC] |
| | `opencode.json` / `opencode.jsonc`, every one from the **git worktree root down to cwd**, root first, nearest wins | project | **yes** — `mcp.<name>.enabled:false`, `agent.<name>.disable:true`, `permission` rules [OBS] |
| | `.opencode/opencode.json{,c}` in each `.opencode` dir on that same walk | project | yes [PRIOR 16] |
| | `$OPENCODE_CONFIG_DIR/opencode.json{,c}` | **an extra `.opencode`-style dir, on 1.17.9** — global still loads beside it [OBS]; the `dev` docs say it *replaces* the global dir [DOC, UNVERIFIED on 1.18.x] | yes, as a project-layer file [OBS] |
| | `$OPENCODE_CONFIG_CONTENT` (inline JSON) | process; after every file layer, before managed config | **yes** — disables a global MCP server, a built-in agent, and adds `deny` rules; and it **merges**, never replaces (global `Sanity` and an added server both present) [OBS] |
| | `$OPENCODE_PERMISSION` (inline JSON, `permission` only) | process; merged **after** `OPENCODE_CONFIG_CONTENT` and after managed config [SRC, OBS] | yes — an env `bash:deny` beat a `CONTENT` `bash:allow` [OBS] |
| | `/Library/Application Support/opencode/opencode.json{,c}` (macOS), `/etc/opencode` (Linux), then MDM plist `ai.opencode.managed` | managed, last | admin-only; n/a |
| **MCP servers** | `mcp.<name>` in any config layer; `opencode mcp add` writes `opencode.json` (or `.opencode/opencode.json`) in cwd | global or project | project file `mcp.Sanity.enabled:false` → `opencode mcp list` in that folder says **`disabled`**, in an empty folder **`connected`** [OBS]; `CONTENT` does the same, and a later `enabled:true` re-enables (last wins) [OBS] |
| | `session/new` → `mcpServers` (ACP) | session | **honoured**: `ACP.newSession` reads `i.mcpServers` and registers them per session [SRC]; blobot's `blobot_message_agent` is found and called through it [PRIOR 03, live suite]. Whether they *merge with* the config-defined servers or replace them for that session: [UNVERIFIED] (the code registers them per session id, which reads as additive) |
| **MCP tools, per tool** | `permission: {"<server>_<tool or *>": "deny"}`, global, project, `CONTENT`, or **per agent** under `agent.<name>.permission` | any layer, and per agent | **yes**: `"Sanity_*": "deny"` from the project file lands in `opencode debug agent build`'s resolved list [OBS]; deny removes the tool from the model's tool set (`resolveTools` drops permission-denied tools) [DOC/SRC dev]. Legacy `tools: {"Sanity_*": false}` is converted to a deny rule placed **before** `permission`, so `permission` wins over `tools` [SRC] |
| **Agents / modes** | `agent.<name>` in any layer; `{agent,agents}/**/*.md` under `~/.config/opencode/`, each `.opencode/` on the walk, and `$OPENCODE_CONFIG_DIR` | global or project | **yes**: `agent.plan.disable:true` from the project file **or** from `CONTENT` removes `plan` from `opencode agent list` [OBS]. An agent defined lower merges over the same-named agent above [PRIOR 16] |
| **Commands** | `command.<name>`; `{command,commands}/*.md` in the same dirs | global or project | no deny key found [UNVERIFIED]; a same-named command lower overrides |
| **Skills** | `.opencode/skill(s)/<name>/SKILL.md` and `.claude/skill(s)/…` and `.agents/skills/…`, walking **up to the git worktree**; `~/.config/opencode/skill(s)/`; `~/.claude/skills/`; `~/.agents/skills/`; `$OPENCODE_CONFIG_DIR/skills/` [OBS: 101 found in the probe, incl. project `.opencode/skills` and `.claude/skills`, and `cfgdir/skills`] | project + global + external | `permission.skill: {"<pattern>": "deny"}` in any layer or per agent — **the rule resolves** (`skill / vercel-* / deny` in the build agent's list) but **`opencode debug skill` still lists the skill** [OBS], so the hiding the docs promise ("Skill hidden from agent, access rejected") happens at tool time, not at discovery [DOC, UNVERIFIED at tool time]. Env kill switches: `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1` drops project `.claude/skills` and `~/.claude/skills` (100 → the `.claude` ones gone) [OBS]; `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` drops `~/.claude/`, `~/.agents/` and the project `.claude/skills`, leaving 14 (`~/.config/opencode/skill(s)`, `.opencode/skills`, built-in) [OBS] |
| **Instructions** | project: `findUp` of **`AGENTS.md`, then `CLAUDE.md`, then `CONTEXT.md`** from cwd to the worktree root — the first *name* with any hit wins and **every ancestor's copy** of that name is loaded [SRC]. Global: `~/.config/opencode/AGENTS.md`, else `~/.claude/CLAUDE.md` (first that exists) [SRC, DOC]. `instructions: [...]` globs, `~/`, absolute paths, `https://` (5 s timeout) — arrays **concatenate** across layers [SRC, DOC] | project + global | project files: only `OPENCODE_DISABLE_PROJECT_CONFIG=1` (which also drops every project `opencode.json` — measured: agents `[]`, `enabled` back to unset [OBS]); global CLAUDE.md: `OPENCODE_DISABLE_CLAUDE_CODE{,_PROMPT}=1` [SRC]. No per-file deny |
| **Plugins** | `plugin: [...]` in any layer; `{plugin,plugins}/` dirs | global or project | `--pure` / `OPENCODE_PURE=1` skips external plugins (skill roster unchanged under it) [OBS]; no per-plugin deny found [UNVERIFIED] |
| **Sign-in** | `~/.local/share/opencode/auth.json` (mode 0600; `XDG_DATA_HOME` moves it — `opencode debug paths` `data`); `mcp-auth.json` beside it for OAuth MCP servers | per user, **not** per config dir | `OPENCODE_AUTH_CONTENT` (inline JSON) is read **instead of** the file when set [SRC]. `XDG_CONFIG_HOME` / `OPENCODE_CONFIG_DIR` do not move it [OBS] |

### What an ancestor can reach

- **In a git folder the walk is bounded by the worktree root.** An `opencode.json` one level
  above the repository was invisible from inside it (`probe-a` saw `[plan, probe]`, never
  `above-git`) [OBS].
- **In a folder with no git, it climbs.** From `nogit/parent/child`, both `parent/opencode.json`
  and the one two levels up were merged [OBS]. The upper bound is [UNVERIFIED]; by reading it is
  the filesystem root, since `findUp` is given no worktree. **A `plain` anchor therefore reads
  every `opencode.json` above it.** `OPENCODE_DISABLE_PROJECT_CONFIG=1` is the only stop, and it
  also stops the folder's own.
- Skills walk the same way ("until it reaches the git worktree") [DOC]; the no-git case for
  skills was not measured [UNVERIFIED].

### Two things worth knowing that the question did not ask

- **The config snapshot is per directory and per session, for the process lifetime** [PRIOR 16].
  Nothing here is hot: a deny that arrives after `session/new` is a deny that never applies.
- **Skill identity is the name, and the root that wins is unstable.** Ten of the operator's
  global skills are symlinks into `~/.agents/skills`, and `debug skill` attributed the same
  name to a different root on consecutive runs. Denying by name is fine; reasoning about *which
  copy* loaded is not.

---

## The sentences ticket 14 needs

1. **A folder is a complete access channel on OpenCode, and it can say no.** A project
   `opencode.json` (or `.opencode/opencode.json`) written at the anchor deep-merges over the
   operator's `~/.config/opencode/opencode.json` and can disable a global MCP server
   (`mcp.<name>.enabled:false`, measured as `disabled` in `opencode mcp list`), a global or
   built-in agent (`agent.<name>.disable:true`, gone from `agent list`), any tool including any
   MCP tool (`permission: {"<server>_*": "deny"}`), and any skill by name pattern
   (`permission.skill`). The operator's own skills, rules and MCP servers otherwise stay loaded,
   which is ADR-0003's shape.
2. **`OPENCODE_CONFIG_CONTENT` does everything the folder does, without a file** — it is the
   layer after every file and it merges rather than replaces (measured: the global server
   survives beside an added one; a `CONTENT` `enabled:true` overrides a project `enabled:false`).
   So blobot needs no committable file to deny anything; the only thing above it is
   `OPENCODE_PERMISSION` (permission rules only) and the admin's managed config.
3. **There is no per-agent config dir on 1.17.9, but there is a per-agent global.**
   `OPENCODE_CONFIG_DIR` is an *additional* `.opencode`-style directory (config, agents,
   commands, skills — measured), not a replacement for `~/.config/opencode`; the `dev` docs say
   it replaces the global dir, so this is version-sensitive and must be re-measured on the
   adapter's pinned version. `XDG_CONFIG_HOME` **does** replace the global config dir wholesale
   (the operator's server vanished under it), and it leaves the sign-in alone: `auth.json` is in
   the *data* dir (`~/.local/share/opencode/`, `XDG_DATA_HOME`), so a per-agent
   `XDG_CONFIG_HOME` gives a clean global with the user's login intact. What it does **not**
   move: `~/.claude/skills`, `~/.agents/skills` and `~/.claude/CLAUDE.md`, which are hard-coded
   under `$HOME` and need `OPENCODE_DISABLE_EXTERNAL_SKILLS` / `OPENCODE_DISABLE_CLAUDE_CODE` to
   go away.
4. **`session/new` `mcpServers` is honoured** (the loopback already rides it), and a
   per-session server's tools are still subject to `permission` by `<server>_<tool>` name, so a
   folder or `CONTENT` rule `"blobot_*": "deny"` would silence the mailbox — the same hazard
   ADR-0003 names for `/mcp disable all`, from the other direction.
5. **A `plain` anchor is not sealed from above.** Without a git root the `opencode.json` walk
   continues into every ancestor (measured two levels, bound unverified), and so does the
   instruction-file walk (`AGENTS.md` → `CLAUDE.md` → `CONTEXT.md`, all ancestors of the first
   name that hits). The generalist folder under `~/.local/share/blobot/agents/<agent>/` inherits
   whatever sits between it and `/`. Either that path is kept clean by construction, or the
   spawn sets `OPENCODE_DISABLE_PROJECT_CONFIG=1` and delivers the whole project layer through
   `CONTENT` — which is already how the persona and the posture travel.

---

## Probe record

| Probe | Setup | Result |
|---|---|---|
| A | git folder; `opencode.json` with `mcp.Sanity.enabled:false`, `agent.plan.disable:true`, a custom `probe` agent, `permission: {Sanity_*: deny, skill: {vercel-*: deny}, bash: {*: allow, "rm *": deny}}`, `tools: {Sanity_*: false}`; `.opencode/skills/probe-skill`, `.claude/skills/claude-probe`, `AGENTS.md`; a sub-folder | `debug config`: all keys merged onto the global; `agent list`: `plan` absent, `probe` present; `debug agent build`: the three rules resolved after the built-ins; `mcp list`: `Sanity disabled`; `debug skill`: both project skills found, `vercel-*` still listed; from `sub/`: identical |
| B | empty folder, `OPENCODE_CONFIG_CONTENT` with `enabled:false`, `plan.disable`, `Sanity_*: deny` | same as A for all three. `CONTENT` `enabled:true` over A's file → `true`. `CONTENT` adding `blobot` → both servers present |
| C | `OPENCODE_CONFIG_DIR=<dir>` with its own `opencode.json` and `skills/` | `debug paths` `config` unchanged; its server, its `plan.disable` and its skill all merged **with** the global still present. `XDG_CONFIG_HOME=<dir>` → `config` path moved, global server gone. `XDG_DATA_HOME` → `data` (auth.json's dir) moved |
| D | `OPENCODE_PERMISSION='{"bash":"deny"}'` with `CONTENT` `bash: allow` | resolved `bash deny` (env after content) |
| E | no-git `parent/child` with `opencode.json` at `parent/` and two levels up | both agents visible from `child` |
| F | `OPENCODE_DISABLE_PROJECT_CONFIG=1` in A | agents `[]`, `enabled` unset; skills not re-measured |

## Sources

- `opencode --help`, `opencode debug --help`, `opencode mcp --help` — 1.17.9, this machine.
- The 1.17.9 binary's embedded JS (`strings`): `Config` load order (`loadInstanceState`
  equivalent: global files → `OPENCODE_CONFIG` → project `findUp` unless
  `OPENCODE_DISABLE_PROJECT_CONFIG` → each `.opencode` dir **or `OPENCODE_CONFIG_DIR`** →
  `OPENCODE_CONFIG_CONTENT` → org config → managed dir → managed plist → `mode`→`agent` →
  `OPENCODE_PERMISSION` → `tools`→`permission`); `Instruction.systemPaths` (the
  `AGENTS.md`/`CLAUDE.md`/`CONTEXT.md` walk); `ACP.newSession` (`i.mcpServers`); `Auth.all`
  (`OPENCODE_AUTH_CONTENT`); `RuntimeFlags`; `managedConfigDir`.
- https://opencode.ai/docs/config/ — precedence list, "merged together, not replaced",
  `OPENCODE_CONFIG_DIR` "searched for agents, commands, modes, and plugins just like the
  standard `.opencode` directory".
- https://opencode.ai/docs/mcp-servers/ — `enabled: false`, `tools: {"my-mcp*": false}`,
  `mcp-auth.json`.
- https://opencode.ai/docs/permissions/ — keys, `deny`, last matching rule wins, `tools`
  deprecated into `permission` as of v1.1.1.
- https://opencode.ai/docs/agents/ — `disable`, `"mymcp_*": "deny"` denies every tool from an
  MCP server.
- https://opencode.ai/docs/skills/ — the six discovery roots, "walks up ... until it reaches the
  git worktree", `deny` — "Skill hidden from agent, access rejected".
- https://opencode.ai/docs/rules/ — `AGENTS.md` / `CLAUDE.md`, `~/.config/opencode/AGENTS.md`,
  `instructions` with globs and URLs, `OPENCODE_DISABLE_CLAUDE_CODE*`.
- `github.com/anomalyco/opencode` `dev`: `packages/opencode/src/config/config.ts` (load order,
  `mergeConfigConcatArrays`, `instructions` set-union), `packages/core/src/global.ts`
  (`config: Flag.OPENCODE_CONFIG_DIR ?? Path.config` — the replace semantics **not** seen on
  1.17.9), `packages/opencode/src/session/llm/request.ts` (`resolveTools` drops
  permission-denied tools), `packages/opencode/src/session/prompt.ts` (`tools` → deny rules),
  via context7.
- `.scratch/first-demo/research/16-opencode-persona.md` and `03-opencode-acp-surface.md`
  (1.18.4, 2026-08-29); `packages/core/src/adapters/opencode/{config.ts,opencode-agent-runtime.ts,live.test.ts}`.
