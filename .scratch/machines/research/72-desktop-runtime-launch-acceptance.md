# Desktop box launch: Codex, OpenCode and Cursor without login

Measured 2026-09-06, macOS arm64 / sbx RC5. This extends the Claude acceptance in
[64](64-production-box-launch-acceptance.md) to three more published images,
through the actual Desktop Machine factory and runtime factory.

**OpenCode completes ACP initialize, a new session and the production MCP
handshake, both fresh and after reopening the same Machine. Codex and Cursor
initialize successfully, then their providers refuse `session/new` with
`Authentication required`.** Neither reaches the MCP handshake without login.
The first Codex attempt exposed a production allowlist omission; the parent fixed
it, and a separate live repeat confirmed the resulting provider-level refusal.

## Evidence and exact subject

- [Initial receipt](72-desktop-runtime-launch-results.json), 01:40:56–01:43:48 UTC,
  and its preserved [fixture](72-desktop-runtime-launch-first-fixture.mts).
- [Codex receipt after the allowlist fix](72-codex-after-allowlist-results.json),
  01:44:26–01:45:35 UTC, and the [repeat-capable fixture](72-desktop-runtime-launch-fixture.mts).
  The repeat used `BLOBOT_LIVE_DESKTOP_RUNTIME=1 BLOBOT_RESEARCH72_CODEX_ONLY=1`.
- Both receipts retain source hashes before and after their run. Each run's
  hashes match. Between the two runs, only the recorded `codex/image.ts` hash
  changed. This research changed no production source and made no commit.

`completed: true` in a receipt means the bounded measurement and cleanup finished;
the per-round `runtimeStarted` and `mailboxReady` fields distinguish success from
the observed refusals.

Host: macOS 26.6.2, build 25G83, arm64, Node 25.6.1. Engine client/server:
`v0.42.0-rc5`, revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, API 0.28.0.
All images are the arm64 pins from public release `machines-20260905-1`.

| Runtime | Image's declared CLI version | Manifest SHA-256 |
| --- | --- | --- |
| Codex | 0.151.0 | `475f185a738767edbd26a87ad2e6141c473f4698a3acadafcbd3b0740e88125c` |
| OpenCode | 1.18.4 | `f64b333bf23e6ec25614c54d4fbf59c124869b78e1f0735abf0f8f9ced2856b1` |
| Cursor | 2026.09.02-c22c1a3 | `781376cc4e5d4ee335c6e62f1176219ae825ef5f74655af88b64472f8035f7ca` |

The complete reference, public URL, archive length and archive SHA-256 are in each
receipt's `build`. Desktop's production image store downloaded, verified and
loaded each initially absent pin. No vendor template was used. A separate CLI
version probe is not claimed: OpenCode reports its version in ACP, Codex reports
bridge 1.7.0, and Cursor returns no `agentInfo` version in these replies.

Each Machine had 2 vCPU, 2 GiB RAM, an 8-GiB private home and 20-GiB private Docker
storage. Guest inspection reports UID 1000, `/home/agent`, two CPUs and
`MemTotal: 2066016 kB`. Four synthetic VMs were used sequentially: one per runtime
in the initial measurement, then one new Codex VM after the fix. Never two at once.

## Production path and the deliberately separate desktop gate

The fixture calls
[DesktopMachines(tempDirectory, true).forAgent](../../../apps/desktop/src/main/machines.ts)
with a synthetic Team/Agent and a genuine linked Git worktree. `true` explicitly
enables preview for this fixture. It then uses
[runtimeFor](../../../apps/desktop/src/main/runtime-for.ts), which selects the
production adapter and launcher. No launcher, image environment allowlist or
protocol response is replaced by the fixture. An explicitly nonexistent host
executable override is supplied; the box launchers select their guest executables.
The transport observer records requests/reply metadata and rejects any outbound
`session/prompt` or `authenticate` method.

The ordinary desktop `beforeRuntimeStart` gate is measured **separately**, before
the direct runtime-factory probe:

| Runtime | Desktop gate, fresh and reopened |
| --- | --- |
| Codex | Refused: `Installed, not signed in` |
| OpenCode | Refused: `Installed, no credentials found` |
| Cursor | Refused: `Installed, not signed in` |

The desktop would stop there. The authorized fixture subsequently calls the
runtime directly to measure signed-out ACP behavior; this does not certify that
the complete product start flow launches signed-out Agents. No gate or source is
changed to make that call. Renderer onboarding, Electron and a running Team
orchestrator are not part of this measurement.

To exclude actual operator skills, only this fixture process's `os.homedir()`
lookup is temporarily directed to an empty UUID directory. The original function
is restored; `process.env.HOME`, the engine client environment and global settings
are unchanged. The recorded Machine journal confirms that `sharedSkillsPath` is
absent. Its only host mounts are the synthetic linked worktree and its separate
common `.git`; the synthetic main-checkout marker is invisible to the guest.
The fixture supplies no host-home, skill or credential mount/import. No opener is
replaced.

The guest snapshots find no SSH socket and none of the explicitly checked provider
key/token environment names. Homes are new owned volumes, but setup/detection
already creates runtime directories, `.gitconfig`, `.gitignore_global` and caches;
this is not a claim of literally empty directories or an audit of every file's
provenance. The fixture records directory names, not credential contents.

