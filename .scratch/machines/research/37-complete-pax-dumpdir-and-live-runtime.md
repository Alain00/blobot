# Complete PAX dumpdirs work; unconditional unlink and directory xattrs need care

2026-09-05. **GNU tar `--incremental` (`-G`) can carry an authoritative directory
inventory inside a full PAX stream without a separate persisted snapshot file.**
In this image, extraction with default replacement semantics restores the complete
synthetic tree, including absent entries and type changes. Re-archiving matches
the source SHA-256. A second fixture restores a complete synthetic chroot containing
Node, tar and their runtime dependencies while Node and tar are executing there.

This is a mechanism result, **not admission of a complete Agent migration**. It does
not run sbx, copy a real rootfs, exercise the private bind mount view from research35,
reopen a migrated sandbox, or relax production guards. In particular, ordinary tar
extraction leaves target-only xattrs on existing directories, and sockets are omitted
with exit status zero. A full-fidelity protocol still needs explicit handling of both.

## Evidence and scope

- [Fixture launcher](37-full-incremental-fixture.mjs),
  [guest worker](37-full-incremental-worker.py),
  [final observations and assertions](37-full-incremental-results.json).
- [Initial negative run](37-full-incremental-first-results.json) retains the
  `--unlink-first` and creation-time `/dev/null` failures.
- Docker Engine socket: `unix:///Users/guillermo/.docker/run/docker.sock`.
  Local image ID:
  `sha256:74d888efe94fb1544ae5a275964cfa5ba00dd96de9b4bd50bd1e8c7d917a19df`.
  This is the supplied derivative of the recorded shell-Docker image, not a new pull.
- Measured runtime: Ubuntu 26.04, GNU tar 1.35, Ubuntu package
  `1.35+dfsg-4ubuntu0.4`, Node `v22.22.1`, arm64.
- Containers use UUID-owned names, `--pull=never --network none --user 0`, no host
  mounts, and Python source supplied through stdin. Trees, archive buffers, mappings
  and outside sentinels exist only inside these containers. The host retains only
  fixture source and synthetic JSON observations, never an Agent inventory/archive.

