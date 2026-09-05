# Runtime images: signed-out traffic under sbx deny-all

Date: 2026-09-05. Local arm64 measurements for **The image: one per runtime**.
These observations distinguish an idle image from explicitly starting its runtime.
They do not authorize any host or establish authenticated-session admission.

The engine is client/server `v0.42.0-rc5`, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, API `0.28.0`. The image base is
`docker/sandbox-templates@sha256:5fc81bc7a127e59d81b244a06831ae3212a0310b2e5a0349c54e29249e45e919`.
The local images use the explicit-Docker label arrangement measured in
[research28](28-explicit-docker-volumes-and-quiescence.md).

## Fixture and boundary

The [executable fixture](29-runtime-image-traffic-fixture.mjs) checks the pinned sbx
RC5 client/server revision, running daemon, disabled SSH forwarding and an empty
sandbox inventory before importing one image. Each image comes from a local build
receipt whose immutable manifest ID is checked against Docker Engine. The export
contains exactly that manifest and reference; its byte length and SHA-256 are
recorded, and the imported sbx template ID must match its manifest prefix. Temporary
export tags, templates and boxes are UUID-owned and removed by verified identity.

The root kit supplies no credentials, host mounts, network allows or startup hook.
It declares a privileged guest, an 8 GiB private home and 20 GiB private Docker block
device. The 512 MiB synthetic `/workspace` belongs only to this fixture; it does not
test the product's host worktree. Actual block capacities are read from
`/sys/dev/block/<major>:<minor>/size × 512`, separately from filesystem accounting.
UID1000 executes the CLI, Docker wrapper and ACP process. Docker/Compose are checked
without pulling or starting any inner container.

Before each phase, both global and scoped network rules are verified and an
effective policy check must deny an `.invalid:443` target. `sbx policy log` is
captured after immediate boot, Docker info, Compose version, 15 seconds idle,
CLI `--version` plus 3 seconds, signed-out status plus 10 seconds, and ACP
`initialize` plus 10 seconds. Any allowed-host row aborts the fixture. Logs are
cumulative: a later row does not independently attribute traffic to that phase.

Exactly one JSON-RPC `initialize` request is sent, with protocol version 1 and no
client filesystem or terminal capabilities. No login, credentials, session, prompt,
inference or tool execution is requested. The guest runner owns its child process
group, sends EOF after the observation window, then uses bounded SIGTERM/SIGKILL
if needed. Canceling an sbx client is not used as evidence of guest cleanup.

## Completed observations

