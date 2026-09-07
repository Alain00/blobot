# Same-image selection leaves the measured ENOTTY base class alone, but misses seven attribute differences

2026-09-06. Run started `2026-09-06T00:09:39.242Z` UTC.

**In this pair of new boxes using the same loaded image, all 60,946 source entries
with both `GETFLAGS` and `FSGETXATTR` returning `ENOTTY` remain unselected.** They
have equal encoded PAX members and equal observed API profiles on both sides.
The selector chooses 45 other members. No root restoration is attempted.

**Seven shared members have identical PAX but different queried attributes, and
all seven are also unselected:** the approved copy-up-without-content-change
sample and six synthetic immutable/nodump/append markers. Thus the observed
ability to retain unchanged base members does not make PAX equality sufficient
for attribute equivalence or justify ignoring `ENOTTY` or settable flags.

## Evidence and exact scope

- [Host fixture](56-base-selection-fixture.mjs), [guest worker](56-base-selection-worker.cjs),
  [synthetic seeder](56-base-selection-seed.py), [attribute scanner](56-base-selection-attributes.py),
  [aggregate results](56-base-selection-results.json), [offline verifier](56-base-selection-verify.mjs).
- Two boxes, one authorized run, shared UUID `204c0308-1e4f-4623-8ce2-1d634d8e314a`:
  `blobot-compare56-204c0308-1e4f-4623-8ce2-1d634d8e314a-source` and `-target`.
- Darwin arm64 host, sbx client/server RC5 revision
  `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`. The approved local archive
  `/private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar` supplies the
  same loaded alias to both kits. Returned image ID `1cd3184fceaf` is checked
  against the previously recorded manifest prefix; this run does not recompute
  a new independent full image manifest.
- Each box has 2 CPUs, 2 GiB RAM and private home/Docker volumes. Both mount only
  the same new synthetic host worktree. No provider, login, credential, download,
  external guest network request, policy change or global-setting mutation.

The destination is newly created, with one declared exception to pristine stock
state: **both boxes receive the same small synthetic marker tree**, with equal
bytes, modes and nanosecond mtimes. This isolates source-only flag changes while
keeping their PAX representation equal. Only source markers receive immutable,
nodump and append, each on one regular file and one directory. Both sides also
receive a FIFO, symlink, character-device node and block-device node as metadata
probes; no data descriptor is opened for those objects.

Only the source changes the three approved public-image samples: it appends
synthetic text to `/etc/issue`, removes `/etc/issue.net`, and opens
`/etc/debian_version` `O_RDWR` without writing content. The marker tree is
`/opt/blobot-compare56-UUID`; there are no mutations of other public base files
or any real workspace. Ordinary ancestor-metadata effects are not suppressed.

## Actual production functions, executed inside each guest

The host imports the compiled functions, captures their `.toString()` sources and
sends those definitions to the guests. It does not run the inventory/selection
functions on host data. Function-source hashes measured in this run:

| Function | SHA-256 |
| --- | --- |
| `prepareSbxStateMaintenance` | `a08ffc6ad386bc04aa1fd7920a4115c5cd92f0c122f4dcefe5b217852436c68a` |
| `readSbxStateTree` | `f8f69f92811304a79ff432e8ae3d41957e4fd817a5553ea6681a091e73808904` |
| `createStateArchiveVerifier` | `cb1d5f4808c3b87f29deb4b243662c1eb18c6f067947d4d47d903fc86d664913` |
| `createSbxArchiveIndex` | `85ec340419df0b465592586f9ae3eea93f95d73a7360e02cf7d84bbbf2d9a144` |
| `selectSbxArchiveMembers` | `0742a1f1f4ca09a4597ecd55bdf1f7e39c810fa1f258e1db1da7a99c2641a7ec` |

