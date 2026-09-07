# Alternative attribute queries narrow the unknowns; PAX demonstrably omits writable flags

2026-09-05. **`FSGETXATTR` does not resolve the failed `GETFLAGS` queries on this
sbx root:** both return `ENOTTY` for the same 60,949 regular-file/directory entries.
`statx` succeeds throughout and provides a narrower, explicitly masked view. It
reports `IMMUTABLE` on 62,685 root entries, including base symlinks, with supported
mask `0x203034`. This is an observed attribute value, not proof that each pathname
has an independently configurable immutable policy enforced by OverlayFS.

On newly created synthetic upper, home and Docker objects, both setters work for
immutable, append-only, nodump and directory project-inherit. **All 42 trials set,
read back and revert the intended flag. The current GNU PAX recipe produces
identical bytes before and after setting it, and clean extraction loses the flag.**
The omission is now a measured failure, not merely an untested possibility.
Existing immutable/append destinations additionally make extraction fail.

No migration, production change, admission mask or relaxed preservation guard is
introduced. Unknown base attributes and the meaning of the inherited `statx`
immutable indication remain explicit limits.

## Reproducible evidence and scope

- [Host fixture](40-file-attributes-fixture.mjs), [held guest worker](40-file-attributes-worker.cjs),
  [Python metadata/flag probe](40-file-attributes.py).
- [Final results](40-file-attributes-results.json), UUID
  `99df3b13-3b5d-41c1-bc13-541def6885bc`, started `2026-09-05T20:57:04.453Z`.
- [First results](40-file-attributes-first-results.json), UUID
  `77132b86-5869-4d1c-80a9-ca8a5e43d5f0`. The first run completed all trials and
  cleanup; its chosen `/usr/bin/env` sample was a symlink and `/usr` returned the
  upper-style result. The final run uses and asserts a regular base file and base
  directory, `/.rock/metadata.yaml` and `/.rock`. The two runs have the same complete
  inventory counts and trial outcomes. There is only one sandbox at a time.
