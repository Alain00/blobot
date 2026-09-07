# Unknown inode flags and the missing documented maintenance start

2026-09-05. Read-only follow-up to
[research38](38-full-rootfs-composition-and-reopen.md). **`GETFLAGS` returning
`ENOTTY` means that this query did not report attributes through that object and
filesystem path. It does not mean zero flags, and alone does not prove that
`SETFLAGS` is impossible.** The same base image is insufficient evidence that a
full extraction preserves unqueried attributes. No documented RC5 command or kit
field reviewed here provides a start that bypasses both runtime Docker readiness
and setup while exposing the copied root for pre-start verification.

This note applies the research skill using upstream source, official documentation,
and existing local evidence. No Docker or sbx command was executed, including help;
no live fixture, production code, tracker, settings or credentials were changed.
Only this note was written. There are no owned runtime resources to clean up.

## Evidence and version boundary

[Research38's result](38-full-root-results.json) reports Linux `7.0.12`, arm64,
sbx client/server `v0.42.0-rc5`, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`. It queried 61,004 regular-file and
directory paths: 60,936 returned errno 25 (`ENOTTY`), and 68 returned `524288`
(`0x80000`, `FS_EXTENT_FL`). These are interface observations, not a complete
classification of layer provenance or filesystem properties.

The scanner uses the arm64 `FS_IOC_GETFLAGS` request `0x80086601` and an initially
zero native unsigned-long buffer. The Linux implementation writes an unsigned
32-bit result on success; that fits the allocated buffer on this little-endian
machine. The UAPI's historical `long` request encoding does not make the payload
a portable native-long value on every architecture.
[Scanner](38-full-root-view.py),
[ioctl argument documentation](https://man7.org/linux/man-pages/man2/ioctl_iflags.2.html).

Kernel analysis below is pinned to upstream stable tag **v7.0.12**. Matching
`uname` does not prove that the shipped Docker kernel has no downstream patches or
identical configuration. Its exact source/build provenance was not established.
Docker's public docs were read on this date and are not immutable RC5 specs.
Exact RC5 binary observations are explicitly separated below.

The recorded root is OverlayFS, with named lower layers and an upper layer.
External worktree/skills and injected `/etc/hosts`/`resolv.conf` mounts are
virtiofs, but their types do not identify every root lower-layer filesystem.
Neither `ENOTTY` nor a successful extents value independently proves whether a
particular pathname is lower-only, copied up, or metadata-only copied up.
[Recorded mount table](38-full-root-results.json),
[OverlayFS layer and metadata model](https://docs.kernel.org/filesystems/overlayfs.html).

## What the kernel actually does

In `ovl_fileattr_get`, OverlayFS selects the real metadata path, asks that
filesystem for attributes, and merges effective append/immutable protection bits.
`ovl_real_fileattr_get` converts a missing-operation result (`ENOIOCTLCMD`) to
`ENOTTY`. An underlying failure remains a failure; merged internal bits do not
turn it into a successful userspace result. The setter, when reached, first
copies the object up, then changes upper attributes. OverlayFS represents
append/immutable protection through its private `overlay.protattr` mechanism so
upper aliases and children can still be copied up internally.
[Linux v7.0.12, overlayfs/inode.c, `ovl_fileattr_get/set`](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/overlayfs/inode.c).

There is an earlier VFS condition: `vfs_fileattr_set` retrieves existing
attributes **before** invoking the filesystem setter. Failure there prevents the
OverlayFS setter and its copy-up from running. However, this internal query uses
an initially empty attribute structure, whereas `ioctl_getflags` sets
`flags_valid=true`. Thus the failed query observed by research38 and the setter's
prerequisite query need not take the same backend operation. Missing setter
support, ownership/capabilities, read-only mounts and filesystem checks are
additional constraints.
[Linux v7.0.12, file_attr.c, lines 252–320](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/file_attr.c).

This distinction matters for FUSE: `fuse_fileattr_get` forwards `GETFLAGS` when
`flags_valid` is true and **`FSGETXATTR` otherwise**. Setter dispatch is separate.
The FUSE ioctl layer also translates an unimplemented server operation (`ENOSYS`)
to `ENOTTY`. Virtiofs uses the FUSE protocol between guest and host; guest API
availability therefore cannot be inferred independently of its server and backing
filesystem.
[Linux v7.0.12, fuse/ioctl.c](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/fuse/ioctl.c),
[virtiofs documentation](https://docs.kernel.org/filesystems/virtiofs.html).

Consequently:

- Failed `GETFLAGS` alone leaves `SETFLAGS` undetermined. For example, a successful
  prerequisite `FSGETXATTR` can allow the OverlayFS setter to reach a capable upper
  filesystem, subject to the remaining checks. This is a code-path possibility,
  **not a measured property of RC5's lower layers**.
- If the prerequisite query also lacks support or fails, that setter path cannot
  proceed in the current state. This still does not establish permanent inability:
  a different operation can copy the object up first and change the backend queried.
- None of these outcomes establishes that unknown source flags were absent.
  Research38 performed neither the alternative query nor any flag mutation.

`FSGETXATTR` also carries project ID and extent hints beyond the common flag bits.
The newer `file_getattr` syscall in this kernel still calls the same VFS backend
with `flags_valid=true`; it is not an independent remedy for missing support.
[Linux v7.0.12, file_attr.c, lines 323–399](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/file_attr.c).
`statx` offers partial additional evidence for supported attributes such as
immutable/append/nodump, but each bit is meaningful only with its corresponding
`stx_attributes_mask` bit. An unsupported bit remains unknown. OverlayFS's getattr
path reports effective VFS protection attributes; this is not a promise to expose
every filesystem flag. No alternative API was run here.
[statx contract](https://man7.org/linux/man-pages/man2/statx.2.html),
[Linux v7.0.12, generic_fill_statx_attr](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/stat.c).

## Which distinctions matter for preservation

| Kind | Examples | What can be concluded |
| --- | --- | --- |
| User-visible behavioral policy | immutable, append-only, nodump, noatime, synchronous updates, directory sync | These affect access, backup selection or I/O behavior. They cannot be treated as content-neutral unknowns. |
| Filesystem policy requiring more state | project inheritance and project ID; casefold | A single numeric flag word is insufficient to describe every associated rule. Casefold changes name lookup and has filesystem/type prerequisites. |
| Allocation representation | extents (`0x80000`) | This describes extent-based block mapping. Recreating that representation is distinct from preserving contents, sparse allocation behavior and user policy. |
| Other filesystem features | encryption, verity, inline data, indexed directories | Read-only display status is not a blanket permission to discard the associated semantics. |

These classifications follow the documented flag meanings, not a newly approved
admission policy. `chattr` cannot remove its `e` extents flag; this does **not**
mean all kernel APIs universally prohibit changing the representation. In the
v7.0.12 ext4 implementation, extent changes can request metadata migration.
Immutable/append restrictions also affect the ability and ordering of a restore.
[chattr flag meanings](https://man7.org/linux/man-pages/man1/chattr.1.html),
[ext4 attribute setter and migration](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/ext4/ioctl.c).

There is no sufficient universal mask to obtain by copying
`FS_FL_USER_MODIFIABLE`: filesystem-specific supported/modifiable masks differ,
and modern policy bits exceed that historical mask. Ext4, for example, includes
extent migration and newer features in its own handling and masks requested
flags. A successful setter alone is therefore weaker evidence than successful
read-back of the intended supported state.
[Linux flag definitions](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/include/uapi/linux/fs.h),
[ext4 masks](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/ext4/ext4.h).

Automatic copy-up is not full flag preservation either. In this kernel,
`ovl_copy_fileattr` treats `ENOTTY`/`EINVAL` as a skip, handles protection flags
specially, and copies only the defined sync/noatime subset of ordinary flags.
Nodump and project inheritance are not covered by that copy mask.
[OverlayFS copy-up](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/overlayfs/copy_up.c),
[OverlayFS copy/protection masks](https://raw.githubusercontent.com/gregkh/linux/v7.0.12/fs/overlayfs/overlayfs.h).

**Same-base reasoning has a limited valid scope:** an unchanged, still-visible
lower object can continue to derive its metadata from that same lower image.
Once extraction replaces or shadows it with an upper object, OverlayFS uses upper
metadata, not an automatic union of lower attributes. Keeping the base digest
therefore does not certify a complete logical restore's missing metadata.
[OverlayFS upper/lower lookup rules](https://docs.kernel.org/filesystems/overlayfs.html).
Research37's archive recipe does not encode a general inode-flags/project-state
inventory; equal PAX hashes certify only represented state. The 68 successful
extents-only results are useful positive evidence for those queries. The other
60,936 entries remain unknown; neither loss nor absence was demonstrated.
[Research37 coverage and limits](37-complete-pax-dumpdir-and-live-runtime.md),
[research38 inventory](38-full-rootfs-composition-and-reopen.md).

## Documented startup surfaces and the exact RC5 observation

| Surface reviewed | Documented behavior | Pre-start verification implication |
| --- | --- | --- |
| `sbx exec` | Starts a stopped sandbox before executing the command. | It does not promise that the command runs before runtime setup. [Reference](https://docs.docker.com/reference/cli/sbx/exec/) |
| `sbx create` / `sbx run` | Creation can be separate from attaching the Agent; run starts/attaches it. | No reviewed option promises a maintenance start without services/setup. Nonattachment is insufficient. [Create](https://docs.docker.com/reference/cli/sbx/create/), [run](https://docs.docker.com/reference/cli/sbx/run/) |
| Kit `entrypoint` / `command` | Defines the Agent process prefix and arguments. | No documented runtime-service bypass. [Kit reference](https://docs.docker.com/ai/sandboxes/customize/kit-reference/) |
| Kit setup | Install runs when applied; startup runs each start; setup files can be written each start. `background:false` sequences startup commands but does not gate the Agent entrypoint. | A blocking startup hook is not the documented pre-start barrier required here. [Kit setup](https://docs.docker.com/ai/sandboxes/customize/kit-reference/#setup) |
| `sbx cp` / `template save` | Copies paths or creates a template snapshot. | Neither reference supplies an offline mount/no-boot verification contract or complete metadata guarantee. [Copy](https://docs.docker.com/reference/cli/sbx/cp/), [template save](https://docs.docker.com/reference/cli/sbx/template/save/) |

The public [v2 grammar](https://github.com/docker/sbx-kits-contrib/blob/main/spec/SPEC-v2.md)
and [RC5 release](https://github.com/docker/sbx-releases/releases/tag/v0.42.0-rc5)
reviewed here document no maintenance-start switch. This is an absence in the
reviewed public contract, not proof that no private engine mechanism exists.
The installed shell completion files delegate completion dynamically and add no
independent static inventory of such a flag; they were read, not executed.

[Research25's exact-binary analysis](25-start-docker-label-static.md) separates
`DinDCustomizers` from `EnsureDockerd`. Only exact label value `true` enables the
former automatic-volume path. The runtime readiness path independently probes
for `dockerd` and starts it if its API is unavailable. This note rechecked the
installed binary SHA-256:
`e0bc95e6d4b80cb9a6b84ae8b2f2f540d5289fec9347be40b01f7af5317f007a`;
it did not redo the disassembly. Existing
[label-false live evidence](28-explicit-docker-volumes-and-quiescence.md)
and research38 demonstrate startup with explicit Docker storage despite that
label. Omitting the kit's startup hook therefore does not omit engine readiness.

The existing held-exec procedure can quiesce services and perform verification
within an already-started guest before its session closes. That establishes a
specific verification point, not a documented service-free next boot.
[Research30](30-held-exec-preservation.md).
Research38 then stopped and reopened the **same original**, with no restore, and
observed exactly one changed inventory record: `/var/log/dockerd.log` content,
length and fractional mtime. Thus a different hash after ordinary startup cannot
by itself diagnose copy corruption; the normal lifecycle has already had a
chance to write. Conversely, that observation does not excuse other differences
or certify future startup behavior. The log is included persistent data. No log
or metadata exclusion is introduced here.
[Complete-root before/reopen evidence](38-full-rootfs-composition-and-reopen.md).

The remaining factual separation is between **restored state verified while
quiescent before stopping** and **state measured after normal startup**. There is
currently no documented RC5 path established here for measuring the latter root
before any runtime writer executes. Unknown inode attributes and that lifecycle
boundary remain explicit limits; this research selects no product policy and
does not relax the preservation guard.
