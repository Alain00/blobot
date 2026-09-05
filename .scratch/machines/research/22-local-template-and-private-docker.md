# Local templates and private Docker preservation

2026-09-05. Follow-up to [Image decision frontier after host worktrees](21-image-decision-frontier.md),
for [The image: one per runtime](../issues/13-the-image-one-per-runtime.md).
This note adds mechanism evidence; it chooses neither the release base nor a migration policy.
The preservation authorization remains in
[A box's lifecycle, engine setup, and the pool](../issues/19-a-box-lifecycle-and-engine-setup.md#2026-09-05--copy-migration-approved-guillermo).

## Result

**Local `template save` preserved four root-filesystem sentinels but did not restore any
of four private-volume sentinels when a new sandbox declared the same volume paths.**
It is a demonstrated ingredient for preserving system files, not a whole-Machine backup.
The coordinating session ran the synthetic fixture; this researcher reviewed its
[script](22-template-fixture.mjs) and [raw result](22-template-fixture-results.json).
The measured root kit also started private Docker without declaring a startup hook or
`security.privileged`. Adding its own `/var/lib/docker` volume produced **two stacked
mounts at that path**, so production must not blindly add a second Docker volume.

Evidence labels below: **DOC** = primary documentation; **STATIC** = installed CLI or
public OCI metadata read without execution; **OBS** = the coordinating session's fixture;
**INFERENCE** = consequence requiring further validation. No provider login, real host
Workspace, credential import, paid inference, image-layer download or shared daemon
configuration change was performed for this investigation. During this session Guillermo
accepted the proposed pinned common `shell-docker` base; the coordinating session records
that decision in the image ticket. That approval does not select a snapshot lifecycle.
Prior lifecycle comparisons belong to
[Docker Engine and sbx: lifecycle, persistence and resource costs](16-engine-lifecycle-persistence-and-costs.md).

## Installed local interface

**STATIC.** `/opt/homebrew/Caskroom/sbx@rc/0.42.0-rc5/bin/sbx`, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, exposes these commands in its help:

```text
sbx template save SANDBOX TAG
sbx template save SANDBOX TAG --output FILE
sbx template ls --json
sbx template rm TAG
```

The first saves to the engine's image store; `--output` additionally exports a tar.
Removal accepts an image ID as well, but exact owned tags avoid an ambiguous prefix.
`--capture-mode all` has an effect only with `--cloud`; it supplies no local memory or
microVM-checkpoint contract. No local checkpoint/resume switch was established.

**DOC.** Docker describes local templates as capturing installed files and configuration,
requires a stopped sandbox or interactive stop, and warns that saved files can include
secrets. It separately says built-in agent settings are recreated on creation. That
description does not specify block-volume handling precisely enough to replace the
fixture. [Template save, reuse and limitations](https://docs.docker.com/ai/sandboxes/customize/templates/#saving-a-sandbox-as-a-template)

**INFERENCE, corroborated but not an identified implementation call path.** RC5's binary
contains both `SaveTemplate` and Moby `ContainerCommit` symbols. Docker's ordinary commit
excludes mounted-volume data; ordinary export likewise exports underlying image directories,
not overlaid volume contents. This explains a plausible mechanism for the result, but
symbol presence alone does not prove which primitive sbx invokes. The sandboxlib source
URL exposed by symbols, `github.com/docker/sandboxes`, returned 404 publicly.
[Commit semantics](https://docs.docker.com/reference/cli/docker/container/commit/),
[export semantics](https://docs.docker.com/reference/cli/docker/container/export/)

## What the synthetic run established

**OBS.** Client and server were RC5 at the revision above; server API `0.28.0`.
The cached `shell-docker` row reported ID `5fc81bc7a127`, size `588,725,040` bytes.
No new base layers were pulled. The root kit was blobot's Node kit, with four explicitly
declared 512 MiB block volumes: home, legacy synthetic workspace, Docker and containerd.
It supplied no real host mount. `/workspace` here is a fixture path, not the chosen
host-worktree product architecture.

| Probe | Observed result |
| --- | --- |
| Sentinels in `/usr/local/share`, `/opt`, `/etc`, `/root` | Contents, mode `0640`, UID and GID preserved in replacement |
| Sentinels in `/home/agent`, `/workspace`, `/var/lib/docker`, `/var/lib/containerd` | Absent from the replacement at all four paths |
| Replacement stopped and reopened | Same observed file state retained |
| Replacement changed one system sentinel | Original reopened with all eight original sentinels unchanged |
| Resource settings | Original requested 2 CPUs/2 GiB; replacement 3 CPUs/3 GiB; guest observed 2 vs 3 CPUs and corresponding memory totals |
| Local save without tar | `319.06 ms`; stored image row `589,321,296` bytes |
| Cleanup | Both exact owned boxes and the exact saved template removed; no leftovers/errors |

The image-size difference is `596,256` bytes reported by the engine, **not measured
physical host disk growth or the cost of retaining a complete Agent**. Tiny synthetic
files, cached layers and an idle system make this an unsuitable migration latency or
capacity budget. No package installation, xattr/ACL/sparse-file preservation, actual
Docker image/container/volume data, crash consistency or provider session was tested.
The absent volume files prove the tested save-and-redeclare route is insufficient;
they do not inventory every byte inside the saved image.

## Docker startup is partly engine-managed

**STATIC.** Public OCI configuration for the arm64 candidate in the prior note has digest
`sha256:a60edac90bd7b759c5ad8beb2eae61b4bb91f659fbedd9179388ed4bfe53ce05`.
It sets user `agent`, entrypoint `tini --`, command `bash`, and image label
`com.docker.sandboxes.start-docker=true`. Its history installs `containerd.io` and
`docker-ce`; no layer contents were downloaded. These are metadata for that immutable
candidate, not an assertion that the fixture verified the full cached digest.
[Pinned arm64 manifest](https://registry-1.docker.io/v2/docker/sandbox-templates/manifests/sha256:d353bf15d949bfb5a9de5338cc1285949a9e83d575c185958e449a19d9150190),
[image configuration](https://registry-1.docker.io/v2/docker/sandbox-templates/blobs/sha256:a60edac90bd7b759c5ad8beb2eae61b4bb91f659fbedd9179388ed4bfe53ce05)

RC5 static strings contain that same label, a `command -v dockerd` probe, an
`EnsureDockerd` reference, background daemon startup and a readiness wait. **INFERENCE:**
overriding the image entrypoint does not necessarily disable private Docker initialization.
Do not add a second daemon launcher solely because blobot's kit lacks one.

**OBS.** `docker info` succeeded in original, replacement and reopened replacement:
Engine `29.7.2`, root `/var/lib/docker`, storage driver `overlayfs`. Mountinfo contained
an automatic ext4 mount at `/var/lib/docker` from `/dev/vdd`, followed by the fixture's
explicit ext4 mount from `/dev/vdg` stacked over it. A private Docker socket alone is
not proof of the final UID-1000 permission boundary, effective privileged configuration,
which volume the daemon actually wrote, or complete containerd storage location.

**DOC.** Docker documents automatic private daemon startup, privileged mode inside the
microVM, and a sparse 50 GB `/var/lib/docker` block volume for Docker-enabled templates.
The size override is `DOCKER_SANDBOXES_DOCKER_SIZE`. The fixture did not measure the
automatic volume's capacity or validate that override with a custom root kit.
[Docker-enabled template contract](https://docs.docker.com/ai/sandboxes/customize/templates/#base-images)

**DOC.** The v2 grammar places `security.privileged` at the top level. Block volume
entries carry `path`, `size`, `mode`, and an omitted `type`; `type: tmpfs` selects RAM.
`setup.startup` takes argv, user (default `1000`), and `background`. These hooks run at
every start and do not gate the agent entrypoint, even when `background: false`.
Thus they cannot alone enforce restoration-before-provider-launch.
[Kit reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/)

The upstream kit-author notes additionally say startup scripts persist under
`/etc/durable-startup.d/` and replay after real container starts. **INFERENCE:** a saved
system layer may carry old service startup scripts; replacement preparation must account
for them as well as the new kit. Their treatment in template save was not tested.
[Upstream startup pitfalls](https://github.com/docker/sbx-kits-contrib/blob/main/skills/kit-author/topics/pitfalls.md#2-setupstartup-runs-on-every-container-start)

## Real data paths and quiescence remain factual gates

**DOC.** A conventional rootful daemon reads `/etc/docker/daemon.json` unless flags choose
another file; `data-root` normally points to `/var/lib/docker`. With the containerd image
store, Docker's documentation places image contents and snapshots in `/var/lib/containerd`,
while Docker metadata and named volumes stay in the Docker root. Changing `data-root`
alone does not relocate an independently configured containerd root.
[Daemon data directories](https://docs.docker.com/engine/daemon/#daemon-data-directory)

**UNVERIFIED.** The fixture's `DockerRootDir` and `overlayfs` output do not establish the
actual containerd root. Read the effective daemon arguments, the actual containerd
configuration selected by its process, and mountinfo in a future synthetic run. In
particular, distinguish an independently started system containerd from one managed by
dockerd; do not infer its directory merely from the Docker major version. Account for
Agent-created bind mounts and separately configured builders before claiming all private
Docker data is inside one volume.

**DOC.** Daemon termination normally stops containers; live restore can keep them alive.
Also, manually stopping an `always` container does not keep it stopped across a later
daemon restart. [Live restore](https://docs.docker.com/engine/daemon/live-restore/),
[restart policy behavior](https://docs.docker.com/engine/containers/start-containers-automatically/#use-a-restart-policy)

**INFERENCE.** The copy route must control all writers, verify daemon/containerd shutdown,
and prevent restart throughout transfer and destination restoration. An outer `sbx stop`
followed by `sbx exec` does not provide that guarantee: exec can wake the sandbox and its
startup machinery. Neither a missing socket nor a successful stop command proves a
consistent store. The schema inspected here supplies no documented Docker maintenance
mode or stop hook. Whether engine autostart can be held during a raw copy is still unknown.
Do not invent a kit environment switch or silently rewrite Agent restart policies.

## Smallest useful next fixture

The filesystem-only phase is already reproducible with
`BLOBOT_LIVE_SBX_TEMPLATE=1 node .scratch/machines/research/22-template-fixture.mjs`.
It should not be mistaken for the following unperformed Docker phase:

1. Use a disposable root kit and cached image with **one** effective Docker data mount.
   Establish how the engine selects its size, effective privileges, UID-1000 socket access,
   daemon arguments, actual containerd root/config, and each persistent mount.
2. Generate a tiny image from synthetic local files without pulling a base; create a
   named volume, stopped container, build-cache marker, and one bounded writer container
   with an explicit restart policy. Record exact IDs, hashes and metadata.
3. Demonstrate a maintenance interval in which all writers stay stopped despite any
   required `sbx exec`. If engine startup defeats that interval, stop and record the
   unsupported mechanism rather than copying live stores.
4. Only then combine local system snapshot with separate opaque private-volume transfer
   to a replacement. Verify image/container/volume identity and bytes, no premature service
   restart, replacement stop/wake, and original independence. Test interrupted restoration
   with synthetic data before proposing a production cutover.
5. Remove only the recorded boxes and private saved template; measure allocated disk,
   transfer bytes and peak resource cost separately from engine image-size metadata.

This recipe is investigation scope, not acceptance of per-Agent snapshots as a durable
lifecycle mechanism. A local saved template can contain private system files even without
tar export; retention, cleanup and the approved preservation boundary must be resolved
before applying that mechanism to real Agent data. The current reconfiguration refusal
and box activation guards remain justified.
