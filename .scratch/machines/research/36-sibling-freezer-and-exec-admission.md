# A VM-local maintenance sibling freezes existing writers and rejects new sbx execs

2026-09-05, arm64 Mac with sbx RC5. Moving the held maintenance worker into a new
VM-local sibling cgroup and freezing the complete original container cgroup closes
the ordinary `sbx exec` admission gap observed in research35. The tested concurrent
exec is **rejected while paused**, rather than queued; retry after thaw succeeds.
The worker can continue reading/archiving, and external stop/reopen recovers the
original after deliberate worker death with the container still frozen.

This validates a bounded maintenance mechanism on this engine/platform. It does not
yet compose complete rootfs transfer, isolated mount views, two-guest cutover and
durable application recovery into a production migration.

## Evidence and VM-local ownership

[Fixture](36-sibling-freezer-fixture.mjs), [worker](36-sibling-freezer-worker.cjs),
[completed result](36-sibling-freezer-results.json) and
[initial fixture-expectation failure](36-sibling-freezer-first-results.json) are the
primary live evidence. The completed run is UUID
`c3e7af71-1696-4cac-a1c5-d54ca0bf317b`, starting `2026-09-05T19:45:26.490Z`.
It uses the same approved label-only candidate as research35 and client/server
revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`.

Docker documents that each sandbox has its own Linux kernel and microVM; in-VM root
privilege does not remove that hypervisor boundary.
[Docker isolation model](https://docs.docker.com/ai/sandboxes/security/isolation/)
Before mutation, the fixture establishes:

- Host process: `darwin`, `arm64`; guest: Linux `7.0.12`, `arm64`, with its own recorded
  boot ID. The fixture refuses a non-Darwin host, so this result does not assume the
  same cgroup visibility on a physical Linux host.
- Worker and guest PID1 both belong to `/docker/<container-id>`. The root overlay's
  `/run/bundles/<container-id>/...` path contains the same ID.
- `/sys/fs/cgroup` is a guest `cgroup2` mount. Its `/docker` parent contains exactly
  this one container child before the experiment. The visible cgroup namespace is
  `cgroup:[4026531835]`, and the guest PID namespace is recorded separately.
- Parent and container groups have type `domain`; the parent already enables
  `cpuset cpu io memory hugetlb pids`, while the container's subtree-control list is
  empty. Those values are read, never changed.

The cgroup filesystem and its parent here belong to the sandbox's Linux microVM,
not the Darwin host. The mutation is limited to creating/removing
`/sys/fs/cgroup/docker/blobot-maintenance36-<uuid>`, moving **only the worker** into
and out of it, and changing `cgroup.freeze` for the original container. No ancestor
or other sibling group, controller or limit is modified. No physical-host cgroup
path is read or written.

## Actual exec placement and admission

A benign `sbx exec` before freezing reports `/docker/<container-id>`, matching PID1
and the worker's original group. This is measured through sbx, not inferred merely
from the guest's bundled Docker/runc executable.

Upstream runc documents the container's top-level cgroup as its default exec target,
with an init-cgroup fallback on cgroup v2. It also documents that exec into a paused
container normally errors; `--ignore-paused` changes that behavior. The particular
outer-runtime binary build used by RC5 was not independently identified here.
[runc exec reference](https://github.com/opencontainers/runc/blob/main/man/runc-exec.8.md)

The worker creates its sibling, moves itself there, verifies original PID1 remains
in the container group, freezes that entire original group and waits for
`cgroup.events` to acknowledge `frozen 1`. Kernel freezing applies to a cgroup and its
descendants; the acknowledgement is required before relying on the pause.
[Kernel cgroup v2 documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html)

The original group then contains PID1 `tini`, `sh`, `sleep`, `clipboard-bridg` and an
existing synthetic counter writer; the maintenance group contains only the worker.
The host launches a real concurrent `sbx exec` whose payload would write a UUID-owned
marker and report its own cgroup.

| Observation | Result |
| --- | --- |
| Existing counter at freeze | `4` |
| Concurrent sbx exec | Exit 127 in 189.9 ms; runtime says container is paused |
| Marker during freeze | Absent |
| New PIDs in frozen container group | None observed |
| Existing counter after wait and archive | Still `4` |
| Worker archive while container frozen | 47,001,600 bytes, completed successfully |
| Counter after thaw | `6` |
| Repeated sbx exec after thaw | Exit 0; marker written; original container cgroup |

The archive hash was
`7bd6ca21069a548ddee018aefa5bd289c70fa8defba6fe72477637c9d8af8604`.
Its paths are the previously measured synthetic rootfs trees, package database and
private volumes from research35. This experiment reads/hashes them during freezing;
it does not transfer the complete rootfs to another guest.

The initial run incorrectly asserted that the concurrent exec must remain pending.
It ended when the CLI completed early; its report is retained and cleanup was complete.
The repeat records the result before interpreting it and establishes safe rejection.
No claim is made that the rejected command resumes automatically: a new retry is
required after thaw. Application-owned operations should already be serialized around
maintenance; an unrelated user's exec may receive this paused-container error.

## Normal thaw and worker-death recovery

Normal thaw writes `0` only to the original container's freezer, waits for `frozen 0`,
returns the worker to its original group and removes the now-empty owned sibling.
The existing writer resumes, and retrying the external exec succeeds. Docker may
restart as part of that exec's ordinary readiness path; the maintenance guard stops
claiming quiescence before thaw permits it. Measured original package/home/Docker
state remains intact.

For the failure path, the fixture quiesces Docker again, recreates the sibling, moves
only the worker, freezes the original group and deliberately exits the worker with
code 75 **without thawing**. External `sbx stop` completes in 5.32 seconds. Reopening
the same original sandbox yields:

- a new boot ID;
- original container `frozen 0`;
- no maintenance sibling;
- the same measured rootfs metadata/content, package state, home and Docker state.

This proves a recovery route for that particular worker-death state. The worker does
not need to survive to thaw the VM manually. Host application death, power loss,
interrupted restores, cancellation at every operation boundary, concurrent engine
stop/removal and a durable cutover journal remain separate tests/implementation work.

## Limits and production implications

This mechanism improves research35's child-freezer result: ordinary new sbx execs
cannot enter an unfrozen control cgroup in the measured configuration. The privileged
maintenance process and its deliberately spawned helpers are the only admitted work
outside the frozen original group. It does not authorize unrelated maintenance helpers
or concurrent user work there.

The scope is the original container and descendants, not every process in the VM.
VM engine services can still operate outside that group; full-rootfs verification must
account for engine-owned writes/injection. Privileged cgroup reconfiguration by another
control plane, alternate exec options, another engine release and amd64/Linux-host
behavior were not exercised. Freeze is also not an application-level transaction
checkpoint: Docker was gracefully quiesced first, and arbitrary application databases
still need their own coherent stop/recovery semantics.

The new sibling inherits the parent's defaults, not per-container limits configured
only on the original cgroup. VM CPU/RAM boundaries remain, but maintenance-specific
resource accounting and bounds need to be handled explicitly in production. This
experiment changes no cgroup limit to compensate.

The remaining composition is concrete: original-image candidate creation, owned
maintenance siblings, complete-container pause with checked exec rejection, isolated
non-recursive rootfs views, authoritative content/metadata/absence transfer, and
verification after stop/reopen before any durable active-reference change. None of
those final migration or retention semantics is implemented by this research file.

## Cleanup and reproduction

Both runs remove their exact UUID-owned sandbox and the supplied candidate template
loaded by that run. All cleanup lists are empty. Final independent inventory contains
no sandboxes and only pre-existing vendor `claude-code-docker` (`94670d5b2a24`) and
`shell-docker` (`5fc81bc7a127`) templates. The approved tar remains. The 2 GiB disk guard
stayed satisfied; final available host space was 8.3 GiB.

No host data mount, credential, login, inference, registry pull, real Agent snapshot,
global setting or production change was involved. The fixture and worker pass
`node --check`.

```sh
BLOBOT_LIVE_SBX_ROOTFS=1 node .scratch/machines/research/36-sibling-freezer-fixture.mjs \
  /private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar \
  blobot-machine-probe:explicit-docker-20260905 \
  sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c
```

Require exclusive sbx use and this measured Darwin/arm64 environment. No production,
tracker or commit change accompanies this research.
