# Production Claude box launch: signed-out session and mailbox acceptance

Measured 2026-09-06, 00:57:30–00:58:24 UTC, for
[The image: one per runtime](../issues/13-the-image-one-per-runtime.md).

**The current production launcher successfully starts the published Claude arm64
image, creates a signed-out ACP session, reaches the real production MCP listener,
closes cleanly, and repeats after stopping/reopening the same owned Machine.**
This is startup/mailbox-handshake evidence, not provider login, a model turn, peer
delivery, permission enforcement, or acceptance of the other four launchers.

Primary evidence is the [executed fixture](64-production-box-launch-fixture.mts)
and its [final receipt](64-production-box-launch-results.json). The fixture imports
current `src` directly through the installed `tsx`, without rebuilding or editing
production. `sourceHashes` records the eight relevant source files; they still
matched at the end of this research. No tracker changes or commits were made.

## Exact subject and boundary

| Item | Observed subject |
| --- | --- |
| Host | macOS 26.6.2, build 25G83, arm64; host Node 25.6.1 |
| Engine | Client/server `v0.42.0-rc5`, revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, API 0.28.0 |
| Public release | `machines-20260905-1`, Claude arm64, declared CLI 2.1.260, ACP bridge 0.70.0 |
| Image manifest | `sha256:3b4535de48403a040fa7302506592d41d4107bf5134a59bbbd93e03a36b72192` |
| Archive | 693,360,640 bytes; SHA-256 `75881fe4b412dc3cf7daf36071d75e7f1a8c093ecc845c21ec909b43cb6c11ea` |
| Capacity | 2 vCPU, 2 GiB VM; guest reports 2 CPUs and `MemTotal: 2066016 kB`; 8 GiB home and 20 GiB private Docker storage |
| Workspace | UUID temporary Git repository and linked worktree under `/private/tmp`; only the worktree and its separate common `.git` mounted RW |
| Identity | Guest UID/GID 1000, `/home/agent`, `/usr/bin/node`; fixture-only Git identity, global/system host Git config disabled when creating the repository |
| Engine resources | At most one owned VM at a time; no daemon restart, global settings change, login, provider credentials, host SSH relay, real user worktree or operator skills |

The [adapter image definition](../../../packages/core/src/adapters/claude/image.ts)
supplied the actual build, guest Node, module root, executable and environment
allowlist. The image was initially absent; no matching temporary archive was found.
`SbxImageStore.install` downloaded only that public pin and performed its digest,
archive-contract and loaded-reference validation. The existing vendor Claude
template was neither used nor changed. Release/CLI build evidence is separately
recorded in [research34](34-public-runtime-distribution.md); this fixture observes
the bridge version in ACP but does not run a separate CLI `--version` measurement.

The launcher was exercised through `ClaudeAgentRuntime.start()` and `.stop()`,
which invoke the actual [spawnClaudeBridge](../../../packages/core/src/adapters/claude/stdio-bridge.ts),
[npm bridge](../../../packages/core/src/adapters/acp/npm-bridge.ts),
[OwnedSbxMachine](../../../packages/core/src/machines/sbx/owned-machine.ts) and
[sbx transport/bootstrap](../../../packages/core/src/machines/sbx/transport.ts).
The recording wrapper only observes the transport; it never synthesizes an ACP
reply. The mailbox uses the production
[PeerMessageServer](../../../packages/core/src/mcp/peer-message-server.ts), with a
fresh in-memory fixture bearer per round. The tool handler throws if called; it
was never called. The fixture refuses any outbound `session/prompt`.

## What actually passed

| Observation | Fresh Machine | Same Machine after stop/reopen |
| --- | --- | --- |
| Guest detection, runtime id `claude-code` | `needs_sign_in`, “Installed, not signed in” | Same |
| ACP initialize | Protocol 1; bridge 0.70.0; `authMethods: []` | Same |
| `session/new` | Session returned, default mode | New session returned, default mode |
| Production posture/config | `sandbox: {enabled: false}`; setting sources user/project/local; then `session/set_mode` | Same |
| Actual mailbox | `PeerMessageServer.whenReady=true`; authenticated handshake logged; one tool advertised | New listener/port and fresh bearer; authenticated handshake again |
| Runtime lifecycle | `ready` | `ready` |
| Close | `session/close` replied; transport close reason null | Same |
| Owned stop | Engine reports `stopped` | Same |
| Prompts / tools | Zero / zero | Zero / zero |

Both rounds use box id `129bfae9-17d5-4850-a596-d5b072d68c17`. Reopening the Machine
and creating a new ACP session is measured; resuming/loading the old ACP session
is not. The two session ids in the receipt differ deliberately.