- Follow-up to [research39's API analysis](39-inode-flags-and-preboot-verification.md)
  and [research38's complete root-view scan](38-full-rootfs-composition-and-reopen.md).

Host Darwin arm64; guest Linux 7.0.12 arm64; sbx client/server `v0.42.0-rc5`,
revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`. The fixture uses the same approved
local image, `blobot-machine-probe:explicit-docker-20260905`, manifest
`sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c`, and the
privileged 2-CPU/2-GiB kit from research38: home 8 GiB, Docker 20 GiB and the older
fixture workspace volume 512 MiB. The measured home and Docker filesystems are
ext4, `/dev/vdd` and `/dev/vdf` respectively.

No pull, network request from the guest, login, inference, credentials or global
settings are involved. The inherited three host mounts contain only newly created
UUID-owned synthetic directories. Docker is quiesced in one maintained exec and
the original sandbox cgroup is frozen while the worker stays in its owned sibling
maintenance cgroup. A private mount namespace contains a single nonrecursive bind
view of `/` under tmpfs `/run`; its descendants contain no additional mounts.
The root inventory uses this view. Home and Docker metadata are scanned separately
through their explicit private volume paths.

The full inventories read types and attribute APIs, **not regular-file contents,
xattr values or symlink targets**. Tar only reads tiny synthetic files created for
each flag trial. Their 10,240-byte archives remain in guest memory and never cross
the control channel. Stored results contain metadata, status, PAX key names and
hashes. Worker/control source is supplied through exec arguments; no control file
is written to the persistent root view.

## Interfaces and what successful queries mean

The arm64 ioctl request values used here are `GETFLAGS=0x80086601`,
`SETFLAGS=0x40086602`, `FSGETXATTR=0x801c581f`, `FSSETXATTR=0x401c5820`.
The legacy flags payload is a 32-bit unsigned word, despite the request's historic
native-long encoding. The extended payload is the 28-byte `fsxattr` structure,
with five unsigned 32-bit fields and eight zero padding bytes. Every setter starts
from the successful prior query; it does not invent a general modifiable mask.
[Inode-flags API](https://man7.org/linux/man-pages/man2/ioctl_iflags.2.html)
[Linux v7.0.12 UAPI](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/include/uapi/linux/fs.h)

`FSGETXATTR` includes flags, project ID and extent/allocation hints. Implementations
need not understand every XFS-originated field, so a returned zero extent count
is not proof of physically absent extents. It is important to keep the raw API
result and filesystem context rather than treating the structure as a universal
filesystem-state certificate.
[FSGETXATTR contract](https://man7.org/linux/man-pages/man2/ioctl_xfs_fsgetxattr.2.html)

The `statx` call uses `AT_SYMLINK_NOFOLLOW | AT_NO_AUTOMOUNT` and
`STATX_BASIC_STATS`, preserving both `stx_attributes` and `stx_attributes_mask`.
The mask is the API's support declaration: a masked-in zero is a negative result
for that corresponding attribute; a bit absent from the mask is unknown. It does
not expose every inode flag or associated project/feature state. The fixture
returns `null` for unsupported named bits and keeps the complete numeric words.
[statx contract](https://man7.org/linux/man-pages/man2/statx.2.html)

In upstream v7.0.12, FUSE can dispatch `GETFLAGS` and `FSGETXATTR` differently,
which justified trying both. OverlayFS asks the selected real metadata object and
can return the underlying failure. Matching `uname` does not certify that Docker's
kernel has identical source/configuration; the live results determine availability
here.
[FUSE dispatch](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/fuse/ioctl.c)
[OverlayFS attribute query](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/overlayfs/inode.c)

## Query coverage, without changing base objects

| Sample | GETFLAGS | FSGETXATTR | statx attributes / mask |
| --- | --- | --- | --- |
| Base regular file `/.rock/metadata.yaml` | `ENOTTY` | `ENOTTY` | `0x10 / 0x203034` |
| Base directory `/.rock` | `ENOTTY` | `ENOTTY` | `0x10 / 0x203034` |
| New upper regular file and directory | `0x80000` | All five fields zero | `0 / 0x303874` |
| New home ext4 regular file and directory | `0x80000` | All five fields zero | `0 / 0x303874` |
| New Docker ext4 regular file and directory | `0x80000` | All five fields zero | `0 / 0x303874` |

The base samples were never mutated. They are unchanged image-path samples,
selected to exercise the lower-backed class; this run does not directly open the
engine's hidden lower mountpoints or prove every pathname's copy-up provenance.
New upper objects are known to have been created by this fixture. `0x80000` is the
extent-representation flag; it is not one of the four policy flags being toggled.

Complete pre-mutation metadata inventories:

| Surface | Entries and types | GETFLAGS / FSGETXATTR coverage |
| --- | --- | --- |
| Root view | 62,734: 7,580 dirs, 53,415 files, 1,739 symlinks | 46 successful regular-file/dir queries; 60,949 `ENOTTY` in both interfaces |
| Home volume | 7: 4 dirs, 3 files | All 7 succeed |
| Docker volume | 46: 34 dirs, 11 files, 1 other object | All 45 regular-file/dir queries succeed |

No traversal/open/statx error occurs. Symlinks and the one nonregular Docker object
receive `statx`, but do not receive descriptor ioctls: the probe avoids following
symlinks or opening sockets/FIFOs/devices. Their lack of ioctl results is not zero
flags. The root count differs from research38 because this run does not install
the older synthetic package/rootfs/Docker seed; it measures the base plus its own
small attribute-probe objects.

Root `statx` groups are exactly:

- 62,685 entries: attributes `0x10`, mask `0x203034`.
- 48 entries: attributes zero, mask `0x303874`.
- The view's root: attributes `0x2000` (mount root), mask `0x303874`.

For the first class, immutable is reported set; append, compressed, automount and
DAX are reported clear. Nodump, encrypted, verity and write-atomic are unsupported
in that mask. For the `0x303874` class, immutable/append/nodump/encrypted/verity are
reported clear before mutations; write-atomic remains outside the mask. No `statx`
bit describes project ID or project inheritance. Successful ioctl queries on the
new ext4/upper objects supply additional evidence for those fields; failed base
queries leave them unknown. This is not a permissive admission mask.

## Why the base immutable indication needs semantic care

The returned masked-in immutable bit must not be discarded. It also must not be
blindly translated into `SETFLAGS(IMMUTABLE)` on every restored upper object.
Upstream `ovl_getattr` obtains the backend's `kstat` and then calls
`generic_fill_statx_attr`. That helper **ORs** effective VFS protection bits; it
does not clear a pre-existing backend immutable indication. Consequently the
result can carry a backend indication without proving a separate user-settable
immutable policy for the overlay pathname. No write attempt or flag setter is
performed on these base objects in this research.
[OverlayFS getattr](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/overlayfs/inode.c)
[VFS attribute fill](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/stat.c)

There is a concrete compatible explanation: upstream EROFS `erofs_getattr`
unconditionally reports immutable and declares immutable/compressed support.
With the generic/overlay bits this yields the observed `0x203034` support mask.
EROFS's generic inode operations do not provide `fileattr_get`. **This run does
not establish that the hidden lower mounts are EROFS**; the matching pattern is
an inference from source, not measured engine provenance or permission to
normalize the bit. Exact lower filesystem provenance and effective policy
semantics remain unresolved.
[EROFS source](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/erofs/inode.c)

## The 42 controlled mutation and tar trials

Each combination uses a new UUID-owned source and two destinations on the same
surface: upper overlay, home ext4 or Docker ext4. Both setter interfaces are tested
separately. Immutable, append and nodump are tested on files and directories;
project-inherit is tested on directories. Existing values are captured, the one
intended flag is added, both query interfaces and `statx` are read back, and all
changes are reverted and checked before exact cleanup.

| Flag | GETFLAGS bit | FSGETXATTR bit | Successful set/read-back/revert cases |
| --- | --- | --- | ---: |
| Immutable | `0x10` | `0x8` | 12 |
| Append-only | `0x20` | `0x10` | 12 |
| Nodump | `0x40` | `0x80` | 12 |
| Directory project-inherit | `0x20000000` | `0x200` | 6 |

For each case, the fixture creates one PAX archive before setting the flag and
one after. It uses research37's complete `-G` recipe: fixed environment, PAX,
numeric owners, ACLs, every xattr namespace, sparse 0.0, deterministic header
names, and removed atime/ctime extended headers. All archives are 10,240 bytes,
exit zero without warnings, and are **byte-for-byte identical with/without the
flag**. Parsed member metadata contains only `mtime` and directory `GNU.dumpdir`
PAX keys; no key represents the tested flags. Nodump does not cause omission in
this recipe: the synthetic item and its child, where present, remain members.

All 42 extractions into initially unflagged destinations exit zero; read-back
returns GETFLAGS `0x80000` and FSGETXATTR xflags zero. That directly demonstrates
omission of all four tested policy flags. Querying `statx` alone would miss even
the synthetic project-inherit loss because its supported mask/values do not change.

The second destination already has the same flag set before extraction:

| Destination state | Measured default PAX `-G` extraction |
| --- | --- |
| Immutable file or directory | Exit 2; cannot replace file/child and directory metadata operations fail |
| Append-only file or directory | Exit 2 with the same class of replacement/metadata failures |
| Nodump file | Exit 0; replacement file loses nodump |
| Nodump directory | Exit 0; retained directory inode keeps nodump |
| Project-inherit directory | Exit 0; retained directory inode keeps project-inherit |

Thus successful extraction can both omit source policy and retain destination
policy, depending on object type and replacement behavior. Flags that block
replacement also impose ordering requirements. These facts require preservation
or rejection under a complete-fidelity contract; this note implements neither.

Project ID remains zero throughout. This tests the project-inherit **flag**, not
nonzero project-ID transfer, quota enforcement or actual child-inheritance policy.
No immutable/append flag is applied to an ancestor outside a trial's own object.
The final read-back matches both original ioctl structures before those objects
are removed. Setter success alone was never accepted as proof of the new state.

## Limits and cleanup

No API here proves absence of all inode attributes on the failed base-query class.
`statx` proves only corresponding supported indications, with the OverlayFS
interpretation caveat above. No setter is attempted on a base file or directory;
therefore whether a setter could copy one up remains unmeasured. No generic flag
mask, noatime/sync/dirsync behavior, casefold, encryption, verity, project-ID
semantics, extent migration or feature restoration is certified. These results
also do not prove a whole Agent migration or a safe full-root restore ordering.

The 2 GiB host-space guard passes with 9,159,798,784 bytes available before the
final run. Full metadata probing plus all trials completes in about 1.57 s;
this is not a migration benchmark. Python syntax, embedded-source equality,
JavaScript syntax and recorded assertions for all inventories/trials pass.

Both runs thaw the original container, restore worker membership and remove the
owned maintenance cgroup. They remove the exact sandbox, loaded probe alias and
synthetic host directory, with no cleanup errors. Independent final inventory:
`sandboxes=[]`; only pre-existing vendor `claude-code-docker` ID `94670d5b2a24`
and `shell-docker` ID `5fc81bc7a127` remain. Host free space is 8.5 GiB.
sbx has been explicitly ceded to the parent and is no longer in use by this task.
