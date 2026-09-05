# Required Claude sandbox failure rejects Bash while the session continues

2026-09-05. Follow-up to [research42](42-claude-native-sandbox-policy.md) and the
author's accepted command-time failure contract. **The real pinned CLI rejected
an approved Bash command after native sandbox initialization failed. It emitted
an error `tool_result`, did not create the marker, and continued the session.**
The same command created the marker with `sandbox.enabled:false` under the same
outer research guard. A separate permission denial also prevented execution.
These are observations from the [fixture](44-claude-bash-failure-fixture.mjs) and
[saved results, including 70 passing assertions](44-claude-bash-failure-results.json).

## Versions and exact policy

- Claude CLI `2.1.260`, Darwin arm64, SHA-256
  `3c269f66801028823e24a63ced9fdd3988cb86cf85fccd9f03f87e463b9d3e3c`.
- Installed `@anthropic-ai/claude-agent-sdk@0.3.232`, resolved through
  `@agentclientprotocol/claude-agent-acp@0.70.0`; SDK entry SHA-256
  `cae60ea6827d5f9b113c88b911388983fe96e7d565a382bf25904df78ab9d0fc`.
  The CLI executable is selected explicitly, rather than using the SDK's bundled
  CLI version. This experiment invokes SDK `query()` directly, not the ACP bridge.
- The fixture imports the actual
  [production helper](../../../packages/core/src/adapters/claude/sandbox.ts) with
  Node's TypeScript stripping and calls `claudeSandboxFor('local')`. Its source
  hash at measurement was
  `a2bc782a37b5615d7ed494e4cdebd9ec865fe7d115c1f977ff85fb5e363e3d5b`.
  The imported value is asserted to be exactly:

```ts
{
  enabled: true,
  failIfUnavailable: true,
  autoAllowBashIfSandboxed: false,
  allowUnsandboxedCommands: false
}
```

There is no `network.allowLocalBinding` in this value. The fixture keeps
`settingSources: ['user', 'project', 'local']`, `permissionMode:'default'`, empty
`allowedTools`, and exposes only Bash. It adds no allow/ask/deny rule to force the
permission callback in the final measurement. Strict, empty MCP configuration and
an empty API-key helper avoid unrelated integrations. All project/configuration
directories are synthetic. Settings inheritance with nonempty project rules is
covered by research42, not remeasured here.

## Local provider and fault injection

