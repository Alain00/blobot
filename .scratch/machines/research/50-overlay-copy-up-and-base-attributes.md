# Base statx immutable does not block the measured OverlayFS mutations; copy-up changes the query class

2026-09-06 local date; run started `2026-09-05T23:38:34.657Z` UTC.

**For the tested image paths, `GETFLAGS=ENOTTY`, `FSGETXATTR=ENOTTY` and masked-in
`statx IMMUTABLE` become successful upper-style attribute queries after ordinary
OverlayFS copy-up.** Opening `/.rock/metadata.yaml` with `O_RDWR`, without writing
a byte, is sufficient. The original immutable indication does not block that
open or a subsequent verified append. Deleting another unmodified base file also
succeeds. Conversely, explicitly setting immutable after copy-up makes both
append and unlink fail with `EPERM`, even for the same root worker.

This resolves the narrow effective-permission question for these samples. It
does **not** authorize discarding flags, treating `ENOTTY` as zero, restoring every
base object as an upper object, or declaring complete migration supported.

## Evidence and containment

- [Host fixture](50-overlay-copy-up-fixture.mjs), [guest worker](50-overlay-copy-up-worker.cjs),
  [Python attribute probe](50-overlay-copy-up.py), [recorded results](50-overlay-copy-up-results.json).
- Exactly one sandbox: `blobot-copyup50-435e0f24-57f4-4c0c-b468-bb4fe6b7dff1`,
  ID `1dd4346b-a620-465a-95e5-3b81b808b369`. No second-box comparison or reboot.
