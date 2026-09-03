# What fx loads from a folder, and what it can be denied

Ticket 12 of `.scratch/agents-and-chats/`, answered 2026-09-03 against **fx 0.0.7**
(`~/.local/bin/fx`, build `cef08aa0f178`), the same binary `.scratch/fx-runtime/` measured. Every
row below says how it was verified. **Zero tokens were spent**: `--help` strings, `fx status
--json`, `fx permissions --json`, `fx mcp list`, `fx doctor --json`, `strings` over the binary,
the vendor's docs at `fx.sh/docs`, and one ACP session (`initialize` + `session/new`, never
`session/prompt`) under a throwaway `HOME` with a deliberately invalid `AI_GATEWAY_API_KEY`, which
passes the handshake and would fail only at a model call — the trick research 01 found. Nothing
was written to the real `~/.fx`; every write below went to `HOME=<scratch>/fakehome`.

Three labels are used: **measured** (run on this machine), **docs** (`fx.sh/docs`, quoted), and
**binary string** (present in `strings fx`, behaviour not exercised). fx's docs are thin, and where
a `--help` string is the only source the row says so.

## The table

| Channel | File or parameter | Scope | Can a project-level file deny it? | How verified |
| --- | --- | --- | --- | --- |
| Instructions | `<workspace>/AGENTS.md` | the cwd of `fx acp`, exactly; **not** an ancestor, not the git root | Disable-all only: `"context": false` in `.fx.json` or user settings turns off *"project instructions and related workspace context"*. No per-file deny. | Ancestor **not read**: measured with a turn in `fx-runtime/01` (2026-08-31). `context:false` is **docs only**, not measured (needs a turn). |
| Instructions, global | `~/.fx/AGENTS.md` | the user, every workspace | No. Not a project file's to deny. | Docs. |
| Instructions, extra dirs | `--add-dir`, `fx workspace add`, `additional_directories` in the workspace profile | tool access only | n/a — *"These directories do not contribute AGENTS.md or other project instructions"* | Binary string, quoted verbatim; docs agree. |
| Project runtime settings | `<workspace>/.fx.json` | the cwd, exactly; not an ancestor | Three keys only: `max_agent_steps`, `max_tool_result_bytes`, `context`. `permission_mode`, `model`, `context_limits` are refused aloud (`ignored_project_user_only_setting; key=…`); `permission`, `mcp`, `skills` are ignored **silently**. | Measured: `agent_step_limit` went 0 → 3 from the file; the three refusals printed on stderr and in `fx doctor`; the silent keys produced no diagnostic. From `sub/deeper/`, the parent's `.fx.json` was not loaded, with or without a `.git` at the parent. |
| Permission mode | `FX_PERMISSION_MODE` (process) > `permission_mode` in the workspace entry of `~/.fx/settings.json` > global `permission_mode` > default `auto` | process / user-per-workspace / user | **No.** `permission_mode` in `.fx.json` is refused by name. | Measured: workspace entry `ask` reported by `fx permissions`; `FX_PERMISSION_MODE=yolo` overrode it. |
| Permission rules | `permission` map in `~/.fx/settings.json`, global or under `workspaces["<canonical path>"]`; shape `{"bash": {"git push *": "deny"}, "edit": {"*": "deny"}, "*": "ask"}` | user / user-per-workspace | **No project file can carry a rule.** Docs: *"Project `.fx.json` files cannot define"* rules. A **workspace entry can deny** what the global map allows — and as displayed by `fx permissions`, a workspace `permission` map **replaces** the global one rather than merging with it. | Measured: global `allow bash -> git *` + workspace `deny bash -> git push *` listed **only the deny**; an empty workspace entry listed the three global rules. Whether *evaluation* also drops the global rules is not measured (needs a turn); the docs say "last matching rule wins, and workspace rules take precedence". |
| Sensitive tools | built-in list: `write_file`, `edit_file`, `delete_file`, `rename_file`, `copy_file`, `create_folder`, `terminal`, `open_file`, `install_skill`, `vision`; any path outside the workspace | fixed | n/a | Docs. |
| Session grants | *"Yes, and don't ask again"* | one session; never saved, not restored on resume | n/a | Docs; `fx permissions --json` reports `grant_scope: "session"`, `runtime_grants_available: false`. |
| MCP, user profile | `~/.fx/mcp.json` (`mcp` map; `mcpServers` accepted as alias on read) | user, every workspace, **native and `fx ask` only** | Per entry `enabled: false` in the same file. **ACP never loads this file at all.** | Measured over ACP: the profile server was never contacted during `session/new`; `fx mcp list` sees it (`source=profile`). Docs: *"ACP never inherits servers from `~/.fx/mcp.json`"*. |
| MCP, project | `<workspace>/.mcp.json`, top-level `mcpServers` only; cwd exactly, not an ancestor; `${VAR}` / `${VAR:-default}` expanded here only | the cwd | Cannot *add* anything on its own: every entry starts **`admission: pending`** and is never started, contacted or env-read until a person approves it. Approval and rejection live in **`~/.fx/settings.json`**, `workspaces[path].enabledMcpjsonServers` / `disabledMcpjsonServers` / `enableAllProjectMcpServers`, never in `.mcp.json`. Project entries are always optional even with `required: true`. A project file cannot deny a profile server; a same-name profile entry wins natively. | Measured: `fx mcp trust approve|reject|approve-all|reset` wrote exactly those keys under the canonical path; over ACP the **approved** entry was contacted (`server/discover` → `initialize` → `tools/list`) and the **pending** one was not. `.fx/mcp.json` and `.cursor/mcp.json` in the workspace are not read. |
| MCP, ACP client | `session/new` `mcpServers[]` (`http` / `sse` / `stdio`, per-server `headers[]`) | one session | Wins a same-name project entry. | Measured, again: the loopback was contacted with `Authorization: Bearer probe-token-1` on every request. `server/discover` is fx's *first MCP message to a server*, not a config source — the classic handshake follows when the server errors on it (`fx-runtime/05`). |
| MCP tool calls | same permission policy as built-in tools, re-checked before transport | — | via rules, above | Docs. `fx-runtime/05` measured that `mcp_blobot_message_agent` prompts under `ask`. |
| Skills, workspace | `skills/`, `.fx/skills/`, `.agents/skills/`, `.claude/skills/`, `.codex/skills/`, `.opencode/skills/`, `.claw/skills/` — docs say *"checked upward"*, stopping before `$HOME` | primary workspace (and, per docs, its ancestors) | **No deny channel exists.** Not in docs, not in `.fx.json`, not in the settings schema, not in the binary's strings. The only gate is `FX_SKILL_SYMLINK_AUTHORITIES` (colon-separated roots): a **symlinked** skill directory outside an authorised root is skipped with a warning. | Binary strings list the roots verbatim (`workspace .claude/skills` etc.). "Checked upward" is **docs only**; not measured (a listing needs the interactive `/skills`). |
| Skills, global | `~/.fx/skills/` (managed installs), `~/.agents/skills/`, `~/.claude/skills/`, `~/.codex/skills/`, `~/.config/opencode/skills/`, `~/.claw/skills/` | user | none | Binary strings; `fx-runtime/research/01` saw the `~/.claude/skills` warning in a real turn. |
| Memories | `~/.fx/memories.json`, 1 MiB cap | user, every workspace | not a project file's | Binary strings only (`memory store …`); feature not in docs, not measured. |
| Subagents | fx's own `subagent` tool; child *"inherits the caller's effective permission mode and cannot request broader authority"* | session | no project-level switch documented | Docs. Same shape as Codex's competing vocabulary (`fx-runtime` did not measure whether it fires over ACP). |
| Home relocation | **`HOME`** only. No `FX_HOME`, `FX_CONFIG_DIR`, `FX_PROFILE` or `FX_DATA_DIR` exists; `XDG_CACHE_HOME` is cache only | process | — | Measured: every `FX_*` string enumerated (none relocates); `HOME=<scratch>` moved `settings.json`, `mcp.json`, sessions **and the sign-in** (`auth: "missing"`). |
| Sign-in | `~/.fx/chatgpt-auth.json` (Codex), `~/.fx/grok-auth.json` (Grok), the Vercel session under `~/.fx/`, and the Gateway API key in the **macOS Keychain** (`FX_DISABLE_KEYCHAIN=1` turns that off); `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` override | user | — | Measured: the two auth files are on disk; keychain strings in the binary; docs: *"On macOS, API keys use Keychain"*. |