Preparation runs in an unshared private mount namespace, gracefully quiesces
Docker, moves the worker into its sibling cgroup and freezes the app container.
It exposes its production nonrecursive root/home/Docker views, read-only for
source and writable for target. This fixture reads **rootfs only** with the actual
tree reader; it neither restores any tree nor transfers home/Docker state.
[Preparation](../../../packages/core/src/machines/sbx/state-maintenance.ts)
[Reader](../../../packages/core/src/machines/sbx/state-tree.ts)
[Index/selector](../../../packages/core/src/machines/sbx/state-archive-index.ts)

Each guest validates and indexes its complete local PAX stream. Each stream is
1,597,655,040 bytes; source has 62,742 members and target 62,743. Their whole-archive
hashes differ, as expected from a deliberately modified source and separately
initialized guests. Equal image selection does not imply identical mutable roots.
The scanner covers exactly the same pathname set as the corresponding archive
index, an invariant checked inside the receiving guest.

The source serializes its validated index plus attribute inventory into private
data frames. The host relays **opaque bytes** with backpressure to the target,
which decodes and compares them. It never decodes or persists this inventory.
No full tar stream leaves either guest. The relay is 34,548,097 bytes in 528 frames,
each at most 65,536 bytes; its aggregate checksum is checked at both ends.
Only grouped counts, API profiles, fixed synthetic-case results and tree digests
are emitted as report data. No per-path inventory, name list, individual-member
hash or file content is stored in the report.

## Selection and API classes

| Object type | Source entries | Target entries | Selected source members |
| --- | ---: | ---: | ---: |
| Directory | 7,580 | 7,580 | 26 |
| Regular file | 53,419 | 53,420 | 16 |
| Symlink | 1,740 | 1,740 | 3 |
| FIFO | 1 | 1 | 0 |
| Character device | 1 | 1 | 0 |
| Block device | 1 | 1 | 0 |

The unselected **both-ENOTTY** class consists of 53,396 regular files and 7,550
directories. Every member in these two groups has the same PAX digest on source
and target, both queries return errno 25, and `statx` returns attributes `0x10`
with support mask `0x203034` on both sides. There are **zero selected members in
this class**, including zero selected only because of ancestor closure.

This is an observed base-like API class, not a proof of the hidden backing
filesystem or a statement that its unqueryable flags are zero. Nor does matching
the same API errors enumerate all possible filesystem state.

The selected members comprise 39 directly different encoded members and six
additional directories whose own encoded members initially match. Those six
are selected by the ancestor rule. Selected regular files/directories have
successful source flag queries. The selected symlinks are different: their
descriptor ioctls are **deliberately unqueried**, not successful-zero results.
Their `statx` profile is `0 / 0x303874` on both sides.

The one target-only entry is the deliberately removed public sample. Its source
parent is selected, so its dumpdir would participate in an eventual extraction.
This run does not execute that deletion. It also does not attribute every other
selected path to a particular startup service: the saved evidence is aggregate.
Nothing here creates a blanket exclusion for logs, metadata or startup writes.

## Equal PAX, different queried attributes

| Fixed case | PAX equal? | Selected? | Source vs target attribute observation |
| --- | --- | --- | --- |
| Public content modification | No | Yes | Source queryable; target both ENOTTY with statx immutable |
| Public no-content copy-up | Yes | No | Source GETFLAGS `0x80000`, FSX zero, statx `0 / 0x303874`; target both ENOTTY, statx `0x10 / 0x203034` |
| Immutable file and directory | Yes | No | Source GETFLAGS `0x80010`, FSX xflags `8`, statx immutable; target lacks the explicit flag |
| Nodump file and directory | Yes | No | Source GETFLAGS `0x80040`, FSX xflags `128`, statx nodump; target lacks the flag |
| Append file and directory | Yes | No | Source GETFLAGS `0x80020`, FSX xflags `16`, statx append; target lacks the flag |

All six target flag controls have GETFLAGS `0x80000`, FSX xflags zero and statx
attributes zero. Other returned FSGETXATTR fields are zero in these controls.
No setter modifies the destination. The six explicit source flags are read back
before comparison and cleared only during cleanup after both snapshots have
been compared.

