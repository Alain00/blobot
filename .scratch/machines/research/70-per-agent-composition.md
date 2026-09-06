# Per-Agent composition: current wiring and relocation limits

Read-only research, 2026-09-06, working tree based on `1dfe7aff73e6a0035ff690a45c262ccfe65d03ac`.
Production may include concurrent uncommitted integration changes. No runtime, provider,
login, container or VM was executed. This inventories composition, not a containment guarantee.

## Accepted baseline

Ticket24's integration note (lines89–96) supersedes its server-era premises: an Agent in a
box already has a private home and its own CLI login. ADR0003's second amendment
(`docs/adr/0003-what-an-agent-inherits.md:127`) preserves normal inheritance on local;
box user scope means that Agent's home, with only scoped operator skills imported RO.
Project/local configuration comes from the mounted AgentWorkspace. Shared Git metadata,
configuration and hooks are an explicit exception. Do not use the old “cannot be HOME”
sentence to undo the accepted box login model.

## Production composition already implemented

- `apps/desktop/src/main/runtime-for.ts:78` composes Agent identity, cwd, persona, options,
  trust and named HTTP MCP servers before selecting a runtime. Box receives an empty base
  for `agentGitEnvironment`; local receives `process.env` (`:84`). The request has no
  generic config directory or selectable inherited MCP/skills set (`:35`).
- Local spawns preserve native home/environment (`packages/core/src/machines/local-machine.ts:44`,
  `adapters/acp/child-env.ts:15`), with explicit adapter overrides and removal of blobot's
  speech-key variables. This is intentionally not per-Agent authentication isolation.
- Box kit composition is per Agent (`apps/desktop/src/main/machines.ts:144`): image,
  private home, Docker volume, workspace/common Git mounts and image-native skills paths.
  `packages/core/src/machines/sbx/kit.ts:45` supplies `credentials: []`; `:51` prepares home
  permissions and skill links; `:58` mounts the private 8GiB home at `/home/agent`.
- `packages/core/src/workspace/box-mounts.ts:53` supports `operator` or `none` internally;
  desktop uses its `operator` default. `:91` selects exactly the real directory
  `~/.claude/skills`, not the operator's whole `.claude`, `.agents`, config or home.
  A missing or symlinked root is omitted. `sbx/owned-machine.ts:387` mounts this directory RO.
- `sbx/skills.ts:7` links native lookup paths to that mount after home attachment, refuses
  conflicting existing data and symlinked parents. Images declare these paths at
  `adapters/{claude,codex,cursor,fx,opencode}/image.ts:9`: respectively `.claude/skills`,
  `.agents/skills`, `.cursor/skills`, `.claude/skills`, `.config/opencode/skills`, all below
  `/home/agent`. The shared directory is content, not a copied login/config tree.
- Box launch accepts only adapter-declared environment overrides and rejects HOME/PATH/
  SSH agent overrides (`sbx/transport.ts:9`, `:41`). Adapter-owned JSON patches are applied
  inside the guest; `sbx/bootstrap.ts:29` rejects symlinked directories/files and merges
  only the supplied top-level fields before spawning (`:72`).

Paths below `adapters/` and `sbx/` above are relative to `packages/core/src/`.

| Runtime | Config, MCP and posture actually supplied by blobot | Local versus box |
| --- | --- | --- |
| Claude | `claude/claude-agent-runtime.ts:118` keeps user/project/local scopes; `:386` supplies persona, injected MCP, allowed/disallowed tools and sandbox options. Only injected server names are pre-approved (`:138`). | Native local config/login; private guest user scope in box. `claude/sandbox.ts:20` enables the local native fence and disables the optional inner box fence. Scope selection does not remove individual inherited MCP servers. |
| Codex | `codex/codex-agent-runtime.ts:357` passes cwd/MCP; `codex/stdio-bridge.ts:55` supplies `INITIAL_AGENT_MODE` after other env. `codex/permissions.ts:52` fixes mode to `read-only`; session mode is reasserted at runtime `:364`. | No CODEX_HOME relocation. Local native setup; guest private home in box. Bridge mode couples native restrictions and approval policy; no separate box bypass was added. |
| OpenCode | `opencode/config.ts:178` builds `OPENCODE_CONFIG_CONTENT` with per-Agent persona/primary agent/permission; `opencode/opencode-agent-runtime.ts:311` injects MCP. `opencode/stdio.ts:41` deliberately avoids `--pure`, because removing plugins can remove authentication. | Same adapter overlay/posture on local and box; inherited sources belong to their respective homes/workspaces. The overlay merges; it is not an inheritance exclusion set. |
| fx | `fx/fx-agent-runtime.ts:350` injects MCP; `fx/stdio.ts:49` puts `FX_PERMISSION_MODE=ask` after other env; `fx/permissions.ts:53` uses it at every trust level. Persona is adapter session/prompt composition, not a generated rules file. | Native config paths on local; private guest home in box. No separate config-root override supplied. |
| Cursor | `cursor/config.ts:21` owns a local per-Agent config dir. Runtime `:172` uses `/home/agent/.config/blobot/cursor` in box. `cursor/stdio.ts:70` patches guest `cli-config.json`; `:103` supplies CURSOR_CONFIG_DIR and removes credential env shortcuts. Runtime `:360` passes ACP MCP; persona is prompt-supplied. | `cursor/permissions.ts:178` keeps approvalMode/permissions and changes only optional inner sandbox by placement. The private config dir is not an MCP/rules/skills root. |

Runtime filenames in the table are under `packages/core/src/adapters/`.

## Palette is narrower than native loading

