# What Codex loads from a folder, and what it can be denied

Research for ticket 10, feeding ticket 14 (*how what an Agent can access is expressed*).
Measured 2026-09-03 on this machine against the user's own `codex` **0.151.0**
(`/Users/guillermo/.bun/bin/codex`, handed to the bridge as `CODEX_PATH`, which is how blobot
runs it) behind the pinned `@agentclientprotocol/codex-acp` **1.7.0**, plus the config reference
at `developers.openai.com/codex/config-reference` (served from `learn.chatgpt.com`) and the
`openai/codex` source as indexed by context7 that day. Ticket 01 and 02 of `.scratch/codex-runtime/`
measured 0.148.0; nothing here contradicts them.

Every probe was zero-token: `codex --help` and subcommand help, `codex mcp list --json`,
`codex debug prompt-input` (which renders the developer message Codex *would* send, without
sending it), `codex doctor --json`, and `initialize` + `session/new` through the real bridge with
a throwaway driver, observing which MCP server processes it spawned and never calling
`session/prompt`. All of it in a throwaway folder under the session scratchpad; nothing under
`~/.codex` was touched. Claims that rest on docs or source alone are **(docs)**; claims measured
here are **(measured)**; **(bridge)** is read off `codex-acp/dist/index.js`; anything neither is
**unverified**.

## The one thing to know first

