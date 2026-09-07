# Docker Engine and sbx: lifecycle, persistence and resource costs

Research for [Docker Engine and sbx: lifecycle, persistence and resource costs](../issues/20-engine-lifecycle-persistence-and-costs.md),
2026-09-05. This is evidence for the author's reevaluation, **not an engine decision**.
The companion isolation/product investigation owns whether the cheaper primitives satisfy the
boundary. Existing `sbx` decisions and activation guards remain binding.

## Result

Docker Engine supplies three useful primitives that the current local `sbx` contract lacks:
**update existing containers' CPU/RAM limits, attach existing named volumes to replacements,
and inspect container configuration without executing inside it**. These could remove much
of blobot's copy-on-resize machinery. They do not supply per-Agent ownership, safe edits,
session recovery, idle sleep, or Workspace preservation. Those remain application work.
Sources: [update](https://docs.docker.com/reference/cli/docker/container/update/),
[volumes](https://docs.docker.com/engine/storage/volumes/),
[versioned inspect schema](https://docs.docker.com/reference/api/engine/version/v1.55.yaml).

Two qualifications are decision-critical:

- **Same volumes are not the same whole Machine.** Files in mounted volumes survive; running
  processes, container identity/configuration, and changes outside those volumes do not move.
  An old container retained against the *same* writable volumes is not a historical data rollback.
- **A smaller RAM maximum can interrupt work without restarting the container.** Resource updates
  need the user's warning/confirmation and an effective-state check, not just a successful command.
  The Linux memory controller may reclaim or kill processes when a new maximum is too small.
  [Kernel memory controller](https://docs.kernel.org/admin-guide/cgroup-v2.html#memory-interface-files).

No equivalent-workload speed factor, production resource envelope, or percentage implementation
saving is established. The available sbx measurements are bounded mechanism tests. Docker Engine
was unavailable at the session's initial check; see **Measurements and limitations**.

## Evidence ledger and versions

- **[DOC]** primary documentation or inspected upstream source; not a live result.
- **[OBS]** a run on the named environment; earlier runs are explicitly linked.
- **[CODE]** blobot source at implementation commit `5d2edd9`.
- **[INF]** engineering consequence of those facts; not an upstream guarantee.
- **[UNVERIFIED]** a material fact neither established by the contract nor measured here.

Local read-only inventory supplied by the coordinating session: Darwin **25.6.0**, arm64;
Docker client **29.6.1**, API **1.55**, context `desktop-linux`, server unavailable at its local
Unix socket. That client version is **not a measured server version**. Earlier host inventory
recorded Docker Desktop **4.81.0**, Apple M4 Pro, 12 cores, 24 GiB; it is historical inventory,
not proof that Desktop's VM is running with any particular resources. [OBS]

The existing sbx implementation and live tests target client/server **v0.42.0-rc5**, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, server API **0.28.0**. Earlier v0.39.0 numbers
are not presented as RC5 measurements. The API schema read here is Docker Engine **v1.55**;
upstream Moby update code was pinned at
[`2280567b60633e2a4ac8723961bc1f351e71e099`](https://github.com/moby/moby/blob/2280567b60633e2a4ac8723961bc1f351e71e099/daemon/update.go).
That source revision was **not proven to be the local 29.6.1 binary**. The attempted
`moby/moby` v29.6.1 source URL returned 404; no equivalence is inferred. [DOC/OBS]

Official online pages are rolling documentation read on this date. Where they differ from
the installed RC5 help/live behavior, the pinned observations define what blobot can use.
No installation, shared-engine restart, live guest probe, user-volume mount, credential read,
or paid inference was performed by this researcher.

## The actual stacks

| Candidate | macOS | Linux | Operational consequence |
| --- | --- | --- | --- |
| Vanilla Docker Engine, Linux containers | macOS client → a Linux VM supplied by Docker Desktop or another separately selected runtime → Engine/container runtime → ordinary containers sharing that Linux kernel | Client → Engine/container runtime on Linux → containers sharing the host kernel; a VM is optional infrastructure, not intrinsic to this mode | One shared daemon/image store and, on Mac, one shared VM budget/failure domain; installing only the `docker` client is insufficient |
| Local Docker Sandboxes through sbx | sbx client/daemon → separate microVM for each sandbox, plus its guest environment and Docker state | sbx client/daemon → per-sandbox microVM; documented Ubuntu 24.04+, amd64/arm64, KVM and user access to KVM | Per-Machine VM/guest overhead; does not require host Docker Engine or Docker Desktop |

Sources: [Engine's client/server objects](https://docs.docker.com/engine/),
[Engine platform installation](https://docs.docker.com/engine/install/),
[Desktop's Linux VM controls](https://docs.docker.com/desktop/settings-and-maintenance/settings/#resources),
[sbx prerequisites](https://docs.docker.com/ai/sandboxes/install/),
[sbx architecture](https://docs.docker.com/ai/sandboxes/architecture/). [DOC]

sbx's supported Mac prerequisite is Apple silicon and macOS 14+. A native Linux Engine
installation has a broader documented distro/architecture matrix and does not inherently need
KVM; this investigation ran no Linux host. A different Mac VM manager would be another product
dependency with its own startup, update, resource and persistence contract—not “vanilla Engine
without a VM.” [DOC/INF, same installation sources]

Do not charge Docker Desktop's VM to sbx, or omit it from Engine's Mac cost. Do not treat the
shared VM as one independent microVM per Agent. The companion research owns the resulting
security trade-off; no equivalence of isolation is implied by this lifecycle comparison.

## Capability matrix

**Native** means a public engine primitive, not a completed blobot workflow. **Blobot work**
means composition/product policy still required. **Unsupported** is scoped to the inspected
public local interface. **Unverified** is not a negative capability result.

| Requirement | Docker Engine, Linux containers | sbx RC5 local | Evidence |
| --- | --- | --- | --- |
| Create/start/stop/restart same identity | Native; blobot owns chosen image/config and verified transitions | Native; staged owned lifecycle implements transitions | Engine [stop](https://docs.docker.com/reference/cli/docker/container/stop/), [exec](https://docs.docker.com/reference/cli/docker/container/exec/); sbx [command measurements](13-sbx-lifecycle-command-contract.md) |
| Stop for idle hours; wake on a message | Blobot work; Desktop's VM idleness is a different condition | Blobot work; engine session-disconnect behavior is not user activity | [SleepingRuntime](../../../packages/core/src/machines/sleeping-runtime.ts); [Desktop Resource Saver](https://docs.docker.com/desktop/use-desktop/resource-saver/); [older sbx auto-stop observation](08-the-first-box-sbx.md#4-cost) |
| Retain files across stop/start | Native retained container layer + named volumes | Native sandbox state while sandbox exists | [Engine layers](https://docs.docker.com/engine/storage/drivers/); [sbx persistence](12-sbx-volume-reattachment.md#persistence-lifetime-stop-and-remove-differ) |
| Reuse old named data volumes in a new execution object | Native by volume name; blobot owns exclusive access/cutover | Unsupported public local attach; cloud-only flag is not an alternative | [Engine volumes](https://docs.docker.com/engine/storage/volumes/); [RC5 rejection](12-sbx-volume-reattachment.md#live-validation--parent-session-2026-09-05) |
| Change CPU/RAM without replacing execution object | Native update, with kernel/daemon prerequisites | Unsupported routes tested; `kit add` success did not resize VM | [Engine update](https://docs.docker.com/reference/cli/docker/container/update/); [RC5 resize failures](11-sbx-resource-limits.md#existing-box-resize-probes--observed-by-the-implementing-session) |
| Maxima rather than reservations | Native CPU quota + memory cap; shared host capacity still finite | Native vCPU/guest-RAM sizing; no full-RAM residency at creation in one fixture | Resource section below |
| Cold configuration inspection | Native inspect response, no container process needed | Limited list/registry; full current image/config unavailable | [Engine schema](https://docs.docker.com/reference/api/engine/version/v1.55.yaml); [sbx gap](13-sbx-lifecycle-command-contract.md#adoption-and-effective-configuration-gap) |
| Live per-object CPU/RAM statistics | Native cgroup statistics; not Mac process RSS | Host-per-box machine-readable RSS contract unverified | [Engine stats](https://docs.docker.com/reference/cli/docker/container/stats/); [sbx metrics limits](11-sbx-resource-limits.md#existing-boxes-and-metrics) |
| Real provider login/session after sleep or replacement | Unverified; data layout, image and adapters are blobot work | Synthetic preservation verified; real runtime integration remains unverified | [Scoped detection ticket](../issues/08-detection-and-remedies-per-machine.md) |
| Application crash, ambiguous update, interrupted replacement | Engine metadata helps; blobot journal/reconcile/ownership still required | Staged journal/lease refuses ambiguous state; explicit recovery unfinished | Recovery section below |
| Delete only after preserving work | Native deletion primitive; blobot preservation contract required | Native removal; staged `destroy()` deliberately refuses | [Owned lifecycle](../../../packages/core/src/machines/sbx/owned-machine.ts) |
| Safe upgrades and complete data rollback | Unverified workflow, despite native reuse | Unverified workflow beyond bounded same-image copy | Persistence and recovery sections below |

## Persistence: what “outside the container” actually buys

Engine named volumes outlive container deletion and can be mounted by name in a replacement.
A new mount may silently create a missing volume; an empty volume can be seeded from the
image unless `volume-nocopy` is used. A nonempty mount hides the image's files at that path.
Therefore blobot must verify the expected existing volume before creating the replacement;
successful creation alone is not restoration. Sharing is allowed by Engine, so exclusive
Agent ownership is our invariant, not an Engine restriction.
[Volume lifecycle/mount semantics](https://docs.docker.com/engine/storage/volumes/). [DOC/INF]

| State | Current blobot placement/contract | Same retained execution object | New object with the two old data volumes |
| --- | --- | --- | --- |
| Agent home, CLI-owned config/login/session files written beneath it | `/home/agent` private volume | Preserved files, not running process | Preserved if identical mount path, UID/GID and compatible CLI; real runtime behavior still needs testing |
| AgentWorkspace, Git objects, uncommitted files, project dependencies | `/workspace` private volume; production Workspace transport still pending | Preserved files | Preserved files; host work-product reconciliation is still necessary |
| User-installed tools under the home, such as `~/.local` | Within home volume when installed there | Preserved | Preserved, subject to binary/architecture/system-library compatibility |
| Packages/system changes under `/usr`, `/opt`, `/etc`, root's home | Container writable layer unless image or an additional persistence contract owns them | Retained layer survives stop | Not in the two-volume copy/reuse promise; must reconstruct from image/setup or explicitly preserve |
| Inner Docker images/containers/build cache | Typically `/var/lib/docker`, or additional containerd storage depending on guest daemon configuration | sbx documents retention while sandbox exists | Current blobot copy only traverses home/workspace; no complete inner-Docker migration established |
| RAM, open sockets, process IDs, file locks, provider process | Volatile | Stop terminates processes; resume is a new process | Not preserved by volumes |
| Image identity, limits, mounts, network, environment, hostname/container ID | Engine configuration + blobot receipt | Retained configuration, subject to external edits | Must recreate/revalidate; identity may change |
| Transcript, Team/Agent records, handoff archive, Machine receipts | Host-side blobot stores | Separate from the container | Volumes do not restore these records |

Placement evidence: [root kit](../../../packages/core/src/machines/sbx/kit.ts),
[two-tree transfer](../../../packages/core/src/machines/sbx/data-transfer.ts),
[domain glossary](../../../CONTEXT.md), [build boundary](../build.md). [CODE]
Engine layer lifetime and image layer sharing:
[storage model](https://docs.docker.com/engine/storage/drivers/). [DOC]
Inner Engine 29 storage can split image/snapshot data into `/var/lib/containerd` while volume/config
data remains in `/var/lib/docker`; a hard-coded single-directory backup is not universally complete.
[Daemon data layout](https://docs.docker.com/engine/daemon/#daemon-data-directory). [DOC]

Consequently, “point the new container at the old volumes” is sufficient for **those files**
when writers are quiescent, paths/permissions match, the image can interpret the state, and no
required state was left outside them. It is not a proof of unchanged runtime behavior, usable
OAuth refresh state, database compatibility, or complete tool installation. These qualifications
apply to both Engine reuse and sbx copy. Current sbx custom-kit replacement must not be advertised
as preserving every system modification or inner Docker cache. [INF from the inventory]

Engine reattachment does not copy all bytes. That avoids an inherent second data copy, but after
the replacement writes, the old container sees those same changed bytes. **Container rollback**
and **data rollback** must be different operations. Keeping an original independent data copy,
as current sbx replacement does, buys a recovery point at additional disk/time cost; neither
approach safely merges post-cutover divergent work automatically. Image upgrades/schema
migrations make that distinction more important. [INF]

For sbx, local kit volumes have sandbox-owned lifetime; `rm` removes them. The current supported
fallback creates new volumes and streams GNU tar between stopped/quiesced workflows via two
running guests, then validates and changes the registered binding. Direct local volume attach
was explicitly rejected by RC5. Template snapshots are not a proven substitute for mounted
volume preservation. [Observed preservation and limits](12-sbx-volume-reattachment.md). [OBS]

## Resource semantics and editing existing Machines

### Engine

`--cpus` is a fractional CPU-time quota, not exclusive physical cores; `--memory` is a hard
container-memory limit, not up-front allocation. Docker documents a 6 MiB minimum, not a useful
CLI-agent operating minimum. `--memory-reservation` and CPU shares are separate controls, not
needed to express the user's maxima. Swap needs a stated policy: absent `--memory-swap`, Docker
may permit additional swap equal to the RAM cap; setting both equal prevents container swap.
Kernel capabilities must be checked.
[Resource controls](https://docs.docker.com/engine/containers/resource_constraints/). [DOC]

`docker update` changes existing Linux containers, including CPU and memory, without requiring
replacement. `--cpus` entered the API in 1.29; it is not a recently invented capability.
[Update command](https://docs.docker.com/reference/cli/docker/container/update/). [DOC]
Inspected Moby code stores changed HostConfig for a stopped container and applies resource
changes to a running task. It attempts to restore HostConfig on several failure paths; that is
not an all-fields kernel transaction or recovery of a killed workload.
[Pinned update implementation](https://github.com/moby/moby/blob/2280567b60633e2a4ac8723961bc1f351e71e099/daemon/update.go). [DOC, version caveat above]

For cgroup v2, lowering `memory.max` can reclaim memory and invoke OOM kills when usage cannot
fit; temporary overage is possible. This is distinct from cgroup v1 failure behavior and from
memory reservation. A successful limit update cannot promise a live CLI survived it.
[Kernel contract](https://docs.kernel.org/admin-guide/cgroup-v2.html). [DOC]

Rootless Engine needs cgroup v2/systemd and properly delegated controllers for these limits;
Docker documents that unsupported rootless configurations can **ignore** cgroup flags.
Capability detection and effective checks are therefore load-bearing, particularly on Linux.
[Rootless resource requirements](https://docs.docker.com/engine/security/rootless/tips/#limiting-resources). [DOC]

### sbx

RC5 supplies integer vCPU count and configured guest memory at creation. Those are not the same
as Engine's CPU quota or container cgroup memory. `run` with changed resource flags refuses an
existing sandbox; the tested legal kit-add route retained old effective limits. Current blobot
meets edits through copy/replacement, with original retention, not a native resize.
[Resource contract and observed failures](11-sbx-resource-limits.md). [DOC/OBS]

One RC5 2-vCPU/4-GiB guest used about 781 MiB of attributed shim RSS just after creation, then
about 1,184 MiB during a touched 256-MiB allocation. It did **not** eagerly make the configured
4 GiB resident. That observation does not establish a hard host-RSS maximum or reclamation SLA;
guest MemTotal excludes host daemon/device overhead. [Same measurement](11-sbx-resource-limits.md#subsequent-implementing-session-measurement--macos-rc5). [OBS]

### The workflow blobot still owes

Keep desired limits separate from verified effective state. Serialize against wake/work and
other configuration changes; warn and obtain the user's confirmation before disruptive changes,
including a RAM reduction that might kill a working process. After an error or timeout, reread
identity/configuration rather than assuming “old” or “new”; after successful configuration,
fresh engine/runtime checks still apply. Editing a sleeping Machine should not execute a login
probe merely to refresh a screen. [INF constrained by the accepted lifecycle/detection tickets]

Current `SleepingRuntime.reconfigure` always stops the runtime and Machine, invokes the change,
then reopens. Engine native updates can simplify its backend even with this retained restart
policy. Exploiting **non-disruptive hot updates** would require an explicit capability/policy
path; it does not happen by replacing `sbx` argv. Current `MachineLimits` validates integer CPUs;
offering fractional Engine quotas likewise needs a deliberate model/UI change.
[Sleep implementation](../../../packages/core/src/machines/sleeping-runtime.ts),
[limits](../../../packages/core/src/machines/resources.ts). [CODE]

## Lifecycle, recovery and observation

Engine stop signals PID 1, then forcibly kills after its timeout; applications need a real
signal/reaping/quiescence strategy. Engine exec runs only while PID 1 is running and does not
restart an exec process after container restart. Thus Engine can refuse a cold guest probe
without waking the container, while sbx exec automatically starts one. `pause` freezes processes;
it is not blobot's stop-and-release-compute sleep or a durable session checkpoint.
[Stop](https://docs.docker.com/reference/cli/docker/container/stop/),
[exec](https://docs.docker.com/reference/cli/docker/container/exec/),
[pause](https://docs.docker.com/reference/cli/docker/container/pause/). [DOC/INF]

With Engine, process/container state, creation time, image source ID, resource configuration,
mounts, labels and security/network configuration are inspectable through the versioned API.
Those are substantially better adoption inputs than sbx RC5's list. Select only required fields:
full inspect output can also include environment values. An image source ID is not attestation
of today's writable filesystem, and volume names/labels are not unforgeable identity against
someone controlling the daemon. Persist engine/context binding and ownership receipts; compare
current facts, refuse mismatches, and never adopt by a familiar name alone.
[Inspect API/schema](https://docs.docker.com/reference/api/engine/version/v1.55.yaml). [DOC/INF]

Engine events can drive power observations, but only the last 256 events are retained; reconnect
must reconcile a snapshot, not trust an unbroken event log. Resource stats are cgroup metrics:
the CLI subtracts inactive file cache while the API exposes raw fields; neither is host-side
Mac VM RSS. Stopped containers provide no running stats, not proof that shared engine/image
caches have zero cost.
[Events](https://docs.docker.com/reference/cli/docker/system/events/),
[stats](https://docs.docker.com/reference/cli/docker/container/stats/). [DOC/INF]

Failure cases the adapter must handle under either engine:

| Failure | Native help | Remaining blobot obligation |
| --- | --- | --- |
| App dies but engine/guest lives | Engine retains object; sbx retains sandbox according to engine lifecycle | Reconcile owned identity; do not infer Agent activity/login from running power; reconnect ACP or explicitly reopen its latest session |
| Create succeeds but caller times out before recording ID | Engine can enumerate labelled objects; sbx list is narrower | Journal intended ownership before creation; quarantine ambiguous/duplicate candidates, not sweep by prefix |
| Update returns error or app loses connection | Engine inspect/update events; sbx journal and guest observations | Resolve actual limits and data binding before work; do not mark the UI applied optimistically |
| Replacement interrupted | Engine old volumes/object can remain; sbx independent original is retained | One active writer, explicit operation phases, idempotent reconcile, preserve partial candidate for diagnosis or narrowly authorized cleanup |
| Original missing / same-name object appears | Engine ID and config; sbx registered UUID plus limited guest checks | Refuse silent fresh replacement that loses data; do not mistake name reuse for restore |
| Guest/VM or host crashes | Persisted files can survive, processes do not | Database/application crash recovery and provider session validity remain unverified |
| User deletes an Agent | Both have native removal commands | Preserve the AgentWorkspace/work product first; remove only verified owned resources and report retained data |

These are engineering requirements, not claims that either engine guarantees data durability
through host power loss. Current `SbxRegistry` journals and leases quarantine interruption/stale
leases; an explicit recovery UI, completed deletion and data accounting remain unfinished.
`OwnedSbxMachine.destroy()` refuses and `measure()` returns null.
[Registry](../../../packages/core/src/machines/sbx/registry.ts),
[owned lifecycle](../../../packages/core/src/machines/sbx/owned-machine.ts). [CODE/INF]

Engine daemon termination normally stops containers. Opt-in live restore can leave them running
through daemon outages, with upgrade/configuration limits and possible log-buffer blockage.
It does not preserve an ACP client connection. Restart policies are separate: `always` may
restart a manually stopped container on daemon restart; `unless-stopped` differs. Neither is
an hours-idle timer or a message wake policy. Do not enable shared live-restore/restart settings
or let automatic restart defeat user sleep without a product decision.
[Live restore](https://docs.docker.com/engine/daemon/live-restore/),
[restart policies](https://docs.docker.com/engine/containers/start-containers-automatically/). [DOC/INF]

Engine has a documented REST API, version negotiation and compatibility matrix; deployment
still needs a minimum supported daemon/cgroup profile and fixture tests. This is a stronger
public integration surface than pinning RC5 CLI JSON shapes whose subtleties already caused
admission failures. It is not permission to assume every daemon exposing Docker-compatible
commands has identical behavior.
[Engine API contract](https://docs.docker.com/reference/api/engine/),
[RC5 JSON regressions](14-sbx-mailbox-lifecycle.md#production-lifecycle-regression-measured-later-the-same-day). [DOC/OBS/INF]

## Measurements and limitations

**Initial local Engine result: unavailable. Superseded by the authorized follow-up below:**
Guillermo opened Docker Desktop himself after the measurement request. No shared setting was
changed. Initial client-only inspection was not evidence of server capabilities; the following
fixture establishes the actual server and bounded primitive behavior, not full-Agent performance.

### Authorized Mac fixtures — 2026-09-05, 15:05 UTC [OBS]

Reproduction and raw evidence:
[Engine script](18-engine-fixture.mjs), [Engine results](18-engine-fixture-results.json),
[sbx script](19-sbx-fixture.mjs), [sbx results](19-sbx-fixture-results.json).
Both are explicit opt-in scripts using cached images only. The sbx script imports core's
built `copySbxData`, matching the unchanged implementation reviewed above.

Engine: Desktop **4.81.0 (232925)**, Engine **29.6.1**, API **1.55**, Linux
**6.12.76-linuxkit arm64**, cgroup **v2/cgroupfs**, 12 CPUs and **8,321,232,896 bytes**
of shared VM memory reported by Engine. Used cached `redis:7-alpine` by immutable image ID,
overriding its entrypoint to a shell; **Redis was never started**. UID 0 with no capabilities,
no-new-privileges, network none, no host mounts, two private named volumes. Two existing user
containers were exited before the fixture and remained exited with the same IDs afterwards.

sbx: pinned **RC5**, Linux **7.0.12**, cached shell image with blobot's root kit, two private
512 MiB volumes, forwarding already disabled. No vendor credential kit, host Workspace or
new network allow. UID 0 matches the Engine primitive fixture, **not production Agent UID 1000**.
Initial sbx inventory was empty; only the two measured boxes ran during this test. The Engine
fixture finished and cleaned up before the sbx fixture started.

Both began at 2 CPUs/2 GiB and used shell `true`, a 64 MiB zero-filled payload plus 256 small
files, synthetic home state, and a 32 MiB tmpfs allocation/release. Images, PID 1 behavior,
guest kernels and shell/hash implementations differ. Engine's shared VM was already awake;
no Desktop Resource Saver wake or uncached download was measured. **These are mechanism/cost
fixtures, not equivalent full Agents or equivalent isolation configurations.**

| Operation | Engine fixture | sbx fixture |
| --- | --- | --- |
| Cached create | 43.84–50.95 ms, create only | 3,108.51 ms initial / 2,460.42 ms replacement, includes VM startup |
| Stopped object → shell `true`, 3 samples | 119.01 / 119.66 / 168.90 ms, start plus exec | 857.68 / 878.01 / 884.52 ms, exec starts VM |
| Stop, first 3 samples | 33.53–36.68 ms | 5,205.24–5,218.99 ms |
| Same-ID live CPU/RAM update | 29.22 ms, verified | No new resize route; prior RC5 refusal still applies |
| Verified two-tree copy, 64 MiB + 256 files | Not needed for native update/reuse | 1,538.42 ms, 67,655,680 archive bytes |

Create rows have different semantics; they are not directly comparable startup totals. Stop
depends on PID 1/engine behavior; the roughly five-second sbx stop was repeatable here but its
internal cause was not diagnosed. It is not the older v0.39 stop figure. Copy timing excludes
creation, surrounding stops and full lifecycle admission; it is **not total resize time**.
Eight hashes of the payload took 1.56 s / 2.38 s respectively; differing implementations make
this unsuitable as an Engine-versus-microVM CPU-performance ratio.

**Effective updates:** Engine kept the same running container ID across 1 CPU/2 GiB →
2 CPUs/3 GiB. Both inspect and cgroup files reflected the new limits (`cpu.max` 200000/100000,
`memory.max` 3221225472, swap zero). A 1 MiB RAM limit was rejected without changing the
recorded limits or running state. Updating while stopped to 1 CPU/2 GiB persisted on wake.
This did not test lowering RAM beneath actual usage, OOM recovery or a busy provider.

**Persistence:** both fixtures passed stop/wake and replacement verification. Engine preserved
file hashes and metadata using the original volumes, including after removing the original
container. Writing through the replacement changed what the retained original saw: **not a
data rollback**. sbx's copied target preserved the two trees across restart; target writes did
not change its separately retained original. Neither fixture used real login/session files.

**Memory, with unlike accounting kept separate:** Engine's empty shell cgroup reported
2,277,376 bytes. Before/held/after the 32 MiB tmpfs test: 2,580,480 / 35,684,352 / 2,232,320
bytes, despite its 2 GiB maximum. These are container cgroup readings, not total Mac RAM.
Docker.app process RSS is recorded separately in the raw phases. The Apple VirtualMachine XPC
candidate grew from 369,856 to 735,056 KiB over the run, but had PPID 1 and was **not reliably
attributed**; it is not assigned to Docker or an Agent. No complete Desktop memory-footprint
or memory-reclamation ratio is claimed, and stopping containers did not stop Desktop.

sbx's one empty VM shim reported **721,088 KiB (~704 MiB) RSS**. After data/reboots, before/
held/after tmpfs: 629,312 / 885,552 / 893,808 KiB. Guest Shmem fell after removal, but host RSS
did not immediately fall. With two VMs (2 CPU/2 GiB source, 3 CPU/3 GiB target), aggregate shim
RSS was 1,291,072 KiB before copying and 1,483,488 KiB afterwards; no shim remained after both
stopped. Aggregate identity is justified by the empty initial inventory and exact two owned
boxes, not by pretending sandbox UUIDs match process IDs. Daemon/device overhead is additional.
Comparing these shim readings directly with Engine's tiny shell cgroup would be misleading.

The Engine peer observation used a 1-CPU source and 2-CPU empty peer, without data volumes on
the peer; neither two-object observation is a controlled concurrency-scaling benchmark.
Representative multi-Agent memory pressure, physical disk peaks, large Workspaces, provider
startup and full admission latency remain unmeasured. All checks passed; exact disposable
containers, volumes and sbx boxes were removed, with no shared configuration changed.

Prior sbx evidence, without rerunning or relabelling versions:

| Measurement | Environment and result | What it does not establish |
| --- | --- | --- |
| First cached/uncached creation | v0.39.0 Mac: shell first pull/create 33.97 s, cached clone create 3.9 s | Equivalent image/setup or RC5 creation latency |
| Stopped wake / subsequent exec | Same v0.39.0: 0.99 s / 0.21 s | Full blobot before-work checks or provider startup |
| Guest allocation/release | RC5 2 vCPUs / 4 GiB: shim ~781 MiB initially, ~1,184 MiB touched, ~957 MiB three seconds after exit; absent after stop | Aggregate host-RSS bound, pressure behavior, reliable per-box attribution with N boxes |
| Copy mechanism | RC5 two private-volume fixtures: 30,720 archive bytes in ~980 ms incl source startup | Representative Workspace throughput, SQLite/login resume or disk-full behavior |
| Staged integration | RC5 final two-Machine lifecycle plus observations: 14 passing tests in 120.62 s | 120.62 s per user operation; tests contain many transitions/assertions |

Sources: [first sbx box](08-the-first-box-sbx.md#4-cost),
[resource fixture](11-sbx-resource-limits.md#subsequent-implementing-session-measurement--macos-rc5),
[copy fixture](12-sbx-volume-reattachment.md#live-validation--parent-session-2026-09-05),
[final staged build record](../build.md). [OBS]

Desktop Resource Saver is **whole-VM** behavior: after no containers run for the configured
period (documented default five minutes), it stops the Linux VM. The vendor gives approximately
3–10 seconds for VM wake, not our measurement. One idle keepalive container can prevent that
condition. Per-Agent sleep can therefore reclaim a container while the shared VM remains
because another Agent or unrelated container runs.
[Resource Saver](https://docs.docker.com/desktop/use-desktop/resource-saver/). [DOC/INF]

Engine shares immutable image layers and a Linux kernel across containers. sbx documents separate
inner Docker state/caches and added per-VM/daemon overhead. This supports a **directional
hypothesis** of cheaper additional ordinary containers, not a measured winning ratio; nested
Docker, per-Agent proxies and additional isolation can materially change it.
[Engine layer sharing](https://docs.docker.com/engine/storage/drivers/),
[sbx storage/overhead](https://docs.docker.com/ai/sandboxes/architecture/). [DOC/INF]

A decision-quality performance follow-up should keep the same native architecture, user/paths,
synthetic workload, data volume contents, concurrency and isolation services, then report:

1. Empty engine baseline, cached create, first exec, repeated stop/wake, and a separate uncached
   image acquisition cost. Record actual guest/server versions and configured shared-VM capacity.
2. Idle, bounded CPU, touched-memory, freed-memory and stopped phases; separate container cgroup
   accounting from Mac engine-process RSS and total attributable engine overhead. Never match
   an sbx UUID to a shim's different ID or turn attribution failure into zero usage.
3. One and several simultaneous Agents; latency/distributions and whole-host pressure, not
   the sum of configured RAM as “used.” Include Desktop VM wake and foreign-work interference.
4. Same-ID live/stopped limit update and refused update readback; controlled low-memory failure
   only in a disposable fixture. Include complete blobot admission plus CLI session startup,
   not raw exec alone.
5. Replacement with representative file counts/data, verified metadata, bounded cancellation,
   original/replacement state, physical disk peaks and temporary concurrent-guest memory.

Current sbx copy entails data-size-dependent work, another set of destination volumes and two
guest executions while transferring; retaining successive originals accumulates storage until
a preservation-aware cleanup policy exists. Engine volume reuse removes that mandatory copy
for compatible replacement but not backup cost where historical rollback is required. Neither
candidate has a measured representative disk/time budget here. [CODE/INF]

## Reuse and remaining implementation cost

| Current area | Reusable with Engine | Work replaced or still needed |
| --- | --- | --- |
| Machine, local execution and transport interfaces | Agent-bound lifecycle/spawn boundary, provider-agnostic callers, no silent fallback | New Engine implementation and its admission; factory/adapter box guards remain until complete |
| SleepingRuntime, TeamPool holds, idle preference and power-dot UI | Activity protections, hours timer, message wake, latest session, separate power state | New observed-power source; hot-update policy is an additional path, not already implemented |
| Scoped runtime detection/remedies | Existing CLI parsers and guest-runner seam, cold-unknown semantics, post-remedy checks | `DetectionSubject`/engine result currently names `sbx`; Engine readiness and guest execution binding change |
| Framed stdin transport and environment separation | Framing approach, bounded I/O, guest/host environment separation | sbx argv/client wrapper becomes Engine exec/API; cancellation and detached-process lifetime need tests |
| SbxRegistry and OwnedSbxMachine | Transaction/lease/ownership concepts, fail-closed recovery requirements | Concrete schema is sbx-specific: kit, guest boundary baseline, policy IDs, retained copies; not a drop-in generic registry |
| Copy-based limit edits | Verification techniques useful for migration/backup | Native update removes default resize copying; direct reuse simplifies compatible replacement, with different rollback semantics |
| Remaining feature work | Image contents, CLI install/login/resume, Workspace/branch transfer, UI activation, preservation-first deletion | Remains under either engine; egress and inner Docker cost cannot be discarded from the comparison |

Source audit: [Machine](../../../packages/core/src/machines/machine.ts),
[sleep](../../../packages/core/src/machines/sleeping-runtime.ts),
[scoped detection](../../../packages/core/src/detect/machine-runtime.ts),
[sbx transport](../../../packages/core/src/machines/sbx/transport.ts),
[registry](../../../packages/core/src/machines/sbx/registry.ts),
[current activation boundary](../build.md). [CODE]

Engine reduces specific remaining lifecycle machinery and offers better observability, but adds
a new adapter plus Mac host-engine setup and requires settling the isolation/egress/inner-Docker
requirements. sbx retains substantial tested scaffolding, but copy-resize recovery, volume
inventory, production RC policy and limited inspection remain real costs. No LOC count or
already-spent effort establishes the cheaper route to a complete product. [INF]

## Facts the reevaluation must keep open

- Equivalent full-Agent performance and supported Linux-host behavior are unmeasured; no hard host
  memory/CPU aggregate promise follows from either candidate's per-Machine settings.
- All persistent paths, particularly system-installed tools and inner Docker, need an explicit
  preservation contract. Two volumes currently do not cover every mutable guest path.
- Native Engine hot updates still need verified failure semantics on the chosen daemon/cgroup
  profile and a decision about disruption; a low cap can end a Turn without a restart.
- Data rollback after shared-volume reuse, orphan retention/deletion, and crash recovery are
  application obligations. Direct attachment is a simplification, not a transaction.
- Real CLI login/session reopening, image upgrades and Workspace preservation remain production
  gates under either engine.
- A switch cannot be justified on lifecycle convenience alone if it loses the chosen boundary,
  scoped mailbox/egress, or useful inner Docker. Read the companion investigation before the HITL
  reevaluation. Research authorizes neither migration nor removal of the current guards.