## What each runtime actually did

| Runtime | Fresh Machine | Same Machine after stop/reopen |
| --- | --- | --- |
| OpenCode | ACP 1, `OpenCode` 1.18.4, `opencode-login` advertised; `session/new` succeeds; runtime `ready`; real MCP handshake | Same; a different new session hash; new listener and fresh fixture bearer handshake |
| Codex after fix | ACP 1, `@agentclientprotocol/codex-acp` 1.7.0, `api-key` advertised; `session/new` returns -32000 `Authentication required`; runtime `dead`; no MCP handshake | Same |
| Cursor | ACP 1, `cursor_login` advertised; `session/new` returns -32000 `Authentication required`; adapter names the refusal; runtime `dead`; no MCP handshake | Same |

The mailbox is the production
[PeerMessageServer](../../../packages/core/src/mcp/peer-message-server.ts), reached
through `host.docker.internal`. OpenCode's `whenReady` resolves true in both rounds
and the server logs an authenticated handshake with one advertised tool. The
handler is never called. For Codex/Cursor, `whenReady` remains false and server
logs contain only listener startup. No attempt is made to force their handshake
past the provider's authentication requirement.

OpenCode's `session/close` receives a normal reply and its transport close reason
is null. For Codex/Cursor, the adapter's failure cleanup reaches the existing
[child-transport](../../../packages/core/src/adapters/acp/child-transport.ts)
2-second kill fallback: close reports `the agent process was killed by SIGKILL`.
That is the exit of the host `sbx exec` child owned by
[spawnSbxTransport](../../../packages/core/src/machines/sbx/transport.ts), not an
independent observation of the guest CLI's exit or descendants. A subsequent
explicit runtime stop also takes about two seconds. Thus these refusals do **not**
establish graceful CLI shutdown; complete cleanup is established by the later
Machine stop, stopped inventory, reopen and exact VM removal.

## Codex omission discovered and remeasured

Initially both Codex rounds failed locally in `prepareSbxExec`, before any ACP
request: `A launch environment variable is not permitted in the sandbox`.
The production
[Codex adapter](../../../packages/core/src/adapters/codex/codex-agent-runtime.ts)
always generates `CODEX_CONFIG`, including when this fixture's persona is empty,
but its image definition had omitted that key from `allowedEnvironment`.

The parent added only `CODEX_CONFIG` to the production
[image allowlist](../../../packages/core/src/adapters/codex/image.ts). No fixture
allowlist relaxation was used. The separate repeat proves that this real launch
now negotiates ACP and reaches the provider's auth refusal. It does not claim a
successful Codex session or mailbox. The initial failure evidence remains intact.

## Timings

Milliseconds, single observations. Fresh/reopened order in each cell. Codex values
below are from the run after the allowlist fix.

| Operation | Codex | OpenCode | Cursor |
| --- | ---: | ---: | ---: |
| Image download + verification + load | 11,043.56 | 9,794.58 | 11,237.02 |
| Desktop Machine start | 17,206.79 / 5,209.56 | 10,741.31 / 4,876.89 | 16,330.90 / 5,078.43 |
| ACP initialize request → reply | 549.21 / 427.88 | 823.79 / 720.62 | 547.27 / 543.31 |
| `session/new` request → success/refusal | 6.22 / 9.67 | 464.60 / 371.27 | 14.78 / 12.33 |
| Runtime start → completion/refusal including failure cleanup | 2,561.03 / 2,439.97 | 1,290.00 / 1,092.65 | 2,566.79 / 2,557.58 |
| Explicit runtime stop | 2,003.09 / 2,002.66 | 19.48 / 17.39 | 2,001.36 / 2,001.59 |
| Machine stop | 6,963.35 / 6,793.46 | 7,007.76 / 6,998.28 | 7,029.02 / 7,125.13 |

These are not pure image-load/boot costs or distributions. The protocol observer
adds measurement work; desktop preparation also verifies mounts, engine and image
state. Reopening is measured for the same recorded box id, but it starts a new
runtime/session rather than resuming the old session.

## Remaining limits and cleanup

No prompts, inference, tools, provider login, authorization code, browser auth URL
or credential import were attempted. ACP `authMethods` is a vendor advertisement,
not a login performed by this fixture. The test uses an empty persona and default
runtime options; it does not validate arbitrary persona/configuration content,
signed-in behavior, MCP tool invocation/peer delivery, reconnection, permissions,
session resume, migration, crash recovery or Linux-host/amd64 operation. fx's
existing signed-out initialization refusal in [53](53-first-box-evidence-ledger.md)
was not repeated. OpenCode's successful signed-out startup does not prove model
readiness or discharge the desktop login requirement.

Both receipts end with no cleanup errors, `sandboxes: []`, unchanged original
vendor templates `94670d5b2a24` and `5fc81bc7a127`, and all exact temporary roots,
worktrees, repositories, journals and image caches removed. Every owned box was
observed stopped after each round before removal; each reopened round retained
its prior box id. Sampled free space stayed above 22.45 GiB. The engine was ceded
clean after the Codex repeat, with no further engine calls for this note.