**The bridge marks the session's `cwd` as a trusted project on every `session/new`** — it puts
`projects.<cwd>.trust_level = "trusted"` into the `config` it hands `thread/start`, beside
`CODEX_CONFIG` and the client's `mcpServers` (`createSessionConfig`, **bridge**). Codex gates every
project-scoped `.codex/` layer (config, hooks, exec-policy rules) on that trust, and the TUI asks
a person before granting it; under blobot nobody is asked, so **an AgentWorkspace's own
`.codex/config.toml` is live from turn one** **(measured: a server defined only there was spawned)**.
And because `thread/start.config` is the highest ordinary layer, **`CODEX_CONFIG` can switch off
any MCP server the operator's `~/.codex/config.toml` defines**, per agent, with no file:
`{"mcp_servers.<name>.enabled": false}` **(measured: the operator's `aws_mcp` did not spawn)**.
Both halves of ticket 14's question have a mechanism on this runtime.

## Channel → file or parameter → scope → can it be denied

"Discovered from" says where Codex looks when `cwd` is the AgentWorkspace. "Project can deny
user" is whether a file in the anchor switches off something the operator's scope provides.
"Without a file" is the same done from `CODEX_CONFIG` or `session/new`.

| Channel | File / parameter | Scope | Discovered from | Project can deny user? | Without a file |
| --- | --- | --- | --- | --- | --- |
| Config, precedence | `config.toml` layers, low to high: package, admin (MDM), system `/etc/codex/config.toml`, cloud, **user `$CODEX_HOME/config.toml`**, profile `$CODEX_HOME/<name>.config.toml`, **project `.codex/config.toml`**, runtime (`-c`, `thread/start.config`) | — | `codex-rs/config/src/loader/mod.rs` **(docs)**; precedence numbers user 20, project 25, session flags 30 **(docs)** | Tables **deep-merge** key by key and scalars replace (`merge.rs`, **docs**; **measured** for `mcp_servers`) | `CODEX_CONFIG` is the runtime layer: nested JSON *and* dotted keys both work **(measured)** |
| Config, trust | `projects."<path>".trust_level` in the user config | user | **Exact match** on the directory, then its project root, then its git root — no prefix or ancestor walk **(docs)**. A linked worktree resolves to the *main* repository's root for this lookup **(docs)** | An unknown or untrusted directory has its `.codex/` config, hooks and rules loaded but **disabled** **(docs; measured in the CLI)** | The bridge injects trust for `cwd` and each `additionalDirectories` entry on every session **(bridge; measured)**. A runtime override works in the CLI as an inline table, `-c 'projects={"<path>"={trust_level="trusted"}}'`; the dotted-quoted form fails silently **(measured)** |
| Config, project layer | `<cwd>/.codex/config.toml`, then each ancestor's `.codex/config.toml` **up to the project root** (`.git`), then the git root's | project | `discover_project_layers` **(docs)** | Each ancestor is trust-checked **by its own exact path**: with `cwd = <repo>/sub`, `<repo>/.codex/config.toml` was **not** applied under the bridge, because only `sub` was marked trusted **(measured)** | — |
| Config, project layer limits | keys a project file may not set: `openai_base_url`, `chatgpt_base_url`, `apps_mcp_product_sku`, `model_provider`, `model_providers`, `notify`, `profile`, `profiles`, `experimental_realtime_ws_base_url`, `otel` | — | config reference **(docs)** | **Everything else is a project file's to set**: `model_instructions_file`, `developer_instructions`, `approval_policy`, `sandbox_mode`, `shell_environment_policy`, `hooks`, `mcp_servers`, `features` **(docs)**. Under blobot the persona survives, because `CODEX_CONFIG.developer_instructions` is a higher layer **(docs; inferred from precedence)** | — |
| MCP servers | `[mcp_servers.<name>]` in any layer: `command`/`args`/`env`/`cwd` (stdio) or `url`/`bearer_token_env_var`/`http_headers` (streamable HTTP); `enabled`, `enabled_tools`, `disabled_tools`, `required`, `startup_timeout_sec`, `tool_timeout_sec`, `default_tools_approval_mode`, `tools.<tool>.approval_mode` | any | user config here defines 10; the project layer adds by name **(measured)** | **Yes.** `[mcp_servers.aws_mcp] enabled = false` in the workspace's `.codex/config.toml` stopped the operator's stdio server from spawning **(measured)**; `enabled_tools` / `disabled_tools` narrow one server to named tools **(docs)** | `CODEX_CONFIG={"mcp_servers.<name>.enabled":false}` — the same server did not spawn **(measured)**; the nested spelling `{"mcp_servers":{"<name>":{"enabled":false}}}` also works and does **not** wipe the table (deep merge) **(measured)** |
| MCP servers | ACP `session/new.mcpServers` (stdio and HTTP with headers; `mcpCapabilities: {http: true, sse: false}`) | session | written by the bridge into `thread/start.config.mcp_servers.<name>` — the runtime layer, deep-merged with every file's servers **(bridge; measured: a client server and a project server both spawned)** | — | This is the parameter. **Name collisions: config wins.** The bridge reads `config/read` with layers and **drops any client server whose name a config layer already uses**, silently, unless `DISABLE_MCP_CONFIG_FILTERING=true` **(bridge; measured: a client `probe_project` was ignored in favour of the file's)**. So an operator with a server named `blobot` would lose the mailbox |
| MCP servers | `codex mcp list --json`, `codex mcp get` | — | reads the layer stack for `$PWD`, honouring a runtime trust override **(measured)** | a zero-token way to see the effective set for a folder | **it prints `http_headers` values in clear** — do not paste its output into a ticket **(measured)** |
| Instructions | `AGENTS.override.md`, then `AGENTS.md`, then `project_doc_fallback_filenames`, first hit per directory | project | **project root down to `cwd`, inclusive**, root found by `project_root_markers` (default `[".git"]`); never past the root; with no marker, **`cwd` only** **(docs)**. Capped at `project_doc_max_bytes` = 32 KiB **(docs)** | **Not gated by trust**: an unknown-trust folder's `AGENTS.md` was in the developer message **(measured)**. No exclusion key exists; a project file can only redirect the base prompt with `model_instructions_file` **(docs)** | `developer_instructions` in `CODEX_CONFIG` is *added* beside AGENTS.md, not instead of it — research 01 saw both in one sentence; the CLI's `-c developer_instructions=…` lands in the developer message **(measured)** |
| Instructions | `$CODEX_HOME/AGENTS.md` | user | config dir; concatenated before project files **(docs)**; none exists on this machine | no key excludes it **(docs)** | relocating `CODEX_HOME` loses the login (below) |
| Skills | `$CODEX_HOME/skills/`, `~/.agents/skills/`, `$CODEX_HOME/skills/.system/`, every installed plugin's `skills/` | user / plugin | listed as skill roots in the developer message: 8 roots here, 5 of them plugin caches **(measured)** | `[[skills.config]]` `{name\|path, enabled=false}` is read **only from the user and session-flags layers — a project layer's entries are ignored** (`skill_config_rules_from_stack`, **docs**) | `-c 'skills.config=[{name="caveman",enabled=false}]'` removed the skill from the list **(measured)**; the same at the same layer via `CODEX_CONFIG` `{"skills":{"config":[…]}}` is **unverified** but is the layer the source reads. `skills.bundled.enabled = false` drops the vendor's `.system` skills **(docs)** |
| Skills | `<dir>/.codex/skills/` for each project config layer; `<dir>/.agents/skills/` from project root down to `cwd` | project / repo | both appeared as roots for an **unknown-trust** folder **(measured)** — skills are not behind the trust gate | a repository can therefore put a skill in front of the agent by committing it; a project file cannot remove a user skill | as above |
| Approvals, sandbox | `approval_policy`, `sandbox_mode`, `sandbox_workspace_write.*`, `default_permissions`, `permissions` | any layer | user config **(docs)** | a project file may set them **(docs)** — but under the bridge **the mode wins over every one of them** (`INITIAL_AGENT_MODE`, research 02) | `INITIAL_AGENT_MODE=read-only` on the spawn, unchanged |
| Exec policy, hooks | `.codex/rules/*.rules`, `hooks` / `.codex/hooks.json` | project | with the config layer; **disabled when untrusted** **(docs)** — so live under the bridge | `allow_managed_hooks_only` is `requirements.toml`-only **(docs)** | `features.hooks` is a feature flag, but a partial `features` map replaced the defaults and cost a session its MCP tooling (adapter comment, `codex-agent-runtime.ts`) — **do not reach for it** |
| Tools, web, apps | `web_search` (`disabled\|cached\|indexed\|live`), `tools.view_image`, `apps.<id>.enabled`, `apps._default.enabled`, `features.shell_tool`, `features.multi_agent` | any layer | config reference **(docs)** | yes, by deep merge **(docs)** | `CODEX_CONFIG` for the scalars; `features.*` carries the replacement hazard above |
| Admin ceiling | `requirements.toml` (`$CODEX_HOME/requirements.toml`, `/etc/codex/`, MDM): `mcp_servers`, `allowed_sandbox_modes`, `allowed_approval_policies`, `plugins`, `rules`, `features`, `models`… | machine | none on this machine **(measured)** | constrains every lower layer **(docs)** | not per agent without a per-agent `CODEX_HOME`, which loses the login |
| Config dir, login | `CODEX_HOME` (must exist and be a directory; default `~/.codex`); `-p/--profile <name>` layers `$CODEX_HOME/<name>.config.toml` | machine | `find_codex_home` **(docs)** | — | **The login is `$CODEX_HOME/auth.json`** (`cli_auth_credentials_store = "file"`, the default) or a keyring entry **keyed on a hash of the `CODEX_HOME` path** (`cli|<sha256[:16]>`) **(docs)** — so a per-agent `CODEX_HOME` is signed out either way: `session/new` under an empty one failed with *Authentication required* and Codex created `goals_1.sqlite`, `logs_2.sqlite`, `installation_id` and `.tmp/` there **(measured)**. `codex exec --ignore-user-config` skips `config.toml` but keeps auth; **`app-server` has no such flag** **(measured)**. The bridge passes the whole environment through to `codex app-server` **(bridge)**, and `~/.codex/config.toml` sets no `cli_auth_credentials_store` here **(measured)** |
| Working directories | ACP `session/new.additionalDirectories` / `_meta.additionalRoots` | session | becomes `sandbox_workspace_write` roots **and** a trusted project each **(bridge)** | — | whether their `AGENTS.md` and `.codex/` layers load is **unverified** |
| Resume | `session/load` | session | the bridge rebuilds the same `config` (trust, `CODEX_CONFIG`, `mcpServers`) for `thread/resume` **(bridge)** | — | a deny in `CODEX_CONFIG` travels on resume; `developer_instructions` does **not** (stored on the session, research 01 / issue 06) |

