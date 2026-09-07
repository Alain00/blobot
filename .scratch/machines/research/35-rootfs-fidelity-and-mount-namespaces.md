# Rootfs fidelity needs content plus metadata; a private mount view is viable

2026-09-05, arm64 sbx RC5. A full PAX transfer of the measured rootfs trees repairs
the failures from research30 and survives candidate stop/reopen. **A timestamp-only
repair is insufficient:** the template also drops POSIX ACLs and changes the contents
of a synthetic sparse file. Two independent runs reproduce those failures.

This is a successful mechanism experiment over explicitly seeded trees, not admission
of a complete rootfs migration. The second experiment establishes a private mount view
that excludes nested mounts. General writer exclusion and a complete, safely restored
rootfs inventory remain implementation/validation work.

## Primary evidence and contract

- [Copy fixture](35-rootfs-fixture.mjs) and [guest worker](35-rootfs-worker.cjs).
- [First copy result](35-rootfs-fixture-first-results.json), UUID
  `5ad472d4-0967-43d3-9bd4-4d5d7c581c13`, and [repeat result](35-rootfs-fixture-results.json),
  including a diagnostic count of unexpected nonzero sparse-file bytes without logging
  the bytes themselves.
- [Mount-namespace fixture](35-rootfs-namespace-fixture.mjs) and
  [result](35-rootfs-namespace-results.json), UUID
  `4347c432-415c-4dca-a0a0-2c1375c21737`.
- [Freezer and worker-death fixture](35-rootfs-freezer-fixture.mjs) and
  [result](35-rootfs-freezer-results.json), UUID
  `383ea883-7e2e-4183-8bd3-d4bec8344b54`.