Claude/Codex/Cursor/OpenCode route box discovery through
`packages/core/src/adapters/acp/box-palette.ts:8`. It scans the AgentWorkspace's adapter
directories plus only `location.sharedSkillsPath`, validates realpaths and excludes escaping
links. Each adapter then intersects authored names with runtime advertisement. Existing
`box-palette.test.ts:12` covers mounted skills, loose project skills and escaping links for
all four. Native plugin commands can still be callable when absent from the menu.
fx deliberately offers only its measured built-ins (`fx/palette.ts:5`, `:39`), because its
ACP advertisement does not expose personal skills as slash commands. A shared skill being
loadable does not imply it is offered in fx's palette. These are configuration/advertisement
facts, not proof that a particular authenticated turn loaded every mounted skill.

## Does config relocation preserve login? Exact limits

- **Claude2.1.260:** the inspected macOS binary's embedded file-store code at byte157385537
  builds `.credentials.json` from its configuration-root helper. Current official
  [credential management](https://code.claude.com/docs/en/authentication#credential-management)
  explicitly says `CLAUDE_CONFIG_DIR` moves this file and also keys the macOS Keychain entry.
  Therefore it is not a login-preserving generic root. The binary is
  `/Users/guillermo/.local/share/claude/versions/2.1.260`, SHA256
  `3c269f66801028823e24a63ced9fdd3988cb86cf85fccd9f03f87e463b9d3e3c`.
  Linux implementation was not separately executed; the docs are current, not a versioned
  Linux measurement. This does not claim all external/cloud credential mechanisms relocate.
- **Codex0.151.0:** exact commit `78c290807ce710180111df227df3b7a4fe845452` puts configuration
  under CODEX_HOME ([config source, lines895 and4720](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/core/src/config/mod.rs#L895)).
  [Auth storage](https://github.com/openai/codex/blob/78c290807ce710180111df227df3b7a4fe845452/codex-rs/login/src/auth/storage.rs#L154)
  uses `<codex_home>/auth.json`; direct keyring keys derive from the canonical home (`:238`),
  and the secrets-keyring backend also receives that home (`:344`). Changing CODEX_HOME
  cannot be represented as “only config moved; existing native login survives.”
- **OpenCode1.18.4:** exact commit `49c69c5ed3ccf706b61b3febb43c8aaff7f8325e` separates
  [XDG data/config paths](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/core/src/global.ts#L10).
  [Auth](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/auth/index.ts#L10)
  uses `Global.Path.data/auth.json`, not OPENCODE_CONFIG_DIR. However
  [config loading](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/config/config.ts#L398)
  first merges global, then custom/project/directory config, then CONFIG_CONTENT; the
  [directory list](https://github.com/anomalyco/opencode/blob/49c69c5ed3ccf706b61b3febb43c8aaff7f8325e/packages/opencode/src/config/paths.ts#L23)
  retains global and home `.opencode` plus the override. Auth path separation exists;
  a clean selectable inheritance root does not follow from that environment variable.
- **fx0.0.7:** exact commit `cef08aa0f178537e552a931c7863dc4c1487e4a0`
  [profile_paths.zig](https://github.com/vercel-labs/fx/blob/cef08aa0f178537e552a931c7863dc4c1487e4a0/src/core/shared/profile_paths.zig#L26)
  constructs settings, MCP config/credentials, managed skills and all three auth files under
  the supplied home's `.fx`. Auth readers explicitly read HOME: `oauth_session.zig:577`,
  `chatgpt_session.zig:79`, `grok_session.zig:87`. No FX_HOME/FX_CONFIG/FX_PROFILE/PROFILE_DIR
  seam was found in this source search. That is a bounded negative result, not a proof no
  conceivable per-setting configuration mechanism exists.
- **Cursor2026.09.02-c22c1a3:** exact official
  [Linux arm64 package](https://downloads.cursor.com/lab/2026.09.02-c22c1a3/linux/arm64/agent-cli-package.tar.gz),
  extracted `index.js` SHA256 `ce5bab7bc0751c3c20bf5bda9253d515452684d7ba2f0cea5701f59eaafff05a`:
  byte4078793 chooses CURSOR_CONFIG_DIR before XDG_CONFIG_HOME for config; byte4020151
  `getAuthFilePath` independently chooses platform home/XDG_CONFIG_HOME and never consults
  CURSOR_CONFIG_DIR. Source supports that narrow separation. The earlier live experiment
  (`.scratch/cursor-runtime/issues/01-does-cursor-config-dir-give-an-agent-its-own-cursor.md:58`)
  was version2026.08.25-3e8eec8; its measured MCP/rules/skills behavior is not a new live
  verification of the September pin. Production retains its narrow config/session seam.

## Actionable resolution gaps, without inventing scope

1. Ticket24's “nothing answers composition” and universal prohibition on per-Agent HOME
   are stale for box. Resolve against its integration note and amend ADR0003 explicitly:
   current box composition is private native home + AgentWorkspace + the one RO skills mount
   + adapter-owned persona/MCP/posture; local retains native inheritance.
2. There is **no implemented selectable composition set** or general subtraction of inherited
   MCP/config/plugins. RuntimeRequest and image/kit descriptors encode a fixed composition.
   A requirement to offer independent per-Agent switches would need additional work; the
   accepted box home/skills requirement alone does not establish that requirement.
3. Do not generalize Cursor's override to other runtimes or rehome local Agents silently.
   Three reviewed mechanisms couple native login storage to that root; OpenCode is additive.
   Keep posture in existing adapters rather than implying a directory enforces it.
4. No concrete violation of the accepted private-home/scoped-RO-skills wiring was found in
   this bounded inspection. This is not an authenticated-provider composition certification:
   source paths and synthetic palette tests do not establish every CLI's discovery behavior,
   project/plugin effects, Linux KVM support, or host/box capability equality.
