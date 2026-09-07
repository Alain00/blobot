# The complete sbx root view is stable while paused; reopen changes Docker's log

2026-09-05. **The entire persistent overlay view of one synthetic sbx can be read
and archived twice with identical PAX `-G` bytes**, using the private mount view
from research35 and sibling freezer from research36 together. Each archive is
1,608,243,200 bytes. Both invocations exit zero with empty stderr. The complete
inventory contains 62,746 entries and remains unchanged across these reads.

After thaw, stop and reopen of the same original, the procedure succeeds again.
The two new archives match each other, but differ from the first boot. Comparing
every inventoried path identifies exactly one changed record:
`/var/log/dockerd.log`, whose contents, size and fractional mtime changed.

This establishes full-root **read composition and stability in this fixture**.
It does not establish a complete rootfs restore, or close all metadata gates.
In particular, 60,936 file/directory entries return `ENOTTY` for the inode-flags
query; treating those as zero or as absent would be an unsupported assumption.
There is no production change or relaxed guard.

## Evidence and reproducibility

- [Host fixture](38-full-root-fixture.mjs), [held guest worker](38-full-root-worker.cjs),
  [root-view inventory and archive reader](38-full-root-view.py).
- [Final observations](38-full-root-results.json), UUID
  `0690f014-8a8d-4f74-b247-488be877ad83`.
- [Initial instrumentation failure](38-full-root-first-results.json), UUID
  `586225d5-3c1a-4262-bb69-888910c585f7`.
- Mechanisms composed from [research35](35-rootfs-fidelity-and-mount-namespaces.md),
  [research36](36-sibling-freezer-and-exec-admission.md), and the creation recipe
  measured in [research37](37-complete-pax-dumpdir-and-live-runtime.md).