The prior [fx report](29-runtime-image-traffic-fx-results.json) and
[Claude report](29-runtime-image-traffic-claude-results.json) are preserved without
rerunning those images. [Codex's completed retry](29-runtime-image-traffic-codex-final-results.json)
and [OpenCode's report](29-runtime-image-traffic-opencode-results.json), followed by
[Cursor's report](29-runtime-image-traffic-cursor-results.json), add the
current core boundary probe as both root and UID1000; all three pass CPU, memory, private
storage and Docker-boundary verification. fx and Claude record the actual mounts,
block capacities and Docker results, but predate that additional core verifier.

| Runtime CLI | ACP result | Observed runtime hosts |
| --- | --- | --- |
| fx `0.0.7` | JSON-RPC error `-32600`: Vercel AI Gateway authentication required | None |
| Claude `2.1.260` | Protocol 1; bridge `claude-agent-acp` `0.70.0` | None |
| Codex `0.151.0` | Protocol 1; bridge `codex-acp` `1.7.0` | First at initialize: `chatgpt.com:443` (2), `api.github.com:443` (1), `github.com:443` (1) |
| OpenCode `1.18.4` | Protocol 1; `OpenCode` `1.18.4` | First at initialize: `registry.npmjs.org:443` (1) |
| Cursor `2026.09.02-c22c1a3` | Protocol 1, no `agentInfo`; required SIGTERM after EOF | First at version: DNS for `api2.cursor.sh` and its sandbox-suffixed variant. At initialize: `api2.cursor.sh:443` (1) |

For fx, Claude, Codex and OpenCode, every policy snapshot before initialize has empty
allowed and blocked host lists. Every later allowed-host list is also empty. The
Codex and OpenCode rows above are blocked requests. They appeared after an ACP
initialize despite the image's update/telemetry configuration; this report does not
classify them as updates, telemetry or functional API calls without source evidence.

All four version commands match their receipts. Signed-out status reports missing
authentication or zero credentials. fx's initialize is an authentication gate,
not a successful handshake. All four ACP processes exited with code 0 following
the observation window and EOF; none required a signal. Their response latencies,
measured inside the already-running guest, were approximately 2 ms (fx's error),
226 ms (Claude), 297 ms (Codex) and 585 ms (OpenCode). These are single observations,
not benchmarks and not comparable to research26's container-start-inclusive times.

Cursor also has no observed hosts through the idle-boot snapshot. Its `--version`
returns the exact pinned version while the DNS proxy records two blocked lookups
each for `api2.cursor.sh` and
`api2.cursor.sh.<sandbox-name>.docker.internal`. Signed-out status returns
`unauthenticated`, with neither access nor refresh token, and each DNS count becomes
four. At initialize each becomes six, and the forward proxy additionally records
one blocked `api2.cursor.sh:443` connection. No allowed-host row appears. The full
UUID-suffixed name and timestamps are retained in the JSON rather than normalized
in its evidence. The image's `--disable-auto-update` wrapper therefore does not
make these pinned Cursor startup commands silent.

Cursor answers initialize in approximately 334 ms but does not exit after EOF.
The fixture waits the 10-second observation window, sends EOF, then SIGTERM to its
own child process group after a further 3 seconds; Cursor exits with code 143.
This is the same shutdown limitation observed in research26, now inside sbx with
bounded process-group ownership. Its ACP response omits `agentInfo`, so the pinned
CLI version comes from the separate version command. No authentication is attempted.

The [initial Codex attempt](29-runtime-image-traffic-codex-results.json) stopped at
the disk-headroom guard before exporting/importing. A
[subsequent attempt](29-runtime-image-traffic-codex-retry-results.json) stopped when
Docker inspect returned `No such image` for the receipt's exact tag. A separate
immediate inspect then returned the expected full image ID and the completed retry
used that same tag/ID. No cause for that transient lookup failure is established.
Both failed attempts report empty cleanup inventories and remain as evidence.

The receipts and exported manifests preserve these exact image pins. Archive
digests, aliases, export sizes and all command results remain in the linked JSON.

| Runtime | OCI manifest SHA-256 |
| --- | --- |
| fx | `74d888efe94fb1544ae5a275964cfa5ba00dd96de9b4bd50bd1e8c7d917a19df` |
| Claude | `d425ddb92746f31c831a490f90d114ea0c91114ae874f090a6559dbb8bc3778b` |
| Codex | `ad2a973ec98f7f7ec07e0991347381d609af3069fcf2797600dd559c8f77137b` |
| OpenCode | `58a69fb62d0ac4b8ca72d06de7e072c1e37860275cde9a0b297b69009a201c99` |
| Cursor | `430507b5ce1525f30aa19ade1b2064b3ab4ccbeba37c43f486a3f07d07bf2d41` |

All five reports have `measurementCompleted: true`, empty cleanup errors, no
remaining owned boxes and no remaining owned templates. This field denotes a
completed observation, not successful authentication or zero attempted traffic.
After the last run, a fresh sbx inventory was empty for boxes and contained only
the pre-existing vendor templates `claude-code-docker` (`94670d5b2a24`) and
`shell-docker` (`5fc81bc7a127`). The original Docker images and receipts were not
modified by these three resumed measurements. The research30 worker received
exclusive engine ownership; no global daemon or policy setting was changed.

## Scope of the evidence

All traffic observations are from the sbx policy log for these short, signed-out
windows. An empty log is evidence that this logger observed no hosts during that
window, not a proof of permanent silence or packet capture. The policy is deny-all;
blocked traffic is an attempted connection, not a completed provider exchange.
The fixture cannot infer an endpoint's purpose from its hostname alone.

No amd64 image, real account, paid turn, native skills, mailbox, host worktree,
restart or data-preservation behavior is measured here. Those remain separate
acceptance checks. The binaries' pinned update/telemetry controls and their source
evidence are in [research23](23-runtime-image-build-inputs.md).

## Reproduction

Coordinate exclusive ownership of sbx and verify enough host space before running
one runtime at a time. The fixture enforces its own export/import headroom check.
The Docker config is isolated from the operator's credential helper.

```sh
BLOBOT_LIVE_SBX_RUNTIME_TRAFFIC=1 node .scratch/machines/research/29-runtime-image-traffic-fixture.mjs \
  --receipt /private/tmp/blobot-machine-images.040Rvi/final/codex-arm64.json \
  --results /private/tmp/blobot-codex-traffic-recheck.json \
  --docker-config /private/tmp/blobot-machine-images.040Rvi/docker-config \
  --docker-host unix:///Users/guillermo/.docker/run/docker.sock
```

Local receipt paths are build outputs, not published release assets. Compare full
manifest IDs when comparing later images. A retag can change an export archive's
SHA-256 without changing the image manifest, so neither identifier substitutes for
the other.