## The four questions

**1. What is read from the working directory and its ancestors.** Three walks, and they do not
agree with each other. *Config* (`.codex/config.toml`, and with it `.codex/rules/` and hooks):
`cwd`, each ancestor up to the project root, and the git root — but each directory is
trust-checked by its own exact path, and the bridge trusts only `cwd`, so in practice **the
workspace root's `.codex/` and nothing above it** **(measured)**. *Instructions* (`AGENTS.md`):
project root down to `cwd`, never past the root, no trust gate, 32 KiB total **(docs; measured
for the gate)**. *Skills*: `<layer>/.codex/skills/` and `.agents/skills/` from the root down, no
trust gate, beside the operator's `~/.codex/skills`, `~/.agents/skills` and every plugin's
**(measured)**. For a **plain** anchor with no `.git`, every walk collapses to `cwd` alone
**(docs)**, which is the generalist's folder exactly.

**2. Can a project file deny, and can `CODEX_CONFIG` carry the whole of an Agent's access.**
Yes to both for **MCP servers**: `[mcp_servers.<name>] enabled = false` in the workspace's
`.codex/config.toml` stopped the operator's server, and `CODEX_CONFIG={"mcp_servers.<name>.enabled":false}`
did the same with no file **(measured)**; `enabled_tools` / `disabled_tools` narrow a server to
named tools **(docs)**. For **skills**, only the user and session-flags layers are consulted, so
the project file cannot deny a user skill and `CODEX_CONFIG` can (`skills.config`; measured
through `-c`, the same layer). For **instructions**, nothing denies: AGENTS.md has no exclusion
key and no trust gate. *Remove this operator server* is therefore one line of `CODEX_CONFIG` per
server, per agent, and it survives a resume.