Other process-level levers, all `FX_*` and all measured to exist as strings: `FX_MODEL`,
`FX_MAX_AGENT_STEPS`, `FX_NO_OPEN_BROWSER`, `FX_AUTO_UPGRADE`, `FX_SOUND`, `FX_RECORD`,
`FX_SKIP_ONBOARDING`, `FX_AUTH_MODE=host-managed` (embedded hosts, from the README). The `fx acp`
flags are `--model <id>` and `--log-file <path>` (`--help`), plus the global `--add-dir` and
`--no-additional-dirs`.

## The sentences ticket 14 needs

1. **The project scope of fx is the process's cwd, exactly.** Not the git root, not an ancestor:
   `AGENTS.md`, `.fx.json`, `.mcp.json` and the skill roots are all read from the directory
   `fx acp` was started in (skills alone are documented as also walking upward, unmeasured). So an
   anchor or a generalist folder *is* fx's project scope with nothing further to arrange, and a
   file one level up is invisible, which `fx-runtime/01` already paid for.

2. **A project-level file on fx can widen almost nothing and deny almost nothing.** `.fx.json`
   carries three numbers-and-a-switch; `.mcp.json` entries are inert until a person approves them
   into `~/.fx/settings.json`; no file can carry a permission rule or a skill deny. The **one
   project-level deny is `"context": false`**, which drops `AGENTS.md` wholesale. Everything that
   restricts an fx agent lives either **on the process** (`FX_PERMISSION_MODE`, the only posture
   channel blobot uses and the one that wins over every file) or **in the user's own
   `~/.fx/settings.json`**, keyed by canonical workspace path, which blobot decided on
   `fx-runtime/03` never to write. That decision stands: the workspace entry *could* express a
   per-agent deny list (`permission.bash["git push *"] = "deny"`), but it is the user's file, it
   would replace their global rules for that path as displayed, and it rots on delete.

