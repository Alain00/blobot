# Extra directory xattrs need reconciliation; special-object flags remain unverified

2026-09-06. One synthetic sbx fixture under production maintenance answered three bounded questions. **GNU tar restored the tested ACLs exactly but retained target-only `user.extra` directory attributes. Removing only extra attribute names before or after extraction produced an identical complete PAX archive. One `SETFLAGS` call reproduced both flag APIs in ten directory cases. The newer nofollow `file_getattr` syscall exists, but still fails on the tested base objects, FIFO and symlink.** No root migration, production change or relaxation of the preservation contract follows from this result.

Evidence: [host fixture](58-attributes-fixture.mjs), [guest worker](58-attributes-worker.cjs), [Python probe](58-attributes-probe.py), [recorded results](58-attributes-results.json), and [offline verifier](58-attributes-verify.mjs). The verifier passes **239 assertions** without starting sbx.

## Measured environment and containment

The sole box UUID was `f5d1a869-7c64-415a-a201-2f56b12ba5c3`, started at `2026-09-06T00:20:19.473Z`. sbx client/server were RC5 revision `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`; the guest reported Linux `7.0.12`, aarch64, and GNU tar `1.35`. The existing approved local tar supplied image `blobot-machine-probe:explicit-docker-20260905`, manifest `sha256:1cd3184fceaf6d60c0f364c81bdb26f3359bab91efc666cd172fb75c68ed974c`. There was no registry download, guest network request, provider, login or credential. The kit used 2 CPUs, 2 GiB RAM, private home/Docker volumes and an exclusively synthetic host worktree.

The compiled `prepareSbxStateMaintenance` function was transported as source and run with target role inside a private mount namespace. Its normal assertions quiesced Docker, froze the original container cgroup, kept the worker in its maintenance sibling and established nonrecursive private views. The probe created exactly two synthetic trees beneath an owned `/opt/blobot-attributes58-*` root in that view, reusing the target tree across trials. Only three public image paths received additional read-only metadata controls; no base path was mutated or copied up. No filesystem-wide inventory or archive was made.

The synthetic source archive was 20,480 bytes, SHA-256 `3edf5094f01ef2ad4e04d80bd4e49ae1bdacafd06b6d043a3bf209c63aaddce6`. Its bytes stayed in guest memory. The stored observations contain only synthetic metadata and labeled public-base query outcomes. `statx` words, nanosecond timestamps and inode numbers are decimal strings. The new syscall's observed 64-bit xflags values were all zero, exactly representable in the stored arrays; a general codec must still preserve the full unsigned 64-bit field.

The guest removed its trees after clearing its flags. Views were disposed while the original container remained frozen; the fixture then stopped and removed its own box. Its loaded alias and host temporary directory were removed. All cleanup arrays are empty. Minimum sampled host free space was `21038342144` bytes, above the 2 GiB floor. No other machine, policy, global setting, production file, tracker, lockfile or commit was changed.

## Directory xattrs and ACLs: what actually required removal

Source and destination each had `plain` and `acl` directories with one regular child, plus a FIFO and a symlink. The source's `plain` directory had no access/default ACL. Its `acl` directory had named-user access and default ACLs for synthetic UID 12345. Both destination directories started with different access/default ACLs for UID 23456, a wrong `user.shared` value and target-only `user.extra`. The source had its own `user.shared` value. Mode, ownership, bytes and nanosecond mtime were independently checked, along with raw nofollow xattr values.

Creation used the established full PAX incremental recipe: `-G --sort=name --format=pax`, deterministic extended-header names, deletion of atime/ctime PAX keys, `--numeric-owner --acls --xattrs --xattrs-include=* --sparse --sparse-version=0.0 --atime-preserve=system`. Extraction used `-G --numeric-owner --acls --xattrs --xattrs-include=* --delay-directory-restore -xpf -`. This was complete extraction of the tiny synthetic archive; it did not test selective membership again.

| Trial | Extra attributes removed explicitly | Observed final result |
| --- | --- | --- |
| Tar directly into existing target | None | Tar exits 0 with no warning. Both directories retain `user.extra`; complete PAX differs. |
| Remove target-only names before tar | `plain`: access ACL, default ACL, `user.extra`; `acl`: `user.extra` | All compared metadata and content match; complete PAX bytes equal source. |
| Remove target-only names after tar | `user.extra` from each directory | All compared metadata and content match; complete PAX bytes equal source. |

