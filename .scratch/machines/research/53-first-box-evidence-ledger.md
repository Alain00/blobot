# First-box evidence ledger

2026-09-06. Read-only reconciliation for the claimed
[Measure the first box](../issues/16-measure-the-first-box.md). No engine, runtime,
provider, credential, network or new fixture was invoked. This ledger reads the
existing local measurements, receipts and test source; it does not close the ticket
or certify anything beyond those records. “Accepted evidence” means an observed
result usable at its stated scope, not permission to activate every box runtime.

**The remaining first-box gaps are real vendor sign-in, runtime-specific mailbox
delivery/turns on the published images, a large single-line test through actual
sbx, and Linux/KVM sbx acceptance.** Build/distribution, signed-out startup for four
runtimes, ordinary host worktrees, and macOS engine mechanics have substantial
existing evidence and should not be repeated as though unmeasured.

## Historical checklist reconciled

| Historical measurement | Accepted evidence and exact record | Platform/version | Still not proved, or superseded premise |
| --- | --- | --- | --- |
| Shell HTTP mailbox, bearer, SSE, guest loopback | [08 §2](08-the-first-box-sbx.md#2-the-mailbox-door-blobot-probe-a-shell-bind-mounted-repo-a): bearer intact, proxy rewrites Host to localhost; three SSE events one second apart; guest loopback refused. [14](14-sbx-mailbox-lifecycle.md): actual authenticated listener reaches, old/new port grants and exact revocation, 403 without listener hit. | 08: macOS 26.6.2/M4 Pro arm64, sbx 0.39.0; 14: Mac arm64, RC5, Linux 7.0.12/aarch64. | RC5 long-lived SSE/reconnect/abort is not measured by 14. Neither curl nor a generic listener certifies five runtime MCP clients. The old deny-all/scoped-port boundary is superseded by the accepted open-network implementation in 47. |
| Worktree plus repository/clone/fetch | [20 live section](20-worktrees-in-sbx.md#parent-session-live-fixture--observed-2026-09-05), [raw20](20-worktree-fixture-results.json): primary worktree and common Git directory mounted RW at original paths; UID 1000 commit immediately visible on host branch, same remote, main checkout and sibling worktree files absent, stop/reopen retained commit. | Mac arm64, RC5; Apple Git 2.50.1; cached shell template. | `--clone`/fetch is an obsolete product route. Its old refusal in 08 remains historical evidence, not a defect to repair. Submodules, external alternates, Git LFS, helper credentials and adversarial/concurrent Git cases were not certified by 20. |
| Empty-box RAM, disk and lifecycle cost | [11 resource measurement](11-sbx-resource-limits.md#subsequent-implementing-session-measurement--macos-rc5); [16 comparative table](16-engine-lifecycle-persistence-and-costs.md), [raw19](19-sbx-fixture-results.json). Detailed units below. | Mac arm64, RC5; Linux 7.0.12; cached shell/root kit. | Full authenticated Agent startup, pressure/concurrency distributions, reliable per-box RSS attribution with other VMs, physical disk peaks and SLA are absent. Configured capacity is not physical consumption. |
| Real Claude bridge and mailbox from vendor image | [08 §5](08-the-first-box-sbx.md#5-dockers-claude-template-zero-tokens-blobot-probe-c): initialize and signed-out `session/new`; actual CLI POST to `/agents/x/mcp`, exact synthetic bearer received; default session mode returned. | Mac arm64, sbx 0.39.0; vendor Claude 2.1.246; bridge 0.70.0; Node 22.22.1. | No prompt, `message_agent` delivery, permission round trip, stop reason or real usage accounting inside this box. It is not the published Claude 2.1.260 image or RC5 integration. |
| Hand-built `node:22` image/kit | The author replaced that proposed base with pinned shell-docker derivative ([image ticket base decision](../issues/13-the-image-one-per-runtime.md#base-decision-2026-09-05-guillermo)). [26](26-runtime-image-acp-initialize.md), [28](28-explicit-docker-volumes-and-quiescence.md), [29](29-runtime-image-deny-all-traffic.md), [34](34-public-runtime-distribution.md) verify actual chosen images, UID/home/CLI/startup, private Docker storage and distribution. | Five runtime pins below; local arm64 Docker/sbx and native CI arm64/amd64 Docker. | Do not resurrect `node:22` or install Mac Mach-O binaries. `initialize` alone does not prove Claude's session launches the chosen external CLI, onboarding/trust behavior in a fresh published-image home, or every legacy kit detail such as proxy variables surviving sudo. |
| Runtime sign-in routes and where login lives | [08 §5](08-the-first-box-sbx.md) proves vendor Claude signed out and its historical home layout. [Detection resolution](../issues/08-detection-and-remedies-per-machine.md#answer--2026-09-05) defines guest-scoped PTY and post-login detection; [owned lifecycle test](../../../packages/core/src/machines/sbx/owned-machine.live.test.ts) deliberately substitutes synthetic `fx status` and abandons a fake dialog. | Mechanism: Mac arm64 RC5. No authenticated runtime here. | No real `/login`/CLI-login browser or device callback, fresh positive CLI status, credential location/persistence, second-Agent sharing or proxy-managed OAuth on own images. A synthetic dialog/exit code cannot discharge this row. Any choice among historical login tiers belongs to its existing owner. |
| Five runtime MCP clients | Only the old Claude client call above is directly observed. Generic door 14 and [open-network47](47-open-network-lifecycle.md) prove engine/network mechanisms. Runtime startup 29 is signed out and never requests `session/new` or MCP. | Claude vendor 0.39.0 only for real MCP dialing; RC5 generic networking separately. | Codex/OpenCode/Cursor real MCP connection, bearer, peer delivery and reconnect unmeasured; fx cannot even initialize signed out. Broad Internet/host access removes the old exact-port allowlist premise but does not prove a client can dial correctly. |
| 6 MB attachment-sized JSON line through exec | [Transport unit test](../../../packages/core/src/machines/sbx/transport.test.ts:43) preserves JSON then a **6 MiB plain-text line** through `SBX_BOOTSTRAP_SOURCE` spawned using local Node. [Live transport](../../../packages/core/src/machines/sbx/live.test.ts) sends only `{"id":1}\n`. | Unit/local process; live mechanical sbx supports 0.39/RC5. | No recorded **single 6 MB JSON line through real sbx** with byte count/hash, including return path/EOF/backpressure. The 1 MiB launch-header cap is separate from protocol payload. Large chunked state archives in 19/30/38 do not settle large ACP-line behavior. |
| Engine status/list/diagnose cost and sign-in detection | [13 §§status/diagnose](13-sbx-lifecycle-command-contract.md): exact running-state JSON, matching client/server and `Authentication: pass`. [10 install record](10-sbx-rc5-engine-admission.md): approved RC5 install/restart and SSH setting readback. | Mac arm64, RC5/API 0.28.0. | No controlled up/down latency matrix for these three commands, nor complete stopped/error/expired-auth shapes. 13 explicitly did not retest a stopped daemon. These shared-daemon experiments are not implied by measuring a disposable box. |
| Local `_meta`, Keychain and third Claude turn | [07 §5](07-the-first-box.md): two real local Claude turns; `_meta` reaches SDK and shell fence/network behavior observed. [42](42-claude-native-sandbox-policy.md), [43](43-cursor-codex-inner-sandbox.md), [44](44-claude-required-bash-failure.md) add exact policy/config and synthetic-provider failure evidence. | 07: Darwin 25.6.0/arm64, Claude 2.1.260, bridge 0.70.0/SDK 0.3.232; 42–44 keep their own stated scopes. | Ticket 16 explicitly transferred item 5/third turn to 04. Keychain authentication with the entire bridge under srt is not certified by 07; 44 uses a fabricated local provider and usage constants, not paid inference or login. Do not duplicate that ticket's spend. |
| Linux/KVM repeat | [34](34-public-runtime-distribution.md), [review34 jobs/builds](34-ci-release-review.json): native Ubuntu 24.04 amd64 and Ubuntu 24.04-arm jobs built/smoked all five; no emulation claim is needed. | Native Linux CI Docker, both architectures; source 056a3b31fa1838e16fcdd181c7c89528f7baf226. | **No Linux-host sbx/KVM or amd64 sbx was measured.** Docker CI is not this engine acceptance: daemon/install, mailbox/SSE, worktrees, SSH boundary, resources, stop/reopen and provider integration remain platform-specific. |

## Runtime ledger: handshake is not login or mailbox delivery

The strongest local sbx startup receipts are the individual research 29 reports.
Their root kit has no credentials or host mounts and uses UID 1000, private home 8 GiB
and Docker 20 GiB. All are Mac arm64, RC5
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, API 0.28.0, Linux 7.0.12/aarch64.
They predate the later open-network policy; blocked-host observations are historical
startup characterization, not today's admitted destination policy.

| Runtime / pinned versions | sbx signed-out initialize evidence | Login / own-image mailbox / real turn |
| --- | --- | --- |
| Claude 2.1.260; claude-agent-acp 0.70.0 | [29 Claude](29-runtime-image-traffic-claude-results.json): protocol 1, about 226 ms inside an already running guest, no runtime hosts observed in this window. | All unproved. Older vendor 2.1.246 client dialing in 08 is separately credited above. |
| Codex 0.151.0; codex-acp 1.7.0 | [29 final Codex](29-runtime-image-traffic-codex-final-results.json): protocol 1, about 297 ms; blocked chatgpt.com/api.github.com/github.com startup requests. | All unproved. Startup host names do not prove successful provider exchange or purpose. |
| OpenCode 1.18.4 | [29 OpenCode](29-runtime-image-traffic-opencode-results.json): protocol 1, about 585 ms; blocked registry.npmjs.org request. | All unproved. Bun's real MCP transport was not exercised. |
| fx 0.0.7 | [29 fx](29-runtime-image-traffic-fx-results.json): error `-32600`, Vercel AI Gateway authentication required, about 2 ms. **This is not initialize success.** | Real sign-in needed before successful initialize can be measured; mailbox/turn unproved. |
| Cursor 2026.09.02-c22c1a3 | [29 Cursor](29-runtime-image-traffic-cursor-results.json): protocol 1, about 334 ms, no agentInfo; CLI version checked separately. DNS/api2.cursor.sh attempts observed. EOF did not stop it; owned process-group SIGTERM required. | All unproved. Signed-out capabilities do not instantiate authenticated MCP/session services or certify native sandbox enforcement (43). |

All ten architecture/runtime CI smoke results are accepted in
[review34](34-ci-release-review.json). The actual [smoke source](../../../images/machines/smoke.mjs)
checks UID/GID 1000, empty private tmpfs home, Node/CLI versions and only initialize
under `docker run --network none`. Its success predicate deliberately accepts fx's
authentication error and Cursor's bounded shutdown behavior. Therefore “10/10
accepted smoke” must not become “five runtimes authenticated/connected on Linux”.
Local image manifest IDs in 29 and published CI IDs in 34 differ; the latter's
receipts are not interchangeable with the former's live sbx evidence.

## Costs with the correct units and subject

| Cost | Existing observation | Exact evidence / limit |
| --- | --- | --- |
| RC5 cached shell create | 3,108.51 ms initial; 2,460.42 ms replacement, including VM start | [19 commands](19-sbx-fixture-results.json), 2 CPU/2 GiB and two 512 MiB synthetic volumes. No provider/full admission. |
| RC5 cold/warm exec and stop | Three wakes 857.68–884.52 ms; warm exec 157.14–173.27 ms; stops 5,205.24–5,218.99 ms | Same 19. Do not reuse v0.39's 0.16 s stop as the RC5 figure. |
| Host RAM | 19 empty shim 721,088 KiB ≈ 704 MiB; no shim after both fixtures stopped. 11's 4 GiB configuration initially ≈ 781 MiB, touched workload ≈ 1,184 MiB, later ≈ 957 MiB. | [16 interpretation](16-engine-lifecycle-persistence-and-costs.md), [11](11-sbx-resource-limits.md). Daemon overhead remains; no reliable N-box attribution or hard RSS ceiling. |
| Uncached boot/download | 33.97 s for shell pull+create; cached clone 3.9 s; vendor Claude 8.92 s | [08 §4](08-the-first-box-sbx.md#4-cost), **v0.39**, not current own-image/network timing. |
| Public archive bytes | arm64 range 594,126,848–772,251,136 B; amd64 610,527,744–789,465,088 B; all ten below 1 GiB | [34 sizes](34-public-runtime-distribution.md), [catalog34](34-runtime-builds.json). Archive size is neither unpacked/store bytes nor physical disk allocation. |
| Anonymous distribution | All ten complete downloads validated; fx arm64 resumed after 1,048,576 B using 206/Range; immutable published release: 32 assets | [34 download results](34-public-release-fixture-results.json), [metadata34](34-public-release-metadata.json). Native CI succeeds for all ten pairs; no cross-host byte reproducibility claim. |
| Public image load | fx arm64 actual release through `SbxImageStore`: 2,950.44 ms, ready then removed/not-installed | [34 load results](34-public-image-load-results.json). **No runtime or box started.** Earlier 27/33 local load timings concern earlier local pins. |
| Storage capacities | Exactly 8 GiB home, 20 GiB Docker block devices; one mount each after label-false adjustment | [28](28-explicit-docker-volumes-and-quiescence.md). Capacity ceilings do not measure disk growth with real workloads or peak copy/recovery storage. |

## Minimum remaining real evidence

1. **Mechanical, current transport:** one valid attachment-sized JSON line through
   actual RC5 `spawnSbxTransport`, exact source/guest/returned length and digest,
   chunked writes/backpressure and EOF. The attachment source limit is still
   [4,000,000 bytes](../../../packages/core/src/orchestrator/bounds.ts:80), expanding
   to roughly 5.33 MB base64 before JSON overhead. The existing local 6 MiB plain-text
   test proves bootstrap framing only.
2. **Published-image runtime matrix:** fresh Machine/home, real runtime
   `session/new` and authenticated mailbox handshake where possible without a turn;
   bearer and peer delivery through the actual mailbox, one controlled tool turn
   where needed, permission round trip, stop reason and actual usage. Record exact
   released manifest, runtime/bridge version and whether login or a prompt was
   necessary. Do not promote 29's initialize to this result.
3. **Human sign-in frontier:** measure the chosen vendor login route and fresh
   in-guest status for each runtime, including fx's blocked initialize. Browser/device
   callback, credential persistence and possible proxy-managed sharing need explicit
   observations; synthetic owned-lifecycle sign-in is already tested and need not
   be respent. No credential values need enter a report.
4. **Current lifecycle/stream/platform coverage:** RC5 SSE lifetime/reconnect and
   runtime cleanup; Linux/KVM/amd64 sbx acceptance on its actual host. CLI diagnostic
   cold/error timing is a separate shared-daemon measurement if still required by
   setup/caching. CI Docker architecture smoke already covers its narrower subject.

The existing [network47](47-open-network-lifecycle.md) live logs were read:
`/private/tmp/blobot-open-network-live.log` records 2 tests passed in 183.01 s;
`/private/tmp/blobot-open-network-tcp-live.log` records 1 passed in 41.24 s. Their
synthetic HTTP/TCP, ownership, sleep/replacement and grant lifecycle evidence is
accepted; these durations are whole test runs, not per-user-operation costs.
No live fixture was rerun for this ledger, and no tracker status changed.