3. **Over ACP, the user's global MCP profile is not loaded, and the project's `.mcp.json` is
   loaded only where they have approved it.** So a blobot fx agent's MCP surface is exactly:
   blobot's `session/new` list (the loopback), plus any `.mcp.json` server the user approved for
   that path with `fx mcp trust`. `session/new` `mcpServers` is honoured beside — not instead of —
   the project file; `server/discover` is just how fx says hello to a server. If ticket 14 wants
   *what an Agent can access* to be a **per-agent** MCP list, fx already gives it that shape for
   free: the anchor's `.mcp.json` is the user's, approved by the user, in their own settings.

4. **Skills are the open door.** fx reads seven workspace roots and six home roots including
   `~/.claude/skills`, with no deny of any kind and no per-agent split short of a different
   `HOME` — which would also discard the sign-in, so it is not available to blobot. What ticket
   14 can promise about skills on fx is what ADR-0003 already promises about the palette: blobot
   decides what it *offers*; fx decides what the agent *can invoke*, and that is the operator's
   whole skill collection. (Two mitigating facts: skills load only on invocation, and the
   operator's symlinked skills are skipped unless `FX_SKILL_SYMLINK_AUTHORITIES` names them.)

5. **Trust on fx**, for the trust card: `FX_PERMISSION_MODE` is the posture and the only one;
   the ACP `mode` option now labels itself — `code` carries `permissionMode: "auto"` and `ask`
   carries `"ask"` — confirming `fx-runtime/02`'s reading that `code` is the reviewer-model mode,
   not `yolo`. `yolo` has no ACP door.

## Sources

- `fx --help`, `fx acp --help`, `fx mcp --help`, `fx permissions --help`, `fx workspace --help`,
  `fx ask --help`, `fx sessions --help` — the binary's own strings, fx 0.0.7.
- `fx status --json`, `fx permissions [--json]`, `fx mcp list`, `fx mcp path`, `fx mcp trust …`,
  `fx doctor --json`, run in the scratch folder under `HOME=<scratch>/fakehome` and
  `HOME=<scratch>/fakehome2`.
- `strings ~/.local/bin/fx`, for the `FX_*` list, the skill roots, `enabledMcpjsonServers` /
  `disabledMcpjsonServers` / `enableAllProjectMcpServers`, `ignored_project_user_only_setting`,
  `memories.json`, the keychain strings.
- One ACP session, `initialize` + `session/new`, four local MCP servers logging what fx contacted
  (`<scratch>/acp-harness.mjs`, not checked in).
- `https://fx.sh/docs/configure-fx/configuration` — precedence list; `.fx.json`'s three fields;
  the settings example with `workspaces` / `additional_directories` / `permission`.
- `https://fx.sh/docs/configure-fx/permissions` — rule shape, last-match-wins, *"Project
  `.fx.json` files cannot define"* rules, the sensitive tool list, session grants.
- `https://fx.sh/docs/configure-fx/project-instructions` — the four `AGENTS.md` sources,
  `context: false`, additional dirs contribute no instructions.
- `https://fx.sh/docs/capabilities/skills` — the roots, *"checked upward"*, primary workspace
  only, managed installs in `~/.fx/skills/`.
- `https://fx.sh/docs/capabilities/mcp` — three sources, admission model, *"Trust is saved in
  your private `~/.fx/settings.json` … never in `.mcp.json`"*, env expansion in project entries
  only, project entries always optional.
- `https://fx.sh/docs/using-fx/acp` — *"A client entry wins a same-name project entry"*, *"ACP
  never inherits servers from `~/.fx/mcp.json`"*.
- `https://fx.sh/docs/configure-fx/additional-workspaces`, `https://fx.sh/docs/capabilities/subagents`.
- `https://github.com/vercel-labs/fx` README — `FX_SKILL_SYMLINK_AUTHORITIES`, `FX_AUTH_MODE`,
  the auth file names, Apache-2.0.
- `.scratch/fx-runtime/research/01-acp-surface.md` and issues 01–05 — the ancestor `AGENTS.md`
  turn, `--add-dir`'s string, the `server/discover` fallback, `FX_PERMISSION_MODE` deciding under
  an `ask` session, `/allowlist` refused.