- Darwin arm64 host; Linux `7.0.12` arm64 guest. sbx client/server
  `v0.42.0-rc5`, revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`.
- The approved local archive from research40 remains at
  `/private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar`. The fixture
  loads it locally under `blobot-machine-probe:explicit-docker-20260905`, checks
  returned image ID `1cd3184fceaf` against the recorded manifest
  `sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c`,
  and removes that owned alias afterward. This run checks the returned prefix,
  not an independently recomputed full image manifest.
- Privileged 2-CPU/2-GiB kit, private home/Docker volumes, empty credential and
  network-allow lists, one newly created synthetic host worktree. No provider,
  login, download, guest network request or global policy/settings mutation.
  The script reads the existing SSH-forwarding setting and requires false.
- As in research36/40, Docker is gracefully stopped, the worker moves into an
  owned sibling cgroup, and the original app-container cgroup is frozen. A private
  mount namespace contains one **nonrecursive** bind view of `/` below tmpfs
  `/run`; the view has no descendant mounts. Mutations therefore address the
  disposable guest root overlay, never injected host mounts.
- Only public base-image samples and a generated UUID marker are read or changed.
  File contents remain inside the guest; the report stores hashes, sizes,
  metadata and operation results. There is no persisted private inventory.

## Measured transitions

All six initial samples have both ioctl queries return `ENOTTY` (25), with
`statx attributes=0x10`, supported mask `0x203034`. The regular files are
`/.rock/metadata.yaml`, `/etc/issue`, `/etc/issue.net`, `/etc/debian_version`;
the directories are `/.rock` and `/usr/share/doc`.

| Operation | Measured result |
| --- | --- |
| Open metadata file `O_RDWR`, close without writing | Success; GETFLAGS `0x80000`; all five FSGETXATTR fields zero; statx `0 / 0x303874` |
| Append UUID marker to that file | Success; file hash actually changes |
| Restore its bytes, owner/mode, atime and mtime | Compared content/metadata restored; ioctl/statx class remains upper-style |
| Set immutable on the now-queryable file | Success; GETFLAGS `0x80010`, FSGETXATTR xflags `8`, statx `0x10 / 0x303874` |
| Append / unlink with that explicit flag set | Both `EPERM` (1); content and pathname remain |
| Clear explicit immutable | Success and read-back; GETFLAGS returns to `0x80000`, FSX xflags zero |
| `chmod` `/etc/issue` to its existing mode | Success; same upper-style ioctl/statx class |
| `chmod` `/usr/share/doc` to its existing mode | Success; same upper-style ioctl/statx class |
| Unlink initially base-backed `/etc/issue.net` | Success; a subsequent lstat returns `ENOENT` |
| Recreate it with identical bytes and compared metadata | Success; upper-style query class, no initial immutable indication |
| Read-only control `/etc/debian_version` | Exact before/after snapshot equality computed within Python; still ENOTTY/initial statx class |

The open-without-write comparison includes mode/type, UID/GID, size, atime/mtime,
file SHA-256, xattr names/value hashes and regular-file link count. All are equal
before and after the open. It intentionally does not claim equality of ctime,
inode identity, allocation or unqueryable attributes. Thus equal content and
these ordinary metadata fields alone do not distinguish the initial base-backed
representation from a copied-up representation.

**Copy-up also affects ancestors.** Immediately after the child file's `O_RDWR`
open, `/.rock` changes from ENOTTY/initial immutable to successful
`GETFLAGS=0x80000`, FSGETXATTR zero and statx `0 / 0x303874`. Its reported directory
size changes 52→4096, blocks 8→16 and link count 2→1. Owner, mode and atime/mtime
remain equal. A strategy that skips unchanged regular files still has to account
for ancestor-directory changes caused by restoring a different child.

Raw results keep all returned API fields rather than defining an admitted flag
mask. `0x80000` is the extents representation flag, not evidence that every
possible filesystem property has been enumerated. The final content-restoration
cleanup does not undo copy-up; the entire owned sandbox is then removed.

## Primary-source interpretation

The upstream OverlayFS documentation describes write opens and metadata changes
as copy-up triggers, including an `O_RDWR` open that never changes data. Copy-up
also creates required ancestor directories in the upper layer. This matches the
operations and transitions above; the experiment does not inspect the engine's
hidden upper/lower mountpoints directly.
[OverlayFS documentation, Non-directories](https://docs.kernel.org/filesystems/overlayfs.html#non-directories)

Upstream v7.0.12 `ovl_getattr` starts with the selected real object's attributes,
then adds effective overlay inode attributes. `ovl_fileattr_get` queries the real
object and retains query errors; its helper translates `ENOIOCTLCMD` to `ENOTTY`.
These are different observation paths, so the initial `statx` bit does not make
the failed ioctl query a successful immutable-policy query.
[OverlayFS inode.c, ovl_getattr / ovl_fileattr_get](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/overlayfs/inode.c)

The same-version upstream EROFS getter unconditionally reports immutable and
declares that attribute supported, while its generic inode operations omit
`fileattr_get`. This remains a compatible explanation for the original pattern,
not a measurement that sbx's hidden lower mounts are EROFS. Matching `uname`
also does not prove Docker's kernel exactly matches the upstream source.
[EROFS inode.c](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/erofs/inode.c)

Upstream `ovl_copy_fileattr` tolerates `ENOTTY`/`EINVAL` from the lower query.
Where actual lower immutable/append protection flags are available, it uses
overlay protection xattrs rather than simply applying them to a new upper inode
before linking it. This source behavior is not a blanket flag-loss waiver for
an application archive/restorer. Research40 already demonstrates real loss of
settable policy flags through the PAX recipe.
[OverlayFS copy_up.c, ovl_copy_fileattr](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/overlayfs/copy_up.c)
[Measured PAX omissions](40-file-attributes-and-tar-omission.md)

## What this permits investigating, and what remains unproved

The unchanged control demonstrates that read-only measurement can leave an
initial base sample in its original observed class. Preserving identical base
objects **without rewrite** is therefore a concrete direction to test further,
not a verified migration route. This run neither compares two fresh boxes nor
reconstructs a destination from a source.

The unresolved gates are:

1. Establish same-base equivalence and safe provenance/classification across two
   candidates, including objects previously copied up without content changes.
   A file hash alone cannot do this, and ENOTTY still leaves other attributes
   unknown. No generic flag normalization is adopted here.
2. Handle directory copy-up caused by children, plus removals, whiteouts, type
   changes and hard-link relationships. This probe measures visible deletion
   and recreation, not the hidden whiteout representation or a whole-tree merge.
3. Preserve or reject user-set attributes on queryable entries, including the
   immutable/append/nodump/project-inherit failures already measured in research40.
   The effective immutable control here specifically confirms that real
   protection flags must not be silently dropped.
4. Prove restoration and final verification while writers remain held. No
   maintenance-start mechanism, postboot behavior, Docker state migration or
   full-root migration is tested by this fixture. Research38's dockerd.log
   observation is neither changed nor generalized into an exclusion.

One reporting limitation: Python compares integer metadata before transport,
but the current worker parses its JSON into JavaScript numbers. Stored 64-bit
inode numbers and nanosecond timestamps can therefore be rounded in the results
file. The guest-computed equality booleans are exact for the compared fields;
raw exported large numbers must **not** be used as exact inode identities or
nanosecond-value evidence. Flags, masks, errno, sizes here, hashes and the
operation outcomes are within exact ranges. No inode-identity claim depends on
those exported values.

## Validation and cleanup

Python AST and both JavaScript syntax checks pass. The live fixture exits zero;
all five guest equality/content checks and host transition/permission assertions
pass. It records frozen-state and unchanged original mount-namespace checks,
then thaws the app container, restores worker membership and removes its sibling
cgroup. Original public sample bytes are restored and the explicit immutable
flag is cleared before sandbox removal.

Recorded host-space checks remain above 20,876,709,888 bytes (about 19.4 GiB),
well above the 2-GiB floor; the probe also samples available space every 250 ms.
Cleanup reports no errors, no owned boxes or loaded aliases left, and removal
of the private host temporary tree. Only these research50 files are created;
there are no production/tracker edits, commits or changes to preservation guards.