A Node HTTP server listens on an ephemeral `127.0.0.1` port. For each case it sends
exactly two deterministic Messages responses: one `tool_use` for Bash, then a final
text response after receiving the tool result. Its SSE event order and
`input_json_delta` encoding follow Anthropic's
[streaming protocol](https://platform.claude.com/docs/en/build-with-claude/streaming).
It does not proxy any request. The CLI's preliminary `HEAD /api/hello` receives a
local rejection; both actual `/v1/messages?beta=true` requests succeed locally.
The server records selected request metadata and tool results, not request headers
or full prompts. Every Messages request uses the literal dummy key
`sk-ant-synthetic-local-fixture-44-not-a-real-key`.

The SDK worker and CLI descendants inherit a per-process Seatbelt profile. It
denies all network operations except outbound connections to the fixture's exact
localhost port. Network binding remains denied, deliberately preventing the
CLI's native sandbox multiplexer from listening on its temporary Unix socket.
Writes are limited to that case's temporary tree and `/dev/null`. Reads of real
Claude configuration, managed Claude configuration, shell startup files, Git
configuration, SSH/AWS directories and Keychains are denied, as is the securityd
Mach service. The subprocess receives an environment allowlist; Claude config and
temporary directories are redirected, and no real credential variables are
inherited. This is a disposable research guard, not a proposed product policy or
a complete claim about every possible credential storage location.

The only requested shell command is `printf fixture44-ok > '<case-root>/project/marker'`.
The callback asserts the tool name and exact command before returning its fixed
synthetic allow/deny decision. These decisions simulate the application's approval
response; they do not represent a user approval in a real session. No login,
external model, paid inference, Docker operation, or global policy change occurs.
Token usage numbers in the fabricated responses are fixture constants.

## Observations

| Case | Permission callback | SDK initialization | Bash result | Marker |
| --- | --- | --- | --- | --- |
| Actual local helper; callback allows | One Bash request | Resolves | Error: required sandbox failed to initialize (`EPERM`, `srt-mux` socket listen) | Absent |
| Sandbox disabled; callback allows | One Bash request | Resolves | Successful Bash result | Contains `fixture44-ok` |
| Actual local helper; callback denies | One Bash request | Resolves | Error containing the fixture's denial message | Absent |

In the first case the regular SDK message stream contains a `user` message with
`tool_result.is_error:true` and the diagnostic beginning
`Sandbox is required but failed to initialize`. The corresponding
`tool_use_result` also carries the error. The next local provider request receives
the same tool error. The debug file shows two failures: initial sandbox setup and
the retry when Bash is used. Thus the observed error is visible at the tool-result
boundary, without reading a debug file. [Raw observation](44-claude-bash-failure-results.json).

The callback-deny case reports the permission refusal before attempting the lazy
Bash retry; its debug file contains only the initial setup failure. Together the
cases show that the actual helper preserves a permission request for this ordinary
write command and that granting permission does not bypass the required sandbox
failure. Existing approved commands, read-only handling, other modes and inherited
rules can decide differently; this is not a claim that every Bash command prompts.
The documented SDK permission order likewise retains other permission decisions
before `canUseTool`.
[SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions),
[sandbox modes](https://code.claude.com/docs/en/sandboxing#sandbox-modes).

All three cases then receive the fabricated final response, emit a global
`result` with `subtype:'success'` and `is_error:false`, and exit zero with empty
ordinary stderr. **A successful session/result or process exit is therefore not
evidence that Bash ran or that its sandbox was ready.** The positive control proves
that the outer write restriction alone did not prevent this command from creating
its marker. It does not establish successful native sandbox operation.

## Relation to the pinned implementation and limits

The installed binary's embedded `S6e()` at byte offset `161502482` retries native
initialization when its initialization promise is absent. If it remains absent
and `_6e()` indicates the sandbox is required, it throws the required-sandbox
error. `_6e()` reads `failIfUnavailable` alongside platform/feature applicability.
The adjacent `o2r()` at byte offset `161495886` reads
`autoAllowBashIfSandboxed`, defaulting to true. These are inspected implementation
details of the hashed executable, not stable SDK APIs. The observed tool failure
matches the branch already identified in research42.
[Pinned executable](/Users/guillermo/.local/share/claude/versions/2.1.260).

This closes the specific gap between source inspection and an actual Bash failure
after successful initialization. It does not certify a healthy macOS backend,
Linux dependency failures, every backend-failure class, subsequent command retries,
resumed sessions, arbitrary commands, or the desktop's display of the error. It
does not execute file tools or MCP to demonstrate their continued availability;
only session continuation is measured here. The existing SDK/bridge wiring and
outside-shell scope evidence remain separate.
The tested executable is explicitly `2.1.260`, the image pin; a different locally
detected version (including `2.1.261`) is not covered by this experiment.

The native settings' documented exceptions still apply. In particular,
`allowUnsandboxedCommands:false` controls the unsandboxed retry escape hatch; it
does not delete inherited `excludedCommands`. There are no such exceptions in
this synthetic project. This measurement must not be generalized to excluded
commands or to confinement of the whole session.
[Documented escape hatch](https://code.claude.com/docs/en/sandboxing#the-unsandboxed-retry-escape-hatch).

## Reproduction and cleanup

From this repository on this Mac with the pinned dependencies installed:

```sh
node .scratch/machines/research/44-claude-bash-failure-fixture.mjs
node .scratch/machines/research/44-claude-bash-failure-fixture.mjs --verify-results
```

The first command creates only its own temporary trees, local servers and guarded
CLI processes; the second checks the saved observations without launching any
provider or CLI. The final run passed 70 result assertions. Each CLI and SDK worker
exited zero without forced cleanup, every local server was closed, and the owning
temporary tree was removed in `finally`. Only this note, fixture and results remain.

An initial setup attempt stopped before launching the worker because Seatbelt
requires `localhost:<port>` rather than `127.0.0.1:<port>` in its profile grammar.
After correcting that syntax, an initial three-case check succeeded with an explicit
Bash ask rule. The final recorded run removed that rule and obtained the same
three outcomes. No additional branches were explored. This research changed no
production file or tracker and created no commit.