All runs use client/server revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`
and the already approved label-only derivative from research28/30:
`blobot-machine-probe:explicit-docker-20260905`, manifest
`sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c`.
Its supplied tar is `/private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar`.

Docker describes template save as capturing packages, configuration and files into
a reusable image; its reference does not specify nanosecond, ACL or sparse-allocation
fidelity. [Template documentation](https://docs.docker.com/ai/sandboxes/customize/templates/)
[Save command](https://docs.docker.com/reference/cli/sbx/template/save/)

OCI layers represent additions, modifications and deletions. Their file attributes
include mtime, numeric ownership, modes, xattrs and links where supported. They use
whiteouts for removals and discourage sparse files because tar implementations differ.
Those format requirements do not certify this engine's snapshot implementation.
[OCI filesystem changeset specification](https://github.com/opencontainers/image-spec/blob/main/layer.md)

## Snapshot failure and repaired state

The fixture extends research30 with an actual installed synthetic `.deb` and modified
conffile, plus rootfs files with deliberately precise mtime `1788635508123456789` ns:

- numeric UID/GID, modes, a setgid directory, hardlink pair and symlink;
- binary `user.blobot` xattr;
- access ACL naming UID 12345, and a directory default ACL;
- a copied guest binary carrying `security.capability`;
- a FIFO and a sparse file containing exactly 1 MiB of zeros followed by `sparse tail`;
- deletion of the base `/etc/debian_version`, replacement of base `/etc/issue` with a
  directory and replacement of base `/etc/issue.net` with a symlink.

The tests modify only owned synthetic guests. They do not remove or change those paths
on the host. The temporary workspace is a private synthetic volume, not a host mount.

| Measured property | Saved-template candidate | After authoritative PAX transfer and stop/reopen |
| --- | --- | --- |
| mtime nanoseconds | Truncated to `1788635508000000000` | Exact original nanoseconds |
| Access/default ACL xattrs | Missing | Exact original bytes |
| Binary user xattr | Preserved in this fixture | Exact original bytes |
| `security.capability` | Preserved in this fixture | Exact original bytes |
| UID/GID, modes, hardlink relationship, symlink target, FIFO type | Preserved in this fixture | Exact measured state |
| Base-path deletion and type replacements | Preserved in this fixture | Exact measured state, including removal of deliberately injected target drift |
| Sparse logical length | 1,048,587 bytes | 1,048,587 bytes |
| Sparse allocated blocks, 512-byte units | 2,056 | Original 8 |
| Sparse content | Different SHA-256 | Original SHA-256 |
| Package database and conffile/payload checks | Measured data retained, timestamp precision lost | Exact measured state |

The expected sparse hash is
`5482e468797d1883ae4ba5bf82bcca19e52ee2f6dd36d11968590c6385d037af`.
The first snapshot produces
`3e9602569f90507b3da26effc2ccc8a615736c2bd05d39661c81bc9e3e55688d`; the repeat produces
`b48d69217e1431a3e7fd5748d05ca8382fdf6d14ecf51822b3d903074762feb3`.
In the repeat, 14,702 bytes inside the intended zero region are nonzero; the final tail
still matches. The source, corrected candidate and reopened candidate all contain the
expected zeros/tail and original hash. This is an observed content failure, not merely
different sparse allocation. Its engine-internal cause was not established.

The effective capability xattr and ACL encodings are read back from the filesystem;
the fixture does not execute the capability-bearing binary or separately test an ACL
authorization decision. Absolute inode numbers are not compared: hardlink relationships
are compared within each filesystem. ctime, birth time and atime are not claimed as
preserved by this experiment. The transfer deliberately excludes atime/ctime from PAX
comparison; that limitation must remain explicit in any eventual persistence contract.

## Concrete transfer that passes

The source first stops and saves to a local template. Both guests then use the held-exec
maintenance strategy from research30. Docker/containerd are quiesced before copying and
do not reappear during those maintained exec sessions.

The authoritative archive includes the two private volumes and these complete rootfs
trees/entries: `/opt/blobot-rootfs35`, `/opt/blobot-synthetic`,
`/etc/blobot-synthetic.conf`, `/var/lib/dpkg`, `/etc/issue`, `/etc/issue.net`.
It uses PAX, numeric ownership, ACLs, all xattr namespaces, sparse support and canonical
headers. GNU tar documents these preservation options; they require compatible
implementations and privilege, rather than following automatically from plain tar.
[GNU tar manual](https://www.gnu.org/software/tar/manual/tar.html)

The candidate removes its existing copies of those rootfs entries before extraction;
the explicit deletion set also removes `/etc/debian_version`. To prove absence handling,
the test first injects both that deleted file and a target-only file inside a transferred
tree. Both disappear. This is **authoritative replacement of content, metadata and
absence**, not a metadata overlay on top of an assumed-correct snapshot. The deletion
set is fixture-defined; a production protocol must derive and validate it from a full
source inventory.

Both runs transfer 47,001,600 bytes in bounded 64 KiB frames through host pipes/memory,
with no host archive or extraction. Source before/after, relay, receiver and target
re-archive hashes match. The repeat's transfer hash is
`26814b031e15da43eb74fd0535cd347b73dffc1450dbd9fd8e179816f7c4eea1` and measured relay
completion is 283 ms. These tiny-fixture times are not a large-state forecast.

The candidate has 3 CPU/3 GiB versus source 2 CPU/2 GiB, with the approved 8 GiB home
and 20 GiB Docker block devices. After closing its maintained exec, actually stopping
the candidate and reopening it, the package/rootfs/home/Docker comparisons still pass.
The restored container runs and stops. Candidate mutations leave the original archive
unchanged; the original Docker and measured rootfs recover independently.

`passed: true` means these assertions passed. It does not mean every possible rootfs
path, metadata type or workload is covered, and it does not open production guards.

## Private mount namespace: measured viable

A separate read-only probe ran, inside one already quiesced synthetic guest:

1. `unshare --mount --propagation private` created a child mount namespace.
2. A **non-recursive** bind of `/` onto a UUID-owned temporary directory provided a
   view of the root overlay without its nested mounts.
3. The probe entered that view with `chroot` and read only fixture/exposure checks.
4. It unmounted the view, removed the temporary directory and verified the original
   namespace ID and complete original `mountinfo` were unchanged.

The child namespace differs from its parent and the view has exactly one overlay mount.
It contains the rootfs fixture, but not the private home marker or Docker volume state;
`/proc` and `/dev` are empty underlying directories. The original mount list includes
`/proc`, `/dev`, `/dev/pts`, `/dev/shm`, `/dev/mqueue`, `/sys`, `/sys/fs/cgroup`, `/run`,
`/run/secrets`, `/home/agent`, `/workspace`, `/var/lib/docker`, `/etc/resolv.conf` and
`/etc/hosts`. None becomes a child mount in the rootfs view.

This matches Linux's distinction between bind and recursive bind: ordinary bind does
not attach submounts. Private propagation keeps mount changes local to the namespace.
[mount(8)](https://man7.org/linux/man-pages/man8/mount.8.html)
The fixture does not itself include host worktree/shared-Git/skills mounts; exclusion
of those follows from the same mechanism only after their real topology is enumerated
and verified in an integration test.

## Required jump from this subset to the complete rootfs

The viable candidate design is a held maintenance process per guest, with an isolated
rootfs view and a complete authoritative inventory/stream. The following are still
requirements to implement and measure:

- Parse the entire mount graph, including escaped paths and mounted files. Classify
  the owned private volumes separately from worktree/shared-Git/skills/engine mounts;
  refuse an unknown persistent volume rather than silently omitting its state. A
  device-number check or `--one-file-system` alone does not exclude same-device binds.
- Non-recursively bind the root overlay in a private mount namespace and verify there
  are no descendant mounts in that view. Enumerate the underlying root filesystem
  through that view, with a separately owned temporary mount location excluded from
  recursion. Source rootfs and private volumes need distinct complete inventories.
- Use the complete inventory to validate content, metadata, hardlink groups, sparse
  extents and absent entries. Rootfs deletions cannot be inferred merely from files
  present in a tar stream, and snapshot content cannot be presumed correct.
- Extract into the isolated rootfs view with no ambient engine/host binds and without
  following existing symlink ancestors. Validate archive paths and hardlink targets;
  handle type changes and deletions before restoring final directory metadata. The
  copy fixture's fixed roots and trusted synthetic archive are not that validation.
- Constrain path resolution/extraction to the view: absolute symlinks must not resolve
  through the guest's original mounted tree. A chroot with correct cwd and no outside
  directory descriptors helps define resolution, but is not by itself a security
  boundary; root privileges/open descriptors can defeat it.
  [chroot(2)](https://man7.org/linux/man-pages/man2/chroot.2.html)
- Test malformed archives, symlinks aimed at protected mounts, mount changes during
  maintenance, same-filesystem binds, external hardlink targets, copy interruption,
  complete state after stop/reopen, and crash-safe cutover/original recovery.

The rootfs transfer itself has not yet been run through this isolated view: the first
experiment proves fidelity on selected paths; the second proves view separation.
Composing them across the entire rootfs remains a factual gate.

## Freezer mechanism passes; admission of new writers remains separate

A private mount namespace changes visibility, not write access to the same underlying
filesystem from another namespace. After Docker stops, the probe still sees `tini`,
`sh`, `sleep`, `clipboard-bridg` and the maintenance `node`; all share the container's
`/docker/<id>` cgroup. This falsifies any claim that Docker quiescence alone excludes
all possible writers.

The guest's cgroup v2 mount is RW. The owned container cgroup has type `domain`, exposes
`cpuset cpu io memory hugetlb pids` and has empty `cgroup.subtree_control`. A follow-up
creates exactly one UUID-owned child under that container cgroup, without changing any
controller, ancestor, sibling or global setting. Kernel documentation specifies freezing
a cgroup and descendants and waiting for the `frozen` acknowledgement in `cgroup.events`.
[cgroup v2 freezer](https://docs.kernel.org/admin-guide/cgroup-v2.html)

The worker remains in the current control group. It freezes the child first, migrates
the other current members after checking their membership/identity, repeats until the
control group contains only itself for five observations, and waits for `frozen 1`.
The child contains PID1 `tini`, `sh`, `sleep`, `clipboard-bridg` and the synthetic Node
writer. The writer's counter stays at `4` during a 300 ms interval and a complete
47,001,600-byte archive/hash operation by the unfrozen worker. Thawing the child,
restoring its members to their original group and removing the child succeeds; the
counter advances to `7`. No controller enablement or movement outside the container's
own cgroup subtree was needed.

**The same experiment proves the admission gap:** a deliberately late writer created
in the control group writes three times while the workload child stays frozen. A new
out-of-band engine exec was not launched, but it cannot be assumed to enter the frozen
child. Repeated PID scans before copying do not provide an atomic boundary against
future processes in the control group. A production implementation needs an enforced
admission contract, monitoring/fail-closed behavior and independent concurrent-exec
tests; the measured child freezer alone is not general exclusion forever.

For failure recovery, the worker repeats the freeze and deliberately exits with code
75 without thawing, leaving PID1 and the other base processes frozen. The external
`sbx stop` completes in 5.29 s. Reopening the original produces a new boot ID, no owned
freezer child, `frozen 0`, and the same measured package/rootfs/home/Docker state.
Thus this particular worker-death state is recoverable through engine stop/reopen.
The normal thaw path also passes. Power loss, host application death, interruption at
every migration/transfer step and a durable recovery journal remain untested; no
automatic production recovery was implemented. Freezing a process is also not an
application-level checkpoint for an arbitrary multi-file transaction.

The application must serialize lifecycle, transport and inspection operations;
research24/28 already show that a new engine exec can restart Docker. No concurrency
fence was implemented here.

## Candidate from the original base, without template save

The parent's proposed production direction is consistent with the evidence: create
the replacement from the **same recorded, verified image pin** and kit configuration,
then apply an authoritative complete rootfs transfer plus the owned private volumes.
If the protocol copies all required content/metadata/absence and verifies the result,
the intermediate template contributes no fidelity guarantee. Omitting it also avoids
the measured sparse/ACL loss and removes the need to journal and retain a private
template containing Agent state. This alternative was not executed in these fixtures.

The full-rootfs version still has specific traps to resolve:

- Replacing an executable currently mmap'ed by a worker must not truncate its inode.
  GNU tar's `--unlink-first` or equivalent unlink/recreate semantics are candidates;
  the running maintenance process, helper binaries and dynamic-library loads must
  remain usable throughout. The subset fixture never overwrites Node or tar.
- Restore all rootfs paths in one namespace-aware stream or preserve cross-tree
  hardlink groups explicitly. Independent arbitrary directory copies can split
  hardlinks. Restore ownership before capabilities and final directory modes/times;
  the tested PAX extraction restores the measured ACL/capability bytes correctly.
- `/etc/machine-id` and other identity material need evidence about who owns/injects
  them. A mounted engine file is excluded by the rootfs view; a regular rootfs file
  cannot be classified as disposable solely from its name. These fixtures did not
  establish machine-id semantics. Container/engine identity must come from the new
  engine instance while the Agent's persistent state follows the migration contract.
- Preserve user-installed daemon configuration, including `/etc/docker/daemon.json`
  if present, but verify that the resulting Docker/containerd data roots are actually
  covered by the copied volumes. The fixture's default root remains the verified
  `/var/lib/docker`; custom daemon storage was not exercised.
- Engine-injected mounts and runtime configuration must be reconstructed from the
  recorded kit and checked after reopen. The isolated view prevents mounted
  `/etc/hosts`, `/etc/resolv.conf`, `/run` and similar entries from entering the rootfs
  stream; it does not reconstruct environment variables, labels, resources or bindings.

Same-base creation plus complete authoritative copy is therefore a concrete next
implementation candidate, not yet a validated complete migration path.

## Cleanup and reproduction

All four runs removed their exact UUID-owned guests/snapshots and the candidate
template loaded by that run. Every cleanup report is empty. Final independent sbx
inventory: no sandboxes, only the pre-existing vendor templates `claude-code-docker`
(`94670d5b2a24`) and `shell-docker` (`5fc81bc7a127`). The supplied tar remains. The
2 GiB host-free-space guard stayed satisfied; final available space was 7.0 GiB.

No host data, credentials, inference, registry pull, global setting or production file
was involved. No real Agent snapshot was created. Both fixture entrypoints and the
worker pass `node --check`.

```sh
BLOBOT_LIVE_SBX_ROOTFS=1 node .scratch/machines/research/35-rootfs-fixture.mjs \
  /private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar \
  blobot-machine-probe:explicit-docker-20260905 \
  sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c
```

Use the same arguments with `35-rootfs-namespace-fixture.mjs` for the separate mount
view probe or `35-rootfs-freezer-fixture.mjs` for the freezer/recovery probe. Require
exclusive sbx access. There is no production/tracker change or
commit in this research task.