The installed Ubuntu package is the version listed as fixed for CVE-2026-5704;
recording merely `tar 1.35` would lose that patch information. This observation is
not a general security certification. [Ubuntu package status](https://ubuntu.com/security/CVE-2026-5704)

## What the manual guarantees

`-G` creates an incremental-format archive without a snapshot file. Unlike a chain
of listed incremental backups, it has no previous snapshot from which to omit
unchanged files. On extraction, `-G` and `--listed-incremental=...` use the archive's
directory information to delete destination entries absent from the archived state.
Extraction does not need the snapshot file: `/dev/null` is documented as a common
argument **for extraction**, not as a portable creation recipe.
[Incremental dumps](https://www.gnu.org/software/tar/manual/html_node/Incremental-Dumps.html)

In PAX, this inventory is a `GNU.dumpdir` extended attribute of each directory
member. It is a sequence of status-plus-name records terminated by NUL, followed by
a final NUL. `Y` denotes archived content, `D` a directory, and `N` content retained
without inclusion. The format also supports rename controls; a trusted fresh full
archive does not need a persisted rename history.
[Dumpdir format](https://www.gnu.org/software/tar/manual/html_chapter/Tar-Internals.html)

GNU tar documents default removal/recreation of existing files, including replacing
an existing symlink instead of following it. Existing directories normally retain
their inode while metadata is updated. `--overwrite` changes that behavior and can
follow symlinks or write into existing files. `--unlink-first` removes unconditionally;
it is not required to obtain the default protection for regular files.
[Replacement options](https://www.gnu.org/software/tar/manual/tar.html#Dealing-with-Old-Files)
[Unlink first](https://www.gnu.org/software/tar/manual/html_node/Unlink-First.html)

Directory times and permissions are restored after their children; incremental
archives automatically defer this until the entire archive is processed.
[Directory metadata](https://www.gnu.org/software/tar/manual/html_node/Directory-Modification-Times-and-Permissions.html)

## Exact successful recipe in the fixture

Each process gets a controlled environment with `LC_ALL=C`, `TZ=UTC`, a fixed PATH
and no inherited `TAR_OPTIONS` or `POSIXLY_CORRECT`. Source and receiver execute
inside their respective chroots, with working directory `/` and pipe stdio.

```sh
tar --incremental --sort=name --format=pax \
  --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
  --numeric-owner --acls --xattrs '--xattrs-include=*' \
  --sparse --sparse-version=0.0 --atime-preserve=system \
  -C / -cf - .

tar --incremental --numeric-owner --acls --xattrs '--xattrs-include=*' \
  --delay-directory-restore -C / -xpf -
```

These commands describe the tested transfer. They are not a standalone migration
command: source consistency, mount isolation, complete coverage, receiver preparation,
transport integrity and verified completion are preconditions.

PAX retains fractional mtime when that field is not removed. Deterministic header
names and omission of atime/ctime support comparison after extraction without
normalizing the actual ownership, modes or mtime.
[PAX and reproducibility](https://www.gnu.org/software/tar/manual/html_section/Portability.html)

ACL support and xattrs are opt-in. GNU tar ordinarily extracts only `user` xattrs;
the explicit all-namespace include is needed here for the measured capability xattr.
System namespaces require compatible target semantics and privilege.
[Extended attributes](https://www.gnu.org/software/tar/manual/tar.html#Extended-File-Attributes)

Sparse support records holes and reconstructs them on extraction. The default sparse
format is 1.0; the fixture deliberately selects 0.0.
[Sparse files](https://www.gnu.org/software/tar/manual/html_node/sparse.html)

## Observations, including the failures

| Case | Observed result |
| --- | --- |
| Full PAX `-G`, default extraction | Complete synthetic inventory and source/repeated/re-archive SHA match |
| Plain PAX | Contents restore, but target-only files/directories remain |
| Create with `--listed-incremental=/dev/null` | Exit 2: `Cannot truncate: Invalid argument` |
| Extract `.` with `--unlink-first` | Exit 2: `Cannot unlink: Invalid argument`; existing nonempty directories also fail |
| Extract `.` with `--recursive-unlink` | Exit 2 on `.`; unsuitable for this recipe |
| Default extraction, all 12 type changes among file/directory/symlink/FIFO | All pass, including replacing nonempty directories |
| Target regular file shares an inode with an outside sentinel and an existing mmap | Default extraction creates a new inode; sentinel and mmap retain old bytes |
| Same mapping fixture with `--overwrite` | Existing inode, outside sentinel and mmap all change |
| Target-only `user` xattr on root/existing directory | Survives ordinary `-G` extraction, with exit 0 |
| Target-only default ACL | Removed in this fixture |
| Clear target directory xattrs before extraction | Full synthetic inventory and re-archive SHA match |
| Sparse versions 0.1/1.0 | Repeated archive bytes differ in PID-bearing sparse header names |
| Sparse version 0.0 | Repeated archive and restored re-archive bytes match |
| Bound UNIX socket | Create exits 0 with `socket ignored`; dumpdir contains `Ysock`, but no socket member is restored |
| Explicitly excluded source file | Dumpdir uses `N`; existing target content is preserved |

The positive 10,608,640-byte metadata fixture preserves numeric owners, modes, setgid
directory, mtime `1788635508123456789` ns, binary user xattr, access/default ACL bytes,
`security.capability`, absolute/relative/dangling symlinks, cross-directory hardlink
relationship, FIFO, newline/option-like/long names, sparse contents and measured
extents. Its stable SHA is
`e1cf087a31440f5e12212137f574aecc8c9a71fe5869b59ded4649b65a597dd9`.
The sparse file has logical size 2,097,152 bytes, 8 allocated 512-byte blocks, and
the single observed data extent `[1048576,1052672)` before and after restoration.

These are observed bytes and relationships, not tests of ACL authorization or
execution of the capability-bearing binary. Exact physical allocation across other
filesystems is not promised. GNU's sparse-format documentation explains the
PID-bearing generated names used by 0.1 and 1.0.
[Sparse encodings](https://www.gnu.org/software/tar/manual/html_chapter/Tar-Internals.html)

The directory-xattr repair enumerates **destination directories** with no symlink
following and removes their existing xattrs before extraction. It needs no source
inventory persisted on the host. It is only an experiment: production must implement
safe directory-descriptor traversal inside the verified view, reject unsupported
attribute removal, and prevent concurrent writers. It must not blindly remove
attributes from the original Agent or a namespace containing host mounts.

## Chroot and running-binary replacement

The runtime fixture constructs source and target roots from synthetic data plus the
image's tar, Node, shared libraries and six Node externalized builtins. `/proc` and
`/dev` are empty; there is no `/dev/null`. Copying only ELF dependencies was initially
insufficient: this Ubuntu Node build also needs files under `/usr/share/nodejs`.
The final fixture includes those fixed runtime dependencies.

The target launches Node inside its chroot and waits on stdin. Then GNU tar runs
inside the same chroot and restores all of `.` including its own executable, Node,
libnode and the loader/libraries. Node and tar receive new pathname inodes. The
already-running Node resumes, reads the restored payload and exits successfully.
The re-archive matches the full 124,743,680-byte source stream and the inventories
match. SHA values for this case are recorded in JSON; an absolute synthetic symlink
contains a per-run temporary path, so its SHA intentionally varies between runs.

Before extraction, a destination directory is replaced with an absolute symlink to
an outside synthetic sentinel directory. The restored directory and child appear
inside the chroot, the outside sentinel remains intact and no child is written
outside. Absolute symlink resolution in the running Node also stays within its
chroot. This tests ordinary filesystem resolution, not exploitation of tar itself.

Linux unlink semantics retain a file while it is still held open, which supports
replacement without truncating the old object. [unlink(2)](https://man7.org/linux/man-pages/man2/unlink.2.html)
However, chroot is explicitly not a standalone security boundary: it neither changes
cwd nor closes descriptors, and privileged processes or moved directories can escape
an inadequately constructed jail. The fixture uses `chroot(1)` to enter `/`, passes
only pipe stdio, and gives tar no outside directory descriptors.
[chroot(2)](https://man7.org/linux/man-pages/man2/chroot.2.html)

Use the default replacement mode with controlled arguments. Do not introduce
`--overwrite`, `--keep-directory-symlink`, `-P`, dereference flags or source-controlled
tar options. Validate member/hardlink paths and dumpdir records in the transport
protocol. GNU expressly requires trusted archives for incremental restoration;
an archive listing is not an adequate security boundary.
[GNU tar integrity guidance](https://www.gnu.org/software/tar/manual/html_node/Integrity.html)

## What remains outside this evidence

- This tests the **whole synthetic chroot**, not the image's entire rootfs. The
  nonrecursive bind/private mount namespace mechanism was measured separately in
  research35; this run does not compose it with real guest mounts or private volumes.
- No concurrent writer, descriptor leak, malformed archive, mount race, unfamiliar
  xattr namespace, device node, filesystem inode flag, quota, filesystem encryption,
  cross-filesystem hardlink, or interrupted extraction is certified here.
- Runtime replacement passes with already-loaded Node and tar. Arbitrary late
  `dlopen`, module loading, external commands, or executing user-modified runtime
  binaries during an incomplete restore remain separate risks.
- The contract deliberately excludes atime/ctime/birth time and absolute inode
  numbers. A PAX stream is not a process-memory or filesystem-internal checkpoint.
- Warnings, missing socket members, exclusions (`N` records) and incomplete streams
  must prevent a claim of complete fidelity. Matching archive SHA alone verifies the
  encoded projection; it cannot establish preservation of attributes not encoded.
- A real migration still needs writer admission/exclusion, independently verified
  mount coverage, volume transfer, safe cancellation, durable recovery, reopen
  verification and transactional cutover. These production gates remain closed.

## Reproduction and cleanup

```sh
node .scratch/machines/research/37-full-incremental-fixture.mjs
```

The launcher uses the local image ID and creates only its own UUID container; Docker
`--rm` removes it, and `finally` attempts removal of that same exact name. The final
JSON records cleanup and assertions, including expected negative cases. A fixture
success means those assertions passed, not that arbitrary Agent state migrates.
No registry pull, login, inference, global configuration change, production mutation,
tracker update or publication was performed.