The recorded production request contains a guest `node-module` command for
`@agentclientprotocol/claude-agent-acp@0.70.0`, with no `localEntryPath`, and sends
`CLAUDE_CODE_EXECUTABLE=/opt/blobot/bin/claude` plus only the explicit synthetic Git
identity. It contains no host executable, `ELECTRON_RUN_AS_NODE`, host `PATH` or
host configuration patch. Deliberately nonexistent host bridge/executable overrides
and an explicitly supplied nonexistent host Claude executable did not affect the
box launch. A host-only synthetic environment sentinel and bridge override were
absent in the guest; its PATH starts `/opt/blobot/bin`, and `/run/ssh-agent.sock`
and `.claude/.credentials.json` were absent. The synthetic main-checkout marker outside
the mounted worktree was also absent.

Those observations establish this launcher's chosen guest path and the absence of
these explicit host imports; they do not establish the provenance of every file an
engine or CLI creates. After setup and the guest detection probe, the new home
already contained `.claude`, `.claude.json`, `.gitconfig`, `.gitignore_global` and
`lost+found`; reopening also showed `.cache`. Only names were recorded, not their
contents. Therefore this is a fresh owned home, not a claim that the runtime began
with a literally empty directory or that every generated setting was audited.

The fixture's optional `/proc` lookup returned `cliProcesses: []` because it looked
for wrapper argv0 `/opt/blobot/bin/claude`; the
[image installer](../../../images/machines/install.mjs) writes that wrapper to exec
`/opt/blobot/runtime/claude`. This lookup does not prove that no CLI ran and does
not constitute process-level executable-path attestation. The guest launch request,
packaged wrapper source, real session and MCP handshake are the actual evidence.

## Timings and observations that must not be overclaimed

| Operation | Fresh | Reopened |
| --- | ---: | ---: |
| `OwnedSbxMachine.start` | 14,730.39 ms | 4,495.46 ms |
| `ClaudeAgentRuntime.start` on already-started Machine | 598.06 ms | 614.89 ms |
| ACP initialize request → reply | 436.25 ms | 475.35 ms |
| `session/new` request → reply | 152.94 ms | 132.25 ms |
| `session/set_mode` request → reply | 6.52 ms | 5.74 ms |
| Runtime stop/close | 16.68 ms | 16.36 ms |
| Owned Machine stop | 6,872.55 ms | 6,866.67 ms |

The public download, byte/archive verification and load together took 12,122.63 ms
in the accepted run. That is not a pure load/boot timing. These are individual
observations, not a latency distribution or guarantee. The sampled free-disk
minimum was 21.45 GiB; the guard checked each step and cleanup, not a continuous
high-water disk monitor.

Two integration facts deserve explicit treatment:

1. **ACP startup does not prove login.** `authMethods: []` and runtime `ready`
   coexist with the fresh CLI probe's `needs_sign_in` in both rounds. The
   [adapter's `assertAuthenticated`](../../../packages/core/src/adapters/claude/claude-agent-runtime.ts)
   accepts the empty array; its nearby comment claiming that it means the user's
   login covers the bridge is too strong for this measured box. Keep guest CLI
   readiness distinct from ACP/session/mailbox readiness. No login route was tried.
2. The SDK printed `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` for the normal posture's
   allowed Edit/Write/MultiEdit/NotebookEdit and `mcp__blobot` names. The warning says
   those bare names bypass the SDK's `canUseTool` callback. The production request
   and warning are recorded; this run exercised no tool or permission request and
   cannot certify how any specific action is approved. It does not change the
   already accepted box sandbox policy.

## Fixture correction, limits and cleanup

An [earlier receipt](64-production-box-launch-first-results.json) is retained:
the first pass loaded the image and started its Machine, then incorrectly asked
the detector for runtime id `claude` rather than `claude-code`. It returned
“This runtime has no readiness probe,” and the fixture's assertion stopped before
launching the bridge. This was a fixture error, not a production detection or
launcher failure. Its own VM, image and cache were fully removed before the
corrected pass, so two sequential disposable VMs were used in total, never two
simultaneously. The corrected pass consequently needed the same archive again.

The Agent id contains an underscore and passed constructor, journal and mailbox
handling. The pure `sbxNameFor` call produced `blobot-research64.<UUID>` as expected.
`OwnedSbxMachine` creates its real engine box under a separate UUID name, however;
this run does not establish live engine acceptance of the encoded Agent name.

This run does not cover other runtime launchers, Linux/amd64/KVM, a signed-in
provider, inference/usage, a `message_agent` call, permission round trips, long-lived
SSE/reconnect, arbitrary project configuration, host-config injection provenance,
crash cancellation, SDK child cleanup independent of stopping the VM, or migration.
The surrounding desktop placement/onboarding flow was not used.

Both receipts end with no cleanup errors, `sandboxes: []`, the original two vendor
templates unchanged, and the exact temporary root removed (repository, worktree,
journal and downloaded cache). Only the initially absent published Claude reference
was removed. The fixture stopped its in-process MCP servers, and sbx exclusivity
was returned to the parent immediately after the final inventory. No further
engine calls were made for the note.
