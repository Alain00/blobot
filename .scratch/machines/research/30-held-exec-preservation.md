# Held exec preserves private Docker data; rootfs mtime precision still fails

2026-09-05. The held-exec strategy passes the synthetic private-volume copy experiment
on arm64 RC5. **The complete preservation gate remains failed:** saving the stopped
root filesystem as a template truncates a modified conffile's subsecond mtime. The
fixture exits 1 and reports `passed: false`, `heldExecCopyPassed: true`; this is not a
production reconfiguration admission.

## Evidence and scope

Primary evidence is the executable [host fixture](30-held-exec-fixture.mjs), its
[guest worker](30-held-exec-worker.cjs), the [first failed measurement](30-held-exec-fixture-first-results.json)
and the [completed private-copy measurement](30-held-exec-fixture-results.json).
The latter ran at `2026-09-05T19:11:39.629Z`, UUID
`f544d47d-e4fd-4e95-9371-fec2c0d7006d`. Both client and server used revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a` (`v0.42.0-rc5`).

It used the same parent-supplied label-only candidate as
[research28](28-explicit-docker-volumes-and-quiescence.md):
`blobot-machine-probe:explicit-docker-20260905`, manifest
`sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c`, with
`com.docker.sandboxes.start-docker="false"` over the approved pinned shell-docker base.
The fixture validates the loaded manifest prefix; it does not independently rebuild
the supplied tar. It exercises this base-derived candidate, not all five runtime images.

Both root kits declare privileged mode, one 8 GiB home block device, one 20 GiB private
Docker block device and a temporary 512 MiB `/workspace` volume. The v2 grammar supports
these explicit security and volume fields.
[Official kit reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/)
Actual mount counts and raw block capacities are asserted in the guest, separately
from filesystem free space. This temporary workspace does not exercise the product's
host worktree or shared Git metadata arrangement.

Everything seeded is synthetic: one locally constructed `.deb`, a modified conffile,
four home entries, an inner image imported from guest-provided shell/sleep binaries,
one stopped container and one named volume. There were no registry pulls, host data
mounts, credentials, real login, inference or global setting changes. SSH forwarding
was checked false. No scoped network log was measured here; research29 owns that test.

## Copy procedure and observations

1. Create the source with 2 CPU/2 GiB. Install the synthetic package and create the
   home and Docker state. Stop the inner container explicitly.
2. In one maintained root exec, verify live restore is false, terminate the verified
   `dockerd` PID/start tick, wait for exit, terminate any remaining verified containerd,
   verify no Docker/containerd processes or nested private mounts remain, and sync.
3. Close that seed exec, stop the source VM, and save its rootfs to a UUID-owned local
   template. The source remains stopped after save.
4. Reopen the source through one maintained exec and quiesce again: reopening can
   start Docker, as research28 established. Create a 3 CPU/3 GiB candidate from the
   saved rootfs and give it its own maintained exec; quiesce its Docker likewise.
5. Keep those same two exec processes throughout archive, relay and verification.
   Archive `/home/agent` and `/var/lib/docker` with GNU tar's numeric ownership,
   xattr/ACL, sparse-file and one-filesystem options. The receiver clears only its
   two private roots before extraction. Re-archive both sides and compare SHA-256
   and exact byte counts.
6. Restart Docker inside the already maintained candidate worker. Compare the
   measured image, container, volume, home and package state; run and stop the
   restored container. Mutate only the candidate's conffile, home and named volume.
   The original private archive remains unchanged, and restarting its Docker
   recovers the original measured state.

The host relays framed opaque archive bytes through pipes/memory, with backpressure;
it neither extracts them nor writes a private archive to host disk or the report.
Frames are at most 65,536 bytes and each synthetic archive is bounded at 128 MiB.
A 100 ms monitor plus checks at archive/restore boundaries look for Docker writers;
boot ID, PID1 start tick and worker PID remain unchanged throughout each maintenance
interval. No additional guest exec is issued within those intervals.

| Measured property | Result |
| --- | --- |
| Source resources | 2 CPU; `MemTotal` 2,066,016 KiB |
| Candidate resources | 3 CPU; `MemTotal` 3,104,752 KiB |
| Home / Docker raw block capacity | 8,589,934,592 / 21,474,836,480 bytes; one mount each |
| Docker | 29.7.2, `overlayfs`, containerd snapshotter, live restore false |
| Durable containerd root | `/var/lib/docker/containerd/daemon` |
| Private archive | 22,599,680 bytes |
| Private archive SHA-256 | `d4271ccd9b3bad253b290a50aa67d458dcb72fbf6de93e688d84da1e7305fbdf` |
| Source before/after, relay, receiver stream and re-archive | Same bytes and SHA-256 |
| Source after candidate mutation | Same original archive bytes and SHA-256 |
| Relay plus receiver completion | 123.52 ms for this tiny local fixture |
| Host RSS baseline / sampled peak | 52,887,552 / 88,948,736 bytes |
| Sampled peak ArrayBuffer bytes | 9,712,630 |

The home comparison preserves the measured UID/GID, modes, fractional `mtimeMs`,
content hashes, symlink target and hardlink relationship. The sparse file retains its
1,048,617-byte logical size with eight 512-byte allocated blocks. The synthetic
`user.blobot` xattr survives. ACL options are present, but no nontrivial ACL was seeded,
so ACL fidelity is not independently established.

The inner image ID and RootFS descriptors, stopped container ID/image/status/restart
policy/mounts, its writable-layer sentinel, and named-volume identity and sentinel
match. The restored container actually starts, runs and stops. These observations
cover the measured tiny workload, not arbitrary running containers or external mounts.

## Rootfs failure was retained, not normalized away

The first run stopped before private transfer because the saved template changed the
modified `/etc/blobot-synthetic.conf` mtime from `1788635442429.3013` to
`1788635442000` milliseconds. Content hash, size, owner and mode were unchanged.
That failed run's complete report is retained separately.

The follow-up comparison accepts this one observed difference only to reach the
independent private-copy experiment. It still records the difference, requires the
whole-second value to match, requires all other measured package fields to match,
and leaves the complete gate failed. The follow-up reproduces the truncation:

| Conffile field | Original | Saved-template candidate |
| --- | --- | --- |
| `mtimeMs` | 1788635508465.5405 | 1788635508000 |
| Package status / version / architecture | Installed / 1.0 / all | Same |
| Package conffile database entry | Original recorded value | Same |
| Conffile content, size, UID/GID and mode | Original measured values | Same |

The installed package payload was already second-aligned by package construction;
its timestamp matches. No conclusion about arbitrary rootfs xattrs, ACLs, hardlinks,
capabilities or additional package-manager state follows from these two rootfs files.
A production promise of complete writable-rootfs fidelity needs an explicit solution
and validation for the observed timestamp loss and the other required metadata.

## Cleanup and unproven boundaries

Both runs retained the original until their assertions ended, then removed only their
UUID-owned boxes and snapshot, plus the exact candidate template loaded by that run.
Every cleanup list is empty. A final independent inventory returned no sandboxes and
only the pre-existing vendor `claude-code-docker` (`94670d5b2a24`) and `shell-docker`
(`5fc81bc7a127`) templates. The supplied candidate tar remains. Host disk guards
required 2 GiB before loading/creating; the follow-up observed 7,685,681,152 bytes
before load and 7,586,627,584 before the second VM. Final available space was 7.1 GiB.

This does **not** test host/app crash recovery, power loss, interrupted transfer,
durable cutover/rollback records, a candidate stop/reopen after restoration, concurrent
executions from other clients, or other processes writing the home. The quiet check
targets the known Docker/containerd writers in this synthetic workload; it is not a
general writer exclusion mechanism. Extraction safety for hostile archive data and
large-state memory/storage/performance limits also remain unproven. No retained-data
deletion policy or production reconfigure guard was changed.

Reproduction (exclusive sbx use; intentional exit 1 while the rootfs gate fails):

```sh
BLOBOT_LIVE_SBX_HELD_EXEC=1 node .scratch/machines/research/30-held-exec-fixture.mjs \
  /private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar \
  blobot-machine-probe:explicit-docker-20260905 \
  sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c
```
