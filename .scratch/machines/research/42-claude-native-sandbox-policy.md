# Claude sandbox settings are separable from approvals; initialization is not certified

2026-09-05. Follow-up to [research04](04-what-each-runtime-confines.md),
[research07](07-the-first-box.md), and the accepted boundary decision round.
**The pinned CLI accepts the proposed local settings without enabling sandbox
auto-approval, and `enabled:false` overrides project/local `true` for box. However,
`initialize` plus `get_settings` can succeed after the native sandbox failed to
initialize, including with `failIfUnavailable:true`. No supported session-status
field exposing that failure was found in the inspected SDK/control interface.**
The settings configuration is established; a guarantee that a required protection
has initialized before admitting the session is not established by this interface.

## Pins, fixture and scope

- Claude CLI `2.1.260`, Darwin arm64, binary SHA-256
  `3c269f66801028823e24a63ced9fdd3988cb86cf85fccd9f03f87e463b9d3e3c`.
- Bridge `@agentclientprotocol/claude-agent-acp@0.70.0` and its installed SDK
  `@anthropic-ai/claude-agent-sdk@0.3.232`, SDK `sdk.mjs` SHA-256
  `cae60ea6827d5f9b113c88b911388983fe96e7d565a382bf25904df78ab9d0fc`.
  The SDK package declares bundled Claude version `2.1.232`; this fixture explicitly
  selects the separately installed **2.1.260** executable.
- [Fixture](42-claude-sandbox-fixture.mjs),
  [observations and 16 passing assertions](42-claude-sandbox-results.json).
  Reproduce from the repository with
  `node .scratch/machines/research/42-claude-sandbox-fixture.mjs` on this Mac.

Five SDK argument cases substitute a spawner that records arguments and immediately
throws a deliberate sentinel; it never executes a CLI. One case invokes SDK
`resolveSettings`. Four cases launch the real pinned CLI and send only
`initialize` and `get_settings` control requests. The input iterator never yields
a user message; the fixture rejects any attempted user frame. No Bash tool,
provider turn, login or authentication operation is requested.

The subprocess environment is an allowlist with an obviously synthetic API key,
UUID-owned temporary configuration/project directories and no inherited credential
variables. A per-process Seatbelt profile denies all network operations, Keychain
access and reads of the actual Claude configuration/managed paths. It changes no
global sandbox or engine policy. MCP configuration is empty and strict. This
outer research guard deliberately prevents native sandbox proxy initialization;
it is not a proposed product wrapper. All four CLI processes exit zero without
forced cleanup. The temporary trees and the exact first-run Claude output directory
were removed. No production files, tracker, commits or actual credentials changed.

## The settings object and what it means