Host: Darwin arm64; sbx client/server `v0.42.0-rc5`, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`. Guest: Linux 7.0.12 arm64,
GNU tar 1.35, Ubuntu tar package `1.35+dfsg-4ubuntu0.4`.
The approved local template is `blobot-machine-probe:explicit-docker-20260905`,
manifest `sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c`.
The fixture loads the supplied `/private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar`;
there is no pull, login, inference or global-setting mutation.

One sandbox exists at a time, with 2 CPUs, 2 GiB RAM and explicit private volumes:
8 GiB `/home/agent`, 20 GiB `/var/lib/docker`, and the older fixture's 512 MiB
`/workspace`. A fresh UUID-owned host directory contains only three synthetic
directories named `worktree`, `common-git` and `skills`; each has a synthetic marker.
The first two are mounted read-write and `skills` read-only. No actual repository,
shared Git directory, skills store, credentials or Agent data are mounted.

The seed is research35's synthetic package/conffile, root metadata, home data and
tiny inner-Docker image, stopped container and named volume. These are context
for a realistic persistent root, not the boundary of the archive: the archive and
inventory start at `/` and traverse the entire isolated root view.

## Which filesystem was actually read

Docker documents a separate microVM/Linux kernel per sandbox, and persistence
across restarts until sandbox removal. That states the engine's boundary and
lifecycle; it does not certify this transfer projection's metadata fidelity.
[Docker isolation](https://docs.docker.com/ai/sandboxes/security/isolation/)

The worker first terminates dockerd and its containerd and confirms the relevant
process list is empty. It moves itself into an owned sibling maintenance cgroup
inside that microVM and freezes the sandbox's original container cgroup, observing
`cgroup.events` with `frozen 1`. No ancestor controls or other sibling limits are
changed. The kernel defines the freezer acknowledgement and descendant scope;
research36 separately measured ordinary `sbx exec` rejection while this container
is frozen. This run does not repeat that concurrent-exec experiment.
[cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)

The maintenance child enters a private mount namespace with private propagation.
Its control directory and root mountpoint live under the existing tmpfs `/run`:
`/run/blobot-control38-<uuid>/root`. A plain, nonrecursive `mount --bind / <view>`
has exactly one mount at or beneath the view. The Python scanner and GNU tar run
chrooted into it. Neither worker source nor archive temporary files are written
into the persistent root. Ordinary bind mounts exclude submounts; `--rbind` would
have different semantics and is not used.
[mount(8)](https://man7.org/linux/man-pages/man8/mount.8.html)

Observed excluded submounts, enumerated from the real mount table:

| Mount group | Observed paths |
| --- | --- |
| Kernel/runtime filesystems | `/proc`, `/dev`, `/dev/pts`, `/dev/shm`, `/dev/mqueue`, `/sys`, `/sys/fs/cgroup`, `/run`, `/run/secrets` |
| Explicit private persistent volumes | `/home/agent`, `/workspace`, `/var/lib/docker` |
| Engine-injected individual files | `/etc/resolv.conf`, `/etc/hosts`, both read-only virtiofs mounts |
| Synthetic host mounts | UUID-owned `worktree`, `common-git`, `skills` under `/private/tmp` |

All three host markers are readable through the normal mount namespace and absent
from the isolated root view, on both boots. Their mounted contents never enter
the archive. The covered mountpoint's **underlying overlay object** still belongs
to the root view: excluding a mount does not erase that underlying directory or
file. The same distinction applies to the base placeholders under `/etc/hosts`
and `/etc/resolv.conf`, and to directories covered by private volumes. A later
restoration must also use a verified isolated destination view; extraction through
the ordinary mounted namespace is not justified by these results.

The original mount namespace identity and mount table remain unchanged, and the
original container remains frozen throughout each operation. Thaw restores worker
membership and removes the owned maintenance group. A bind view plus chroot is
not independently a security boundary; descriptor, cwd and privilege constraints
remain relevant. This fixture uses only pipe stdio for the chrooted child.
[chroot(2)](https://man7.org/linux/man-pages/man2/chroot.2.html)

## Complete inventory and archive observations

| Observation | First boot | Reopened original |
| --- | ---: | ---: |
| Entries | 62,746 | 62,746 |
| Directories | 7,583 | 7,583 |
| Regular-file paths | 53,421 | 53,421 |
| Symlinks | 1,741 | 1,741 |
| FIFO | 1 | 1 |
| Sockets, block/character devices, other types | 0 | 0 |
| Visible regular-file hardlink groups | 5 | 5 |
| Sum of regular-file logical lengths by path | 2,764,068,555 B | 2,764,066,654 B |
| Archive bytes, each of two reads | 1,608,243,200 B | 1,608,243,200 B |
| Archive exit code / stderr bytes | 0 / 0 | 0 / 0 |
| Inventory read errors | 0 | 0 |
| Inventory changes during archive reads | 0 | 0 |

Logical lengths are summed by pathname, so they count hardlinked content multiple
times; they are not a unique-content or physical-allocation size. The synthetic
sparse file has size 1,048,587 bytes and eight 512-byte allocated blocks. This
scanner records sparse candidates and block counts, not every extent map.

The inventory covers types, numeric UID/GID, mode including type/special bits,
nanosecond mtime, regular contents and lengths, directory child-name hashes,
symlink-target hashes, visible hardlink membership, and every returned xattr name
and value hash. It does not follow symlinks or serialize their target text into the
report. Observed xattrs are `security.capability` on one object,
`system.posix_acl_default` on one, `system.posix_acl_access` on two, and `user.blobot`
on two. These observed bytes are not tests of effective access or capability
execution. Exact inode numbers, atime, ctime and birth time are outside the existing
research37 projection; filesystem-private state and flags are discussed below.

Exact creation arguments, with fixed PATH, `LC_ALL=C`, `TZ=UTC`, and no inherited
`TAR_OPTIONS` or `POSIXLY_CORRECT`:

```sh
tar --incremental --sort=name --format=pax \
  --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
  --numeric-owner --acls --xattrs '--xattrs-include=*' \
  --sparse --sparse-version=0.0 --atime-preserve=system \
  -C / -cf - .
