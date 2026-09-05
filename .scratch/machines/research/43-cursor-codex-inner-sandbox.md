# Cursor and Codex: inner sandbox versus approval posture

Date: 2026-09-05. Research for the accepted policy: preserve native protection
locally; disable only separable optional inner sandboxes in a box; required
protection that cannot operate must prevent Agent start. This note changes no
production behavior, admission guard or tracker status.

## Result and important limitation

Cursor `2026.09.02-c22c1a3` accepts `sandbox.mode: "disabled"` independently of
`approvalMode: "allowlist"` and permission arrays. Its CLI configuration resolver
gives a CLI sandbox override precedence over global config. However, **the pinned
ACP route does not wire the same sandbox-aware permissions provider as the chat
route**. The ACP provider tested below returns `insecure_none` with both enabled
and disabled config. A successful ACP handshake with `sandbox.mode: "enabled"`
does not establish a native fence or fail-closed startup.

The Codex ACP bridge `1.7.0` still combines approval policy, reviewer and sandbox
in fixed modes. The existing `INITIAL_AGENT_MODE=read-only` must remain until
there is an independently verified bridge change. Switching to full access would
also switch approvals to `never`.

## Sources and executable evidence

Primary Cursor source is the JavaScript distributed inside its
[pinned official arm64 archive](https://downloads.cursor.com/lab/2026.09.02-c22c1a3/linux/arm64/agent-cli-package.tar.gz),
SHA-256 `fb7bc635be6172ebcf68f907fd9217e3614da51916455c6d7fdb66690997884c`.
The archive was rehashed before reading modules; the vendor source is minified but
retains webpack module names. No source was fetched from an unrelated release.

| Archive member | SHA-256 | Relevant modules |
| --- | --- | --- |
| `dist-package/index.js` | `ce5bab7bc0751c3c20bf5bda9253d515452684d7ba2f0cea5701f59eaafff05a` | `cursor-config/dist/schema.js`, `file-based-config-provider.js`, `shell-exec/dist/index.js`, root CLI options |
| `dist-package/8499.index.js` | `a1a8d95bad2391a7000568fd917c1db118aac67b27468cb98260205fc2b52d17` | `shared/autorun-mode.ts`, config permissions adapter and merged provider |
| `dist-package/189.index.js` | `c1c6b57b0fc6e2fbec783d2f67fc93ca738fc27e26c8015e0708ce4f165f265d` | ACP run, shared services, session resources and initialize |
| `dist-package/9185.index.js` | `349cc838cb7cf45e7bf56204ced0d6fc663d75c4dd58b404ad9ecd97afa1e094` | chat/shared resource construction |
| `dist-package/1931.index.js` | `ed98a7fbb0c00911e255c81a9d93e8e69cf4f336978628bb5a8b0b030bdaf341` | chat startup, sandbox settings UI, sandbox-unavailable warning predicate |

The [fixture](43-cursor-posture-fixture.mjs) and
[results](43-cursor-posture-results.json) use the existing ARM image manifest from
[research32](32-runtime-image-builds.json). They verify its full image ID and
version, then run one disposable Docker container as UID1000 with `--network=none`,
no host mounts, no pulls, a read-only image, temporary home/tmp, no capabilities,
1 CPU and 1 GiB RAM. Child environments include only temporary HOME/config, PATH
and TERM. No login, credentials, session/new, prompt, model request or tool call
was supplied. The exact owned container was confirmed absent afterward.

The fixture contains two distinct tests:

1. Execute the exact shipped resolver and permission adapter modules with a
   synthetic config. The only resolver dependencies are a supplied platform
   support boolean and a debug no-op; attempts to query team settings fail the
   test. This measures the vendor's configuration logic, not an OS fence.
2. Run the actual CLI for version/help and ACP initialize with separate temporary
   configs. Read the persisted config afterward and verify approval, permissions
   and sandbox fields remain unchanged. ACP children are terminated by their
   owned process groups after the response; exit143 is intentional cleanup, not
   evidence of natural EOF shutdown.

Reproduce with the existing local image, coordinating with other Docker work:

```sh
BLOBOT_CURSOR_POSTURE_PROBE=1 node .scratch/machines/research/43-cursor-posture-fixture.mjs \
  --docker-config /private/tmp/blobot-machine-images.040Rvi/docker-config \
  --docker-host unix:///Users/guillermo/.docker/run/docker.sock
```

## Cursor configuration and precedence

Official docs expose `approvalMode`, `sandbox.mode` and `sandbox.networkAccess`
as separate global fields. `CURSOR_CONFIG_DIR` selects the global config
directory. Project `.cursor/cli.json` supports permissions only.
[Configuration reference](https://cursor.com/docs/cli/reference/configuration).

The exact schema accepts only `disabled` and `enabled` for sandbox mode. The
native resolver in `shared/autorun-mode.ts` computes:

```
CLI sandbox override ?? config.sandbox.mode ?? supplied default
```

All six combinations in the fixture matched this ordering and preserved
`approvalMode: allowlist` and the input permission arrays. The actual CLI help
also describes `--sandbox enabled|disabled` as overriding config. This establishes
the generic configuration ordering; it does not establish that every command,
especially ACP, consumes the resulting sandbox policy.

Actual ACP startup results:

| Configuration | Initialize | Persisted approval/permissions/sandbox |
| --- | --- | --- |
| Global disabled + allowlist | Protocol1 | Unchanged |
| Global enabled + allowlist | Protocol1 | Unchanged |
| Global disabled + valid project permission arrays | Protocol1 | Global posture unchanged |
| Global disabled + project `sandbox.mode=enabled` | Process exits1 before initialize | Global posture unchanged; project field rejected |

The invalid project produces a schema error for the unrecognized `sandbox` key.
The project schema is a strict permissions-only object; `approvalMode` is not in
it either. Valid project permissions are recursively merged over global fields;
arrays replace their corresponding global arrays in the file-based provider.
Thus project config cannot override sandbox mode, but **it can change permission
arrays**. This is a pre-existing configuration authority, not a consequence of
disabling the inner sandbox.

The permissions adapter maps global `unrestricted` to unrestricted and all other
approval modes to allowlist. Its returned allow/deny arrays do not depend on the
sandbox field. Official permissions documentation separately describes deny
rules winning over allow rules, but this investigation performed no model-driven
approval requests and makes no new claim about identical prompting behavior for
all operations.
[Permission reference](https://cursor.com/docs/cli/reference/permissions).

## Cursor ACP does not prove the advertised inner fence

In the pinned bundle, `acp/run.ts` defers `initSharedServices()` until an
authenticated session needs it. `cursor-acp-agent.ts::initialize` returns
capabilities without creating those services. Our signed-out initialize probes
therefore intentionally stop before actual execution resources.

The static execution path is materially different from chat:

- `acp/shared-services.ts` constructs `ConfigPermissionsAdapter(configProvider)`,
  optionally adds `PermissionsFileProvider`, and wraps them in
  `MergedPermissionsProvider`.
- `cursor-config/dist/permissions-adapter.js` returns config allow/deny and
  approval mode with `userConfiguredPolicy: { type: "insecure_none" }`. It does not
  read `sandbox.mode`. The fixture executes this actual adapter through the actual
  merged provider: both enabled and disabled return that same policy.
- `acp/session-resources.ts` passes that permissions provider into its
  `PermissionsService`, builds a default terminal executor, and builds resource
  providers without the chat route's `_defaultSandboxPolicy`, `getSandboxEnabled`
  or `getSandboxSupported` options. No sandbox override is consumed there.
- The optional permissions-file provider also supplies `insecure_none`; it does
  not restore a native policy by itself.

This is strong source evidence that configuring the inner sandbox is insufficient
for this ACP route. It is **not** a live authenticated escape test, and does not
establish the behavior of every provider-supplied requested policy. Do not label
the existing Cursor ACP adapter as having verified native containment solely
because it writes enabled config or can reach a mailbox loopback.

## What happens when native support is absent

`shell-exec/dist/index.js::isSandboxSupported` calls the support checker. It first
checks that the configured helper exists, then runs a policy preflight against
`/bin/true` with a 15-second timeout. Missing binary, kernel/preflight failure or
timeout cache a false verdict plus a reason. The async priming variant also
records false for failure/timeouts and can probe from a workspace directory.

The generic approval/sandbox resolver treats false support as
`sandboxAvailable: false` while preserving allowlist. This was measured with a
synthetic false platform verdict. In `shared/resources.ts`, the chat resource
provider converts unavailable support or team-disabled sandboxing into
`insecure_none`; this layer alone does not throw.

There are additional guards elsewhere: chat's print/headless startup checks
enabled-but-unavailable and exits with an error. Interactive chat has a warning
path. These guards are in the chat command module, not the ACP command module.
At the final shell primitive, `spawnInSandbox` **does throw** if given a real
workspace sandbox policy while native support is absent; it spawns directly only
when the supplied policy is already `insecure_none`.

Therefore, distinguish two situations: a required sandbox policy failing to
execute is rejected by the primitive; a caller resolving that policy to
`insecure_none` earlier can avoid that rejection. A binary presence/preflight check
alone cannot certify that ACP actually supplies a sandbox policy. The accepted
fail-closed Agent-start requirement still needs a verified admission mechanism;
these config-only probes are not one. No production gate was opened here.

## Codex bridge1.7.0 still couples the axes

The exact bridge source is commit
[`2b48e9822330fc09f3a94a81563e5c4bb779601a`](https://github.com/agentclientprotocol/codex-acp/tree/2b48e9822330fc09f3a94a81563e5c4bb779601a)
from tag1.7.0. Its three `AgentMode` presets are:

| Bridge mode | Approval policy | Reviewer | Sandbox policy |
| --- | --- | --- | --- |
| `read-only` | `on-request` | user | workspaceWrite, network false |
| `agent` | `on-request` | auto_review | workspaceWrite, network false |
| `agent-full-access` | `never` | user | dangerFullAccess |

`INITIAL_AGENT_MODE` selects one of this closed list. There is no preset combining
the current user approval posture with dangerFullAccess.
[Exact mode definitions](https://github.com/agentclientprotocol/codex-acp/blob/2b48e9822330fc09f3a94a81563e5c4bb779601a/src/AgentMode.ts).

The critical enforcement point is `CodexAcpClient.sendPrompt`: every `runTurn`
receives `approvalPolicy`, `approvalsReviewer` and `sandboxPolicy` explicitly from
the selected `AgentMode`. Additional directories only extend writable roots of a
workspaceWrite policy. Thread creation can pass `CODEX_CONFIG`, but it does not
remove these later explicit turn fields. This is why setting only a raw config
sandbox mode is not an independent lever through the current bridge.
[Turn overrides](https://github.com/agentclientprotocol/codex-acp/blob/2b48e9822330fc09f3a94a81563e5c4bb779601a/src/CodexAcpClient.ts#L847),
[thread start](https://github.com/agentclientprotocol/codex-acp/blob/2b48e9822330fc09f3a94a81563e5c4bb779601a/src/CodexAcpClient.ts#L526).

This source inspection agrees with the earlier local evidence in
[Codex posture ticket02](../../codex-runtime/issues/02-trust-approval-and-a-sandbox.md).
No new Codex prompt or model turn was run. Retain the current read-only bridge
posture in both execution locations until a separately reviewed bridge mechanism
actually decouples the two axes.