**3. `CODEX_HOME` and the login.** `CODEX_HOME` relocates *everything* — config, `auth.json`,
skills, sessions, sqlite state — and the login is either `$CODEX_HOME/auth.json` or a keyring
entry keyed on that path's hash, so a per-agent dir is a signed-out agent **(docs; measured)**.
There is no Cursor-style split. The per-agent knobs that keep the login are `CODEX_CONFIG` (the
runtime layer, above every file) and the workspace's own `.codex/config.toml` (the project layer,
above the user's). `-p <profile>` is a third, but the file lives in `~/.codex`, which blobot does
not write.

**4. `session/new.mcpServers`.** Honoured: each becomes `mcp_servers.<name>` in the runtime
layer, so it coexists with every file's servers **(measured)**. Two rules on top: the bridge
**drops a client server whose name any config layer already defines** (`DISABLE_MCP_CONFIG_FILTERING`
turns that off), and a runtime `enabled=false` on the same name would be the client's own doing.
The loopback rides that door today and would be silently lost to an operator server called
`blobot`; the adapter should either assert the name is free (`config/read` is what the bridge
uses) or set the variable.

## The sentences ticket 14 needs

- On Codex, **(a) and (b) are both real and they are the same layer stack**: a file in the
  anchor is the project layer, `CODEX_CONFIG` is the runtime layer above it, and both deny an
  operator MCP server by name with `enabled = false`. Nothing here sinks (a); what limits it is
  that a project file cannot deny a *skill* — only the runtime layer can — and cannot deny an
  `AGENTS.md` at all.
- The committable-file problem has a **second direction** on this runtime: the bridge trusts the
  AgentWorkspace without asking, so a *repository's* `.codex/config.toml` configures the agent —
  `model_instructions_file`, `hooks`, `rules`, extra MCP servers, a `developer_instructions` of
  its own (outranked by the persona, but present) — with none of the trust prompt the TUI would
  show. Anything blobot expresses through `CODEX_CONFIG` outranks that; anything it expresses
  through a file in the worktree is the same layer as the repository's and merges with it.
- **`CODEX_CONFIG` is the honest channel for a per-agent allowlist**: it is per process, dies
  with it, is re-sent on resume, writes nothing into a checkout, and takes dotted keys, so an
  Agent's access is a JSON object blobot composes — `mcp_servers.<name>.enabled`,
  `mcp_servers.<name>.enabled_tools`, `skills.config`, `web_search`, `apps.<id>.enabled`. The
  one key family to leave alone is `features`.
- *Nothing picked* means today's inheritance: every server, skill and plugin the operator
  configured, plus whatever the repository committed. Detection can show the operator's list
  for free (`codex mcp list --json`, redacting `http_headers`).

## What was not verified

- `CODEX_CONFIG` carrying `skills.config` (an array) — measured only through `-c`, which lands in
  the same session-flags layer the source reads; `json_to_toml` on an array is assumed.
- Whether `additionalDirectories` contribute `AGENTS.md` or `.codex/` layers.
- The keyring store on macOS specifically (`cli_auth_credentials_store = "keyring"` / `"auto"`);
  the key derivation is read from source, not exercised.
