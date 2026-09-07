# Private Docker preservation: an exec restarts its daemon

2026-09-05, RC5 local on the existing Apple-silicon host. Follow-up to
[Local templates and private Docker preservation](22-local-template-and-private-docker.md).
Evidence: [executable fixture](24-private-docker-fixture.mjs) and
[raw results](24-private-docker-fixture-results.json). This is a negative mechanism result,
not a change to the chosen base, engine or preservation requirement.

## Result

**A second `sbx exec` restarted private `dockerd` and `containerd` inside the same,
already-running VM after the fixture had stopped both.** Therefore a sequence of separate
exec calls cannot assume private Docker remains stopped between its stop, digest, archive
and restore operations. The fixture refused before taking a snapshot or copying a live
store. It did not establish complete Docker preservation.

The final run began at `2026-09-05T18:30:28.984Z`. Client/server were
`v0.42.0-rc5`, revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, server API
`0.28.0`. The cached `shell-docker` inventory row had ID `5fc81bc7a127` and reported
size `588,725,040` bytes; no image layers were pulled. A UUID named the disposable
sandbox and inner Docker objects. The root kit reused blobot's validated synthetic
home/workspace fixture; `/workspace` stayed empty and is not the production Workspace
layout. There were no host mounts. No host Docker socket or process was used.

## New measured facts

| Subject | Observation |
| --- | --- |
| Docker mount | Exactly one automatic ext4 mount at `/var/lib/docker`; the kit did not declare another |
| Private Docker | Engine `29.7.2`, driver `overlayfs`, driver type `io.containerd.snapshotter.v1`, live restore `false` |
| Daemon launch | `dockerd` with no command-line flags; `/etc/docker/daemon.json` absent |
| Containerd launch | `containerd --config /var/run/docker/containerd/containerd.toml` |
| Effective containerd storage | Configured root `/var/lib/docker/containerd/daemon`; runtime state `/var/run/docker/containerd/daemon` |
| Clean-boot policy log | `blocked_hosts: []`, `allowed_hosts: []` after initial inspection, before importing the synthetic image |
| UID 1000 direct Docker | Permission denied at `/var/run/docker.sock`; process supplementary groups were only `[1000]` |
| UID 1000 through sudo | `sudo -n docker info` succeeded, reporting the same private Engine and root |

The socket had UID `0`, GID `1001`, mode `0660`; `/etc/group` included
`docker:x:1001:agent`. Membership declared in that file did not activate the group in
this numeric-UID exec. No group membership or socket permission was changed. The image
and transport acceptance must check actual process groups or the intended sudo usage;
the fixture does not select a remedy.

The effective containerd root is narrower evidence than the general Docker 29 documentation:
this image's managed containerd stores persistent data inside the automatic Docker volume.
It does not establish the layout for an independently configured daemon, external builder,
Agent-added bind mount or future image version. The general alternatives remain documented
in [Docker daemon data directories](https://docs.docker.com/engine/daemon/#daemon-data-directory).

The empty policy log is one observed clean boot, not a guarantee of no later background
traffic. It distinguishes this root kit from older built-in agent-kit probes; no policy
setting was changed to obtain it.

## Synthetic workload and the failed gate

Inside the owned guest, the fixture copied its existing `dash`, `sleep` and required
shared libraries into a temporary image filesystem and added its own tiny shell script.
Guest `tar` streamed directly into guest `docker import`, with no registry pull or host
archive. A named volume was attached to a container from that image. The container ran,
wrote a named-volume sentinel and a container-layer sentinel, and was explicitly stopped
with its existing `unless-stopped` restart policy. Image/container IDs, layer digest,
volume path and the accessible sentinel hashes/modes/owners are recorded in `before`.
Synthetic system and home markers were also created. No provider or real session ran.

The quiescence command verified no containers were running and live restore was disabled.
It identified private daemon processes from the guest's `/proc`, verified each PID's
command and start time before signalling, sent `SIGTERM`, waited for all Docker/containerd
processes to disappear, and synced the guest filesystem. It never signalled host processes.

The independent exec then observed:

| Measurement | Before termination | After termination, same exec | Next independent exec |
| --- | --- | --- | --- |
| dockerd PID | `112` | absent | `626` |
| containerd PID | `119` | absent | `633` |
| Boot ID | `880ae97e-c8b9-4fe5-b00b-593e1ddad1fb` | same | same |
| PID 1 start time | `6` | same | same |
| Docker API | available | writers absent | available again |

Stopping the private processes took about `1.35 s`; the next exec, including automatic
daemon restart and inspection, took about `0.82 s`. These are tiny mechanism timings,
not full-Agent latency. The same reactivation was seen in the preceding attempt; the
final replay added explicit capture of both process inventories and boot identity.

The fixture result is intentionally `passed: false` with
`independentWarmExecKeepsDockerStopped: false`. Its later snapshot/copy/restart code was
**not executed**. There are no claims about restored Docker IDs, snapshots, data hashes,
container usability or original/replacement independence from this run.

## Consequence and remaining investigation

The existing [copy helper](../../../packages/core/src/machines/sbx/data-transfer.ts)
performs several separate `sbx exec` operations and only copies home plus the legacy
workspace. Extending its path list alone would not solve this newly measured daemon
restart. Keep the existing mounted-Workspace reconfiguration refusal.

A possible next experiment is one long-running maintenance exec per guest: quiesce inside
that process, transfer and verify while that same process remains alive, and avoid another
`sbx exec` until restoration finishes. That is an **unverified proposal**, requiring a
framed handshake, cancellation/recovery behavior, and proof that no engine lifecycle event
restarts services during transfer. This result also does not rule out an upstream-supported
maintenance mechanism; none has been established here. Do not infer a safe copy by hiding
the daemon executable or changing Agent restart policies.

The approved base does not authorize durable snapshots of real private Agent state.
Snapshot retention and the preservation boundary remain a separate decision even if a
future synthetic transfer succeeds.

## Reproduction and cleanup

```text
BLOBOT_LIVE_SBX_PRIVATE_DOCKER=1 node .scratch/machines/research/24-private-docker-fixture.mjs
```

The script checks matching RC5 peers, an already-running daemon, an empty initial sbx
inventory, cached shell image and disabled SSH forwarding without changing those settings.
The raw result includes earlier attempts: initial custom-kit creation failed and was
cleaned up; switching to the previously validated fixture kit and a shorter name allowed
creation, without diagnosing that first failure. Another attempt stopped on direct
UID-1000 socket denial; the revised probe records direct and sudo outcomes separately.
All attempts removed their exact owned boxes; no template was created. Final cleanup
reported no errors and no remaining owned boxes or templates. No daemon configuration,
host archive, provider login, paid inference or production code was changed.