In every extraction, tar itself removed the two ACL xattrs when the source had none, and replaced the named ACL entries when the source had an ACL. It overwrote the wrong `user.shared` values. Therefore the **observed required additional removal was the two `user.extra` names**, not an unconditional ACL wipe. Each explicit `removexattr(..., follow_symlinks=False)` preserved the directory mode and nanosecond mtime and changed ctime. No chmod/utime repair was required for these removals. Source snapshots remained unchanged across all three restores. Tar's regular-file, FIFO and symlink metadata also matched.

The generic shape measured here is a set difference between source and target attribute names, followed by exact readback. An attribute present in both must retain the source's value rather than be deleted as an extra. Repeating the full PAX comparison detects residual encoded differences. This does **not** certify arbitrary security/system namespaces, protected attributes, race resistance, capability ordering, conflicting immutable/append state, or all ACL/filesystem implementations. It does not justify erasing every attribute indiscriminately. Atime preservation and ctime equality are outside this PAX comparison.

GNU documents the attribute options and their namespace filtering, but not a promise to remove every destination attribute absent from the archive. `--xattrs-include=*` is needed to include non-user namespaces during extraction. ACLs and mode bits are related; a general sequence must verify both after mutation, even though the tested removals preserved mode. [GNU tar extended attributes](https://www.gnu.org/software/tar/manual/html_chapter/operations.html), [ACL semantics](https://man7.org/linux/man-pages/man5/acl.5.html).

## Nofollow APIs on FIFO and symlink

The probe successfully used `lstat`, `statx(AT_SYMLINK_NOFOLLOW | AT_NO_AUTOMOUNT)` and Python's nofollow list/get/set/remove-xattr operations. `statx` returned attributes `0`, supported-attribute mask `3160180` (`0x303874`) on both new objects. This is a supported-bit result, **not a complete flag inventory**.

On each new FIFO and symlink:

- A metadata-only `O_PATH | O_NOFOLLOW` descriptor succeeded. `GETFLAGS`, `FSGETXATTR`, and an attempted zero-valued `SETFLAGS` through it each failed with `EBADF` (9), without a successful mutation.
- A nofollow `user.blobot58` write failed with `EPERM` (1).
- A nofollow `trusted.blobot58` write, exact value readback and removal succeeded. Final xattr maps, mode, ownership, mtime and inode were unchanged; ctime changed. The symlink referent remained unchanged.
- No data descriptor was opened for either object, and no FIFO read/write occurred. Metadata syscalls may still cause filesystem I/O; “no data open” is the precise containment statement.

The `O_PATH` failure is documented behavior: ordinary ioctl operations are not allowed on that descriptor. The xattr namespace result is consistent with Linux restricting `user.*` to regular files/directories and permitting privileged `trusted.*` access. It would be incorrect to treat all special-object xattrs as unsupported. [open/O_PATH](https://man7.org/linux/man-pages/man2/open.2.html), [xattr namespaces](https://man7.org/linux/man-pages/man7/xattr.7.html), [statx contract](https://man7.org/linux/man-pages/man2/statx.2.html).

## New path-based file-attribute API: available, but not a complete route

Upstream Linux v7.0.12 defines `file_getattr` and `file_setattr` with `(dirfd, pathname, buffer, size, at_flags)`. The new **24-byte** `struct file_attr` contains uint64 xflags, then uint32 extsize, nextents, projid and cowextsize. It differs from the **28-byte** ioctl `struct fsxattr`, which uses uint32 xflags and eight padding bytes. The path syscalls accept `AT_SYMLINK_NOFOLLOW` and `AT_EMPTY_PATH`; they do not accept `AT_NO_AUTOMOUNT` in this implementation. Both generic/arm64 and x86-64 tables assign numbers 468/469. These facts come from source, and only aarch64 execution was measured. [UAPI structures](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/include/uapi/linux/fs.h), [generic syscall table](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/scripts/syscall.tbl), [x86-64 table](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/arch/x86/entry/syscalls/syscall_64.tbl), [syscall implementation](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/file_attr.c).

| Nofollow GET control | Observed result |
| --- | --- |
| Base regular file, base directory, base symlink | `EOPNOTSUPP` (95); statx retains `0x10 / 0x203034` |
| New regular file and directory | All five fields zero; legacy GETFLAGS is `0x80000`, FSGETXATTR has five zeros |
| New FIFO and symlink | `EOPNOTSUPP` (95); legacy descriptor query deliberately skipped |

The base samples were `/.rock/metadata.yaml`, `/.rock` and `/bin`; `lstat` confirmed their types. The first two also returned GETFLAGS `ENOTTY` in this run. The combined ioctl helper aborts after that first failure, so research58 does not independently repeat their FSGETXATTR failure; research56 already measured both interfaces.

The path getter's success on the two new regular/directory controls proves syscall availability here. Its failure elsewhere therefore is not a blanket absent-syscall result. The implementation converts absent fileattr operations and ENOTTY to `EOPNOTSUPP`. `file_setattr` was **skipped**, not called with invented zeros, for FIFO/symlink because GET failed. It was not tested on the regular/directory controls. Actual successful mutations in this run used legacy SETFLAGS. The newer API does not expose legacy-only flags such as DIRSYNC, TOPDIR or the structural EXTENTS bit, so even a successful getter is not a replacement for every existing observation.

## One SETFLAGS can produce both expected flag views in the measured directory cases

For each case, the fixture created a source and target directory, queried both, set the source, then issued exactly one `SETFLAGS` on the target with the source's observed legacy word. It queried GETFLAGS and all five FSGETXATTR fields afterward. No FSSETXATTR call was needed. All ten cases matched, with unchanged mode and nanosecond mtime. All extsize, nextents, projid and cowextsize values remained zero.

| Case | Complete GETFLAGS | FSGETXATTR xflags |
| --- | ---: | ---: |
| Initial representation | `0x80000` | `0` |
| Immutable | `0x80010` | `0x8` |
| Append | `0x80020` | `0x10` |
| Nodump | `0x80040` | `0x80` |
| Noatime | `0x80080` | `0x40` |
| Sync | `0x80008` | `0x20` |
| Dirsync | `0x90000` | `0` |
| Topdir | `0xa0000` | `0` |
| Project-inherit | `0x20080000` | `0x200` |
| Combined above policy bits | `0x200b00f8` | `0x2f8` |

The exact common-flag translations appear in `fileattr_fill_flags`/`fileattr_fill_xflags`. In the generic setter, a legacy flags request preserves the existing extended fields not supplied by that request. Consequently **SETFLAGS does not assign an arbitrary desired project ID or extent hints**. Ext4 additionally masks visible-but-not-settable flags, so syscall success alone cannot certify exact reconstruction. Readback of both representations remains necessary. The measured `0x80000` is structural representation, not an additional user-policy guarantee. These ten cases are not a universal admission mask, and neither nonzero project IDs nor inheritance behavior was tested live. [generic translation/setter](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/file_attr.c), [ext4 getter/setter](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/ext4/ioctl.c).

## Read-only follow-up: why unsupported special getters still leave meaningful state

The upstream tables explain the negative result. OverlayFS's symlink and special inode operations omit `fileattr_get` and `fileattr_set`, although they implement getattr/xattr operations. Ext4's corresponding tables also omit these callbacks. This is consistent with the live result, without proving that Docker's kernel build equals every upstream source line. [OverlayFS inode tables, lines 743–760](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/overlayfs/inode.c), [ext4 special table, line 4233](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/ext4/namei.c), [ext4 symlink tables](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/ext4/symlink.c).

Absence of a getter does not imply absence of underlying state:

- Ext4 initializes a new inode from its parent's inherited flag mask, then filters for the new type. Its non-directory/non-regular mask retains **NODUMP and NOATIME**. SYNC and the PROJINHERIT bit are filtered out for FIFO/symlink. These are source-code creation rules, not an observed inheritance experiment. [inheritance/type masks](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/ext4/ext4.h), [new-inode initialization](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/ext4/ialloc.c).
- Separately, when ext4's project feature is enabled and the parent has PROJINHERIT, inode allocation copies the parent's project ID. That assignment is not restricted to directory/regular types. Thus a special inode can have inherited project identity without carrying the PROJINHERIT flag itself. This fixture did not measure filesystem project-feature enablement, nonzero project IDs or quota effects. [project-ID initialization, lines 988–992](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/ext4/ialloc.c).
- Ext4 getattr exposes NODUMP through statx, but statx does not expose NOATIME or project ID. A masked-in zero NODUMP result answers that one question only. [ext4 getattr, lines 6107–6117](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/ext4/inode.c), [statx attributes](https://man7.org/linux/man-pages/man2/statx.2.html).
- OverlayFS ordinary creation uses the upper parent, while creation over whiteouts and copy-up can use temporary workdir paths. Its explicit fileattr copy-up step is restricted to regular files/directories. It is therefore unsafe to infer that replacing a special object will reproduce historical inheritance from the currently visible parent's metadata. No inheritance or special-object copy-up probe was run here. [OverlayFS creation paths](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/overlayfs/dir.c), [copy-up condition, lines 670–678](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/overlayfs/copy_up.c).

These facts support keeping unsupported observations distinct from zero and retaining an explicit gate for a rewrite whose omitted attributes cannot be verified. They do not establish a product exception, a safe default flag value, or that leaving a base object unselected proves every surrounding restore operation preserves it. The receiver, attribute reconciliation order and unchanged-base strategy still require their own complete validation.