- Anything on a Codex newer than 0.151.0 or a bridge newer than 1.7.0; the bridge's trust
  injection and name filtering are its behaviour, not the protocol's, and would want a canary.

## Sources

- Config reference: https://developers.openai.com/codex/config-reference (redirects to
  https://learn.chatgpt.com/docs/config-file/config-reference) — layers, `projects.<path>.trust_level`,
  `mcp_servers.*` keys, project-layer restricted keys, `skills.*`, `web_search`, `apps.*`,
  `features.*`, `shell_environment_policy.*`.
- `openai/codex` source via context7 (`/openai/codex`): `codex-rs/config/src/loader/mod.rs`
  (layer order, `decision_for_dir`, `discover_project_layers`, `disabled_reason_for_decision`),
  `codex-rs/config/src/config_layer_source.rs` (precedence numbers), `codex-rs/config/src/merge.rs`
  (`merge_toml_values`), `codex-rs/config/src/mcp_types.rs` (`enabled`), `codex-rs/core-skills/src/config_rules.rs`
  (`skill_config_rules_from_stack`), `codex-rs/ext/skills/src/host_roots.rs` (skill roots),
  `codex-rs/core/src/agents_md.rs` and `agents_md_manager.rs` (AGENTS.md walk, 32 KiB),
  `codex-rs/config/src/config_toml.rs` (`ConfigToml`, `ProjectConfig`, `DEFAULT_PROJECT_DOC_MAX_BYTES`),
  `codex-rs/config/src/config_requirements.rs` (`requirements.toml`), `codex-rs/login/src/auth/storage.rs`
  and `codex-rs/utils/home-dir/src/lib.rs` (`auth.json`, keyring key, `find_codex_home`),
  `codex-rs/git-utils/src/info.rs` (`resolve_root_git_project_for_trust`),
  `codex-rs/app-server/src/config_manager.rs` and `app-server-protocol/.../thread.rs`
  (`ThreadStartParams.config`), `codex-rs/exec/src/cli.rs` (`--ignore-user-config`).
- The pinned bridge, `packages/core/node_modules/@agentclientprotocol/codex-acp/dist/index.js`
  1.7.0: `startAcpServer` (`CODEX_CONFIG`), `createSessionConfig` (trust injection, `mcp_servers`
  spread), `getConfigMcpServerNames` and `shouldDeduplicateMcpConflicts`
  (`DISABLE_MCP_CONFIG_FILTERING`), `newSession` / `resumeSession`, `startCodexConnection`
  (environment pass-through), and its README (runtime options).
- This machine: `codex --help`, `codex mcp --help`, `codex mcp add --help`, `codex login --help`,
  `codex exec --help`, `codex app-server --help`, `codex debug prompt-input --help`,
  `codex features list`, `codex doctor --json`; `~/.codex/config.toml` section headers
  (10 `mcp_servers`, 25 `projects` entries, no `cli_auth_credentials_store`, no
  `requirements.toml`, no `~/.codex/AGENTS.md`).
- Probe (throwaway, under the session scratchpad, not kept): a git-initialised folder with
  `.codex/config.toml` defining `probe_project` (a `/bin/sh -c 'touch <marker>; exec cat'`
  stdio server, `startup_timeout_sec = 2`) and optionally `[mcp_servers.aws_mcp] enabled = false`;
  `AGENTS.md`, `.codex/skills/probe-skill`, `.agents/skills/agents-skill`, a `sub/` directory, an
  empty `fakehome/`. Driver: spawn `node dist/index.js` with `CODEX_PATH`, `NO_BROWSER=1`,
  `INITIAL_AGENT_MODE=read-only`; `initialize`; `session/new {cwd, mcpServers}`; wait 7–8 s; list
  marker files and the bridge's descendant processes; kill the group. Runs: plain; dotted deny;
  nested deny; client server colliding by name; client server with a new name; empty
  `CODEX_HOME`; project deny of `aws_mcp`; no deny; `CODEX_CONFIG` deny of `aws_mcp`;
  `cwd = sub/`. Results are the **(measured)** cells above.
- `.scratch/codex-runtime/research/01-codex-persona.md` and `02-trust-and-the-sandbox.md`
  (persona on the session, mode over config, `features` replacement), and
  `packages/core/src/adapters/codex/codex-agent-runtime.ts` (what blobot sends today).
