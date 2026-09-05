# Explicit Docker storage works; a warm exec still starts Docker

2026-09-05. Live follow-up to [the RC5 label analysis](25-start-docker-label-static.md).
The label-only derivative validates the approved 8 GiB home and 20 GiB private Docker
block devices, but does not pass the independent-exec quiescence gate. This is an arm64
measurement; amd64 parity remains unmeasured.

## Candidate and bounded fixture

The parent supplied `blobot-machine-probe:explicit-docker-20260905`, manifest
`sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c`, exported to
`/private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar`. Its build changes only
`LABEL com.docker.sandboxes.start-docker="false"` from the approved pinned shell-docker
base. That build provenance is supplied by the parent; this fixture verifies the loaded
manifest prefix and measures runtime behavior, rather than independently rebuilding it.

[Script](28-explicit-docker-fixture.mjs) and [full results](28-explicit-docker-fixture-results.json)
record RC5 client/server revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, one
UUID-owned 2 CPU/2 GiB sandbox, and a root kit declaring:

- `security.privileged: true`;
- `/home/agent` block volume `8589934592` bytes;
- `/var/lib/docker` block volume `21474836480` bytes;
- an empty 512 MiB `/workspace` volume retained only from the earlier validated fixture;
- no `setup.startup`, credentials, allowed/denied network entries or host data mounts.

The documented v2 schema permits explicit block-volume sizes and top-level privileged
settings. [Official kit reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/)
The temporary `/workspace` is not the product's host-worktree arrangement.

The CLI used a filtered client environment and verified SSH forwarding was already false;
it changed no global setting or daemon. It loaded the supplied tar, pulled no image,
created no inner Docker workload and performed no snapshot or private-data copy. The
loaded candidate and sandbox were both absent initially and were removed by exact name
and recorded identity. Final cleanup lists are empty; the parent's supplied tar remains.

## Observations

Both declared paths have **exactly one** mount. Their actual block-device sizes come from
`/sys/dev/block/<major>:<minor>/size × 512`, separately from `statfs` filesystem accounting.

| Path | Device | Block bytes | Filesystem bytes | Initially available bytes |
| --- | --- | ---: | ---: | ---: |
| `/home/agent` | `/dev/vdd` | 8,589,934,592 | 8,350,298,112 | 7,903,981,568 |
| `/var/lib/docker` | `/dev/vdf` | 21,474,836,480 | 20,957,446,144 | 19,866,050,560 |

Thus the unwanted stacked automatic Docker mount is absent. The lower filesystem totals
and available counts are recorded directly; neither equals the raw device capacity.
These are virtual block capacities, not a measurement of physical host disk consumption
or a total-sandbox quota: the root filesystem is separately mounted.

Root reports `CapEff`, `CapPrm` and `CapBnd` `000001ffffffffff`, matching all capabilities
through `cap_last_cap=40`; `Seccomp=0` and `NoNewPrivs=0`. This measures the root process's
effective privileges inside the guest, not the host/guest isolation boundary or UID1000
Docker socket access. The earlier UID1000 observation remains in
[research24](24-private-docker-preservation-gate.md).

Docker **29.7.2 is ready despite the false label and absent startup hook**. Its root is
`/var/lib/docker`, driver `overlayfs`, and driver type `io.containerd.snapshotter.v1`.
`dockerd` has no command-line flags and `/etc/docker/daemon.json` is absent. Its managed
containerd config still uses `/var/lib/docker/containerd/daemon` for durable data and
`/var/run/docker/containerd/daemon` for transient state. The complete generated config is
in the results. The clean-boot policy log contains empty allowed/blocked host lists.

Before stopping the daemons, the fixture verified there were no Docker containers and
live restore was false. It verified PID, command name and process start tick before each
SIGTERM, waited for all observed Docker/containerd processes to disappear, and synced.
The same exec reported an empty process list. A separate subsequent exec then observed:

| Evidence | Before termination | After independent exec |
| --- | --- | --- |
| `dockerd` PID | 112 | 377 |
| `containerd` PID | 119 | 385 |
| Boot ID | `8875a8d5-726d-4197-810f-a48297797f72` | unchanged |
| PID1 start tick | 8 | unchanged |
| Docker API | ready | ready |

This reproduces daemon reactivation **without a VM reboot**, now with the false-label
candidate. The distinction predicted in research25 is confirmed: the label controls the
automatic DinD customizers, while the binary-presence-based readiness path still starts
Docker. Adding a startup hook would not fix this measured gate.

## Remaining gate

The fixture completed successfully as a measurement, with
`preservationGatePassed: false`. It does not establish safe copying or preservation of
Docker images, writable container layers or named volumes. Before production can copy
private storage, a maintenance strategy must prevent these writers throughout the
operation. One precise next experiment is a single held exec per guest that terminates
writers, transfers and verifies data inside that same process, with no intervening
`sbx exec`; that strategy is proposed, not implemented or validated here.

Measured times were 2.76 s load, 3.01 s create, 1.33 s graceful quiescence and 0.90 s warm
exec. The tiny empty fixture does not represent migration cost or real Agent workloads.
The accepted base and capacities do not independently approve a snapshot retention or
activation policy.