```

GNU `-G` is the full incremental-format creation mode without a historical
snapshot file; its directory inventory is needed for authoritative deletions.
Research37 verified `GNU.dumpdir`, replacement and the directory-xattr limitation
on a synthetic complete chroot. Research38 only creates/hashes this complete real
root view; it does not extract its stream or parse every dumpdir record.
[GNU incremental dumps](https://www.gnu.org/software/tar/manual/html_node/Incremental-Dumps.html)
[GNU format internals](https://www.gnu.org/software/tar/manual/html_chapter/Tar-Internals.html)

The four archive reads take approximately 1.96–2.04 seconds each in this fixture.
Each full inventory/archive/inventory operation takes 10.5–10.7 seconds. This is
local guest reading, not a migration-throughput benchmark. Bytes are read in
64 KiB guest pipe chunks, hashed and discarded; no archive is saved in the guest,
persisted on the host, or sent over the sbx control channel. The stream has a
4 GiB experimental bound. Only synthetic inventory metadata crosses the control
channel; complete per-path fingerprints are compared in host memory and removed
before persisting the result. The report retains counts, aggregate hashes and the
single changed record. Its `maxRelayFrame` is zero. The research JSON transport's
peak host RSS was approximately 1.27 GiB; that is not a production memory target.

First-boot archive SHA-256, identical across its two reads:
`b996eec2c044486eeea3cb9cdd6893442587fc4e0a0c2b2ae65d16b453a4e683`.
Reopened archive SHA-256, identical across its two reads:
`5dde3e209579938bf0d1957c74226051447129917b0d1374e047dce0935a3c92`.

## Reopen is a new filesystem state

The original is thawed, its held exec closes, and `sbx stop` succeeds in 5.44 s.
The subsequent held exec starts a new boot: boot ID changes from
`d59a1e64-7549-4170-b966-8adc9309c388` to `fc0f4a94-0e5b-4b38-96ea-227ffd80048e`.
As in earlier research, sbx starts Docker for the exec, so the procedure quiesces
it again before freezing and measuring.

The only difference across the complete recorded projection is:

| `/var/log/dockerd.log` field | Before stop | After reopen/quiesce |
| --- | --- | --- |
| Length | 19,876 | 17,975 |
| mtime ns | `1788640990622871002` | `1788641009417388000` |
| SHA-256 | `d01fd1f1b7db57eaa9588f399d5a1eeb93c3a7aada6fd16b48dae25be0e34546` | `bd9b4aaa29074fc2c8e17b156e9fa5e5b58f4630c934312bfe7a08547c6b65e0` |

The log's name and Docker startup/quiescence correlate with this change; this run
does not trace the exact writer syscall. No other path is added, removed or changes
in the projection, including all of `/etc`. This does not prove that an arbitrary
kit, Agent, package or new engine version has the same startup behavior, nor does
it separately certify the semantics of `/etc/machine-id`. Runtime file mounts are
outside this comparison by construction.

A raw whole-root hash taken after a normal reopen therefore cannot simply be
required to equal a pre-stop hash, even for the same original. The differing log
is real persistent root content; silently excluding it would change the coverage
contract. This finding is not an approved normalization rule or a new protocol.

## Remaining factual gates and limits

1. **Unrepresented attributes.** `FS_IOC_GETFLAGS` succeeds on 68 regular-file or
   directory entries with value `524288` (`0x80000`, `FS_EXTENT_FL`), and fails with
   `ENOTTY` on the other 60,936. This is observed inability to query through this
   view. It establishes neither that additional flags exist nor that a transfer
   would lose them; it also does not establish that those flags are zero.
   Flags such as immutable,
   append-only and project inheritance can change semantics and are a separate
   interface from xattrs. The fixture never changes flags, does not use an
   alternative attribute API, and does not inspect quotas, encryption or verity.
   Equal PAX bytes cannot certify attributes that the recipe does not encode.
   [Inode-flags API](https://man7.org/linux/man-pages/man2/ioctl_iflags.2.html)
   [Linux UAPI definitions](https://github.com/torvalds/linux/blob/master/include/uapi/linux/fs.h)
2. **No omitted object is present here.** There are no persistent sockets or device
   nodes in this root view and no tar warning. That is a positive case, not a rule
   for arbitrary Agent roots. Research37 showed that a socket can be omitted with
   tar exit zero; warnings, unsupported types and incomplete inventories remain
   failures for a complete-fidelity claim. This run does not inspect every PAX
   member for omitted metadata or `N` dumpdir records.
3. **Source reading is the scope.** No candidate is created, no whole-root archive
   is restored, and no private volume is copied in research38. Default extraction,
   target directory xattr removal, running-runtime replacement and exact deletions
   have research37 evidence on a synthetic chroot only. Whole-root restoration and
   reopened-candidate behavior are still separate evidence requirements.
4. **Quiescence is measured, not universal.** There is no content/inventory drift
   in these two approximately eleven-second windows. The freezer covers the
   original container tree, while VM processes outside it remain active. This run
   does not certify hostile external mounts, privileged cgroup escapes, arbitrary
   engine-side writers or cancellation/crash recovery; research36 separately
   measured worker-death stop/reopen recovery.
5. **Observability correction.** The initial scanner placed the inode-flags ioctl
   inside a wider traversal exception handler. `ENOTTY` on a directory prematurely
   stopped its recursion, so its inventory was incomplete although the independent
   full tar succeeded. The corrected scanner records unknown flags and continues
   reading. Final assertions require zero read errors and equality between record
   count and the sum of observed types. The first report is retained solely as
   evidence of the instrumentation failure, not a valid complete inventory.

## Cleanup and handoff

The 2 GiB host free-space guard passes before template load/source creation with
9,199,738,880 bytes available. The fixture thaws both times and removes the exact
UUID-owned box, loaded probe alias and synthetic host directory. No snapshot is
made. Its final cleanup reports no errors or owned objects remaining.

An independent post-run inventory confirms `sandboxes=[]` and only the two
pre-existing vendor templates: `claude-code-docker` ID `94670d5b2a24` and
`shell-docker` ID `5fc81bc7a127`. Host free space is 8.6 GiB. sbx is explicitly
handed back to the parent; no further engine work is part of this note.