The counter named `samePaxDifferentAttributes` compares the complete returned
GETFLAGS/FSGETXATTR/statx attribute-and-mask structures plus xattr name/value
hash maps. **Its value seven is not the number of all non-PAX metadata differences.**
The scanner also captures lstat mode, owner/group, size, link count, inode/device,
rdev and atime/mtime/ctime; identity and timestamp coordinates are not folded
into that API-profile counter. It separately counts 38 shared paths with different
numeric inode/device coordinates. Equal coordinates across VMs do not prove
shared inode identity. Allocation/block accounting is not certified here.

All 64-bit identities, sizes, timestamps and statx attribute/mask values are
encoded as decimal strings in the guest-to-guest representation, avoiding
JavaScript-number rounding. The report keeps only aggregates of those comparisons.

## Safe queries for nonregular objects

The scanner obtains `lstat`, `statx(AT_SYMLINK_NOFOLLOW | AT_NO_AUTOMOUNT)` and
no-follow xattr names/values for the pathname itself. It does **not** open a
data descriptor or issue GETFLAGS/FSGETXATTR for symlinks, FIFOs, character/block
devices or sockets. Regular-file/directory descriptors alone receive the ioctls.
These are filesystem metadata queries; this does not claim absence of underlying
filesystem I/O, only absence of device/FIFO data opens or reads and symlink-target
following by this scanner.

Across both boxes, metadata queries succeed for 3,480 symlinks and two each of the
FIFO, character-device and block-device probes, with no xattr-query error. Two
temporary UNIX socket probes also succeed; they are created and removed in the
owned control tmpfs **outside all archived persistent views**. This avoids
turning GNU tar's socket omission into an apparent complete root archive.
All these nonregular ioctl results are explicitly recorded as skipped.

The `statx` contract distinguishes returned attributes from their support mask
and provides no-follow pathname queries. A supported clear bit answers only
that bit; an unsupported bit is not known clear. No-follow xattr APIs operate on
the symlink itself. The descriptor-based flag interfaces expose additional state
for the ordinary files/directories where they succeed; skipping them elsewhere
does not certify those properties absent.
[statx](https://man7.org/linux/man-pages/man2/statx.2.html)
[listxattr](https://man7.org/linux/man-pages/man2/listxattr.2.html)
[inode flags](https://man7.org/linux/man-pages/man2/ioctl_iflags.2.html)
[FSGETXATTR](https://man7.org/linux/man-pages/man2/ioctl_xfs_fsgetxattr.2.html)

## Implication, limits and cleanup

The bounded positive result is that this same-image pair does not ask to rewrite
the measured source both-ENOTTY class. The bounded negative result is that an
encoded-equal member can still have different observable attributes, including
real settable protection flags. Any preservation/admission layer must address
that difference separately; this note chooses no normalization, admission mask,
flag waiver or product-contract change.

No root extraction, migration, home/Docker copy, post-copy verification or
postboot verification is performed. No project-inherit/nonzero project-ID,
quota, encryption, verity, allocation, hidden-layer provenance or exhaustive
special-file attribute guarantee is established. The no-content copy-up case
does not by itself decide which representation should be preserved or how.

Syntax/AST checks pass. The offline verifier passes **132 assertions**, including
script hashes, the observed selection/attribute cases, privacy-shape invariants
and cleanup. No retry was required. The sampled host RSS peaks at 90,357,760 bytes;
this is an observation of this relay, not a general memory bound. Recorded free
space remains above 20,914,663,424 bytes, exceeding the 2-GiB floor.

Both workers clear owned flags, dispose their views and exit while the original
app containers remain frozen, as the production helper requires. The lifecycle
owner then removes both exact owned boxes, the locally loaded alias and the host
temporary tree. Cleanup reports no errors or remaining owned resources. No
production, tracker, lockfile or dependency changes are made. sbx is released
to the parent and no live operation remains pending.