The supported SDK route is `_meta.claudeCode.options.sandbox` through bridge
`acp-agent.js`'s spread into `query()` options. The SDK serializes it in the
`--settings` layer. The bridge independently owns `permissionMode` and
`canUseTool`; supplying a sandbox does not select a permission mode. Its default
settings scopes remain `user`, `project`, `local`.
[Installed bridge source](../../../packages/core/node_modules/@agentclientprotocol/claude-agent-acp/dist/acp-agent.js),
[upstream bridge](https://github.com/agentclientprotocol/claude-agent-acp),
[earlier end-to-end route measurement](07-the-first-box.md).

The requested local shape is:

```ts
{
  enabled: true,
  failIfUnavailable: true,
  autoAllowBashIfSandboxed: false,
  allowUnsandboxedCommands: false,
  network: { allowLocalBinding: true }
}
```

For box, `{ enabled: false }` disables this optional inner sandbox in the measured
user-controlled settings cascade. Neither shape requires changing permission mode,
allowed tools, approval callbacks or loaded settings scopes. Managed restrictions
and forced runtime policies have higher/separate authority; the fixture does not
prove that a flag disables an administrator-required sandbox.
[Settings precedence](https://code.claude.com/docs/en/settings#settings-precedence),
[official sandbox example](https://github.com/anthropics/claude-code/blob/main/examples/settings/settings-bash-sandbox.json).

`autoAllowBashIfSandboxed` defaults to true. Setting false removes this particular
automatic-approval path; it does **not** mean every Bash command prompts: existing
allow/ask/deny rules, permission mode, read-only-command handling and callbacks
still decide. The binary's `o2r()` reads this value with a true fallback. Explicit
deny rules and sandboxing are separate from approval frequency.
[Sandbox modes](https://code.claude.com/docs/en/sandboxing#sandbox-modes),
[permission evaluation](https://code.claude.com/docs/en/permissions).

`allowUnsandboxedCommands:false` prevents the model's `dangerouslyDisableSandbox`
retry path. It does not remove `excludedCommands`; those commands remain explicit
exceptions. In this CLI version, commands a human types in `!` shell mode also
have distinct semantics. This setting is not a claim that every process in the
session is confined.
[Unsandboxed retry behavior](https://code.claude.com/docs/en/sandboxing#the-unsandboxed-retry-escape-hatch),
[2.1.260 release changes](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21260).

SDK captures establish three serialization details:

1. `sandbox:{enabled:true}` inserts `failIfUnavailable:true` when absent. Explicit
   false is permitted. The CLI schema itself documents false as its default.
2. `sandbox` replaces the entire `sandbox` member of an inline `options.settings`
   object while retaining unrelated members. It does not merge two sandbox objects
   within the same SDK call.
3. Combining the sandbox option with a **settings file path** throws before spawn.
   File-loaded user/project/local scopes are different from `options.settings` and
   are not removed by this behavior.

These were measured through installed SDK execution and match function `m1` in
`sdk.mjs` and its `Options.sandbox/settings` type documentation. No library source
was modified.

## Actual CLI precedence and arrays

Synthetic user settings disabled the sandbox; project/local settings enabled it.
Project settings also supplied the opposite values for the required local booleans.
The real CLI's `get_settings` returned:

| Case | Observed result |
| --- | --- |
| Flag `enabled:false` | Effective false despite project/local true |
| Explicit local object | All four requested booleans and `allowLocalBinding:true` retained |
| Domain allowlists | User + project + local + flag entries combined |
| Filesystem `allowRead` | All four scopes combined |
| Flag `excludedCommands:[]` | Earlier exclusions remained; duplicate string deduplicated |
| Permission settings | Same raw permission cascade in local and box cases |

The CLI warns that the synthetic workspace is untrusted and ignores its project
`permissions.allow` for actual use, even though `get_settings.effective` includes
that raw array. **Effective settings here are a settings cascade, not a report of
effective authorization.** No trust record was fabricated, no approval callback
ran, and the fixture does not prove a Bash prompt outcome. SDK `resolveSettings`
likewise documents a raw cascade and a separate trust filter.
[Settings lists and trust](https://code.claude.com/docs/en/settings),
[installed bridge settings resolver](../../../packages/core/node_modules/@agentclientprotocol/claude-agent-acp/dist/settings.js).

Preserving project scopes therefore preserves their allowed paths, domains and
excluded commands. An empty higher-tier array does not erase them. The native
local sandbox must not be described as a fixed application-controlled allowlist.
Some keys have additional scope rules; no blanket merge inference is made for
every Claude setting.
[Scope-specific sandbox policy](https://code.claude.com/docs/en/sandboxing#keep-developers-from-widening-the-policy).

## `failIfUnavailable`: dependency failure versus backend initialization

The CLI headless path checks `getSandboxUnavailableReason()` and, when required,
writes an error result and exits 1 before its sandbox initialization step. That
getter checks enabled/platform policy and dependency errors. The pinned dependency
routine `qOt()` checks Linux dependencies and Windows installation; on macOS it
returns empty dependency errors without testing execution of `sandbox-exec`.
This explains why merely denying access/execution of that binary is not a valid
macOS startup-readiness probe. Linux missing-bubblewrap/socat behavior was read in
source but not executed here.
[Documented failure policy](https://code.claude.com/docs/en/sandboxing#enforce-sandboxing-with-managed-settings).

There is a separate measured failure. With the outer fixture denying network
operations, the real CLI debug log records `Failed to initialize sandbox` and
`EPERM` while binding its synthetic `srt-mux-<pid>-0.sock`. Nevertheless:

- `initialize` and `get_settings` both return successfully;
- the required local booleans remain true/false as supplied;
- only two `control_response` frames appear, with no error/result frame;
- ordinary stderr contains the untrusted-project warning, **not** the sandbox
  initialization failure; that failure is visible only in the explicitly requested
  debug log in this fixture;
- the CLI exits zero when the empty input stream closes.

This is direct evidence that `failIfUnavailable:true` plus a successful handshake
does not satisfy a requirement to reject every failed backend initialization at
session admission. The two wrapper-denied variants also handshake successfully;
the optional variant's shared debug file includes the preceding required variant's
line, so the individual PID/time distinguishes their separate failures.
[Recorded observations](42-claude-sandbox-results.json).

The matching embedded implementation explains the distinction: `O4t()` catches
initialization errors, clears its initialization promise, saves `initFailureReason`
and logs debug/telemetry. `S6e()`, called when wrapping a shell command, retries lazy
initialization and throws if it remains unavailable. Required mode retains the
requirement; non-required mode additionally marks sandboxing disabled for the
session. **That later shell behavior was not executed.** No claim is made that a
particular first Bash call succeeded, failed or asked for permission.

No inspected session API exposes `initFailureReason` or positive backend readiness.
`get_settings` returns the raw cascade/sources, applied model-related values and
schema errors. `claude sandbox status` exists, but computes settings/dependency
posture in a separate process, not the active session's initialization failure.
A debug-log string is not a documented stable readiness protocol. The current
bridge therefore has no established normal event/status channel for this admission
condition. This remains a factual implementation gate, not permission to weaken it.

For reproduction of static findings, these byte offsets belong only to the CLI
SHA above: `qOt` 161393665; `Jln` 161493918; `o2r` 161495886;
`_6e` 161496248; `a2r` 161496802; `S6e` 161502488; `O4t` 161505150;
headless sandbox check around 177281143; `get_settings` handler around 177421437.
The source is embedded JavaScript within the native binary; names repeat across
chunks, so use the offsets and surrounding source, not a first name match.

## Mailbox and shared Git state

**The mailbox's in-process MCP connection does not need `allowLocalBinding`.**
Research07 measured its handshake with both false and true. The key matters for
a sandboxed Bash command connecting to a loopback server on macOS: the pin's
Seatbelt builder adds localhost outbound, bind and inbound allowances only when
this option is enabled under network restriction. This permits loopback generally,
not solely the mailbox port. The new fixture verifies serialization/precedence,
not connectivity, and does not repeat research07's paid turns.
[Earlier measured mailbox distinction](07-the-first-box.md),
[sandbox subprocess scope](https://code.claude.com/docs/en/sandboxing).

There is a native shared-Git-directory allowance for conventional linked worktrees.
The official 2.1.149 changelog says the allowance was narrowed to shared `.git`,
with hooks/config denied. The pinned `vre()` builder calls `Jln(cwd)`, adds the
recognized shared directory to its write roots and applies Git metadata denials.
`Jln` recognizes a `.git` file pointing into `<common ending in .git>/worktrees/<id>`
and checks the worktree backpointer. It is not a general proof for arbitrary
relocated Git administration layouts. No application-added `allowWrite` root is
needed to express this conventional native allowance. Its actual Git write behavior
was not exercised in this no-tool-turn fixture.
[Official changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21149),
[Git linked-worktree layout](https://git-scm.com/docs/git-worktree#_details).
