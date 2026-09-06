# Selective PAX extraction works per member; dumpdir deletion needs its directory selected

2026-09-06 local date; measurement started `2026-09-05T23:43:46.893Z` UTC.

**GNU tar 1.35 can extract an explicit, nonempty set of members from a complete
PAX incremental archive while leaving unselected, unaffected objects exact in
the measured metadata.** Selecting a directory processes its complete dumpdir
without recursively extracting its children when `--no-recursion` is active.
That removes target-only children while leaving source-listed but unselected
files alone. Omitting the directory member also omits those dumpdir deletions.

**An empty `-T` list is dangerous here: it selects the whole archive, not zero
members.** The empty-list control restores unrequested files and deletes extras.
It exits 2 only because the two deliberately immutable target files cannot be
replaced. No-op selection must be handled before invoking this command.

`--no-overwrite-dir` preserves an otherwise untouched existing directory exactly
in this fixture, but also suppresses source metadata restoration for directories
that actually changed. Native directory mtime/ctime changes caused by child
deletions or replacements still happen. None of these variants alone proves a
complete-fidelity migration algorithm or authorizes weaker preservation guards.

## Reproducible fixture

- [Host](52-selective-incremental-fixture.mjs), [guest worker](52-selective-incremental-worker.cjs),
  [Python probe](52-selective-incremental.py), [results](52-selective-incremental-results.json),
  [offline assertions](52-selective-incremental-verify.mjs).
- One sandbox: `blobot-selective52-6f9f1fe9-b193-4c65-842f-70475e7a697e`,
  ID `867078bd-b459-4e05-945f-4869fa9a3831`.
- GNU tar `1.35`; Darwin arm64 host, Linux `7.0.12` arm64 guest;
  sbx client/server `v0.42.0-rc5`, revision
  `ca4a4bd42035628137d78c5a0bef5c0d3301a35a`.
- Same approved local archive/alias as research40 and research50:
  `/private/tmp/blobot-machine-images.040Rvi/explicit-docker.tar`,
  `blobot-machine-probe:explicit-docker-20260905`. Returned ID prefix
  `1cd3184fceaf` is checked against the previously recorded manifest. No pull or
  independent new full-manifest computation is performed.
- Docker is quiesced and the original app-container cgroup frozen while the
  worker remains in its owned sibling cgroup. The worker creates a private mount
  namespace and a nonrecursive root bind view. **All tar creation/extraction and
  deletes occur within `/opt/blobot-selective52-UUID` in that view.** No base-image
  file is restored or removed. The only host mount is a new synthetic worktree;
  it is absent from the root view.
- No guest network requests, provider, login, credentials or global mutations.
  Empty credential/network-allow lists; the existing SSH-forwarding setting must
  be false. No production/tracker changes or commits.

The one full archive has 26 members, including eight directory members with
complete `GNU.dumpdir` records containing only `Y` and `D`. It is 51,200 bytes,
SHA-256 `9ae43335e0cdbba636aa445506abc102ecbb6c2ba5fe5267a15bf4d551c67112`.
Repeated creation yields identical bytes. The archive and NUL-terminated name
list remain in guest memory; names are supplied through a memfd and the archive
through stdin. Neither is persisted on the host.

## Exact commands and documented meaning

Creation uses research37's full recipe, with a fixed `PATH`, `LC_ALL=C`, `TZ=UTC`
and no inherited `TAR_OPTIONS` or `POSIXLY_CORRECT`:

```sh
tar --incremental --sort=name --format=pax \
  --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
  --numeric-owner --acls --xattrs '--xattrs-include=*' \
  --sparse --sparse-version=0.0 --atime-preserve=system \
  -C SOURCE -cf - .
```

The measured selective extractor is:

```sh
tar --incremental --numeric-owner --acls --xattrs '--xattrs-include=*' \
  --delay-directory-restore --no-recursion --null --verbatim-files-from \
  --no-wildcards --anchored --no-unquote \
  -C TARGET -xpf - -T /proc/self/fd/SELECTION_FD
```

The alternative adds `--no-overwrite-dir` before `-C`. Selection entries are
literal member names such as `.`, `./branch` and `./branch/line<newline>break`.
Directories and their children are separately selected; the archive is not
rewritten, filtered or stripped of unselected members or dumpdir entries.

GNU's manual documents `-T` as an extraction member list, NUL/verbatim handling,
and that recursion controls whether a directory match also matches descendants.
It documents `-G` incremental extraction as using archive-contained information
to remove entries absent at backup time, and `--no-overwrite-dir` as preserving
existing-directory metadata. These descriptions support the tested mechanism;
the precise empty-list and interaction outcomes below are observations from the
pinned executable, not additional guarantees inferred from the manual.
[GNU tar manual](https://www.gnu.org/software/tar/manual/tar.html)

The format specification places `GNU.dumpdir` in the corresponding directory's
PAX extended header. Its `Y` and `D` records describe source membership, which
is separate from the extractor's selection list.
[GNU tar internals: Dumpdir](https://www.gnu.org/software/tar/manual/html_chapter/Tar-Internals.html)

## Five measured variants

The synthetic source has changed files, directories, six type swaps and unchanged
objects. The target additionally has root-level extras, a nonempty extra
directory, a branch extra and an extra inside `keep-dir`. `pristine` has no child
changes. Both `keep-dir` and `pristine` carry nodump and a binary user xattr;
their unselected `keep` files carry explicit immutable and a binary user xattr.
`change-dir` deliberately needs a different mode, nanosecond mtime and xattr.

An additional file deliberately differs between source/target but is omitted
from every nonempty selection. This is a negative selection control, **not** an
assumption that an omitted object is equivalent merely because of a hash.

| Variant | Result |
| --- | --- |
| Selected changed files only | Exit 0; selected bytes/mtime restored; no dumpdir extras deleted; all untouched subtrees remain exact |
| Changed files plus needed directory members, excluding `keep-dir` and `pristine` | Exit 0; root/branch extras deleted; all six swaps restored; selected directory metadata restored; excluded directories remain exact; extra inside excluded `keep-dir` remains |
| Changed files plus every directory member | Exit 0; all tested extras deleted and swaps restored; unselected files remain exact; even pristine directory ctime changes |
| Same list plus `--no-overwrite-dir` | Exit 0; same deletes/swaps; pristine directory remains exact; directories with child changes acquire new mtime/ctime; changed-directory source mode/xattr are not applied |
| Empty list | Exit 2; full extraction attempted, including unrequested file replacements and all tested deletions; immutable files cause replacement errors |

Every nonempty-list variant leaves the two unselected immutable files and the
unselected nodump branch file exactly equal in the full recorded snapshot.
The deliberately omitted differing file retains target state, even when its
directory is selected. Thus a directory dumpdir does not force extraction of
each source-listed `Y` member with `--no-recursion`.

Default extraction of all directory members leaves the pristine directory's
mode, UID/GID, mtime, xattrs, flags and inode unchanged, **but changes ctime**.
With `--no-overwrite-dir`, that entire pristine snapshot is equal. In `keep-dir`,
deleting its target-only child changes mtime and ctime under `--no-overwrite-dir`;
the option does not undo filesystem effects of modifying children. Under default
extraction, archive mtime is reapplied, while ctime still changes.

The six successful swaps cover every directed pair of regular file, directory
and symlink. Old directories contain children. One target symlink points to a
separate synthetic sentinel file, another to its containing synthetic directory;
both are replaced without following them into that outside target. The sentinel's
complete measured snapshot remains identical in all five cases. This is a small
trusted-archive test within one owned tree, not a general tar security proof.

Literal selections work for a basename beginning `-`, leading/trailing spaces,
tab, newline, backslash, wildcard-looking `[*]?` characters and UTF-8 `café`.
Names retain their canonical `./...` prefix in the selection. Invalid UTF-8,
arbitrary byte names, pathological depth/size and malformed archives are not
tested.

## Precision, limits and implementation gates

All nanosecond times and inode/device numbers are serialized as decimal strings,
avoiding research50's JavaScript-number precision limit. Equality includes type,
mode, owner/group, size/link count, inode/device, mtime/ctime, queried GETFLAGS,
xattr names/value hashes and file hash or symlink target. Atime is not compared;
directory enumeration/file reads use `O_NOATIME`. This is still not an inventory
of every filesystem property.

The experiment establishes the native member-selection mechanism and its failure
cases. Remaining gates include:

1. Never call this extractor for an empty selection. A nonzero exit does not
   imply it left the destination untouched: the empty-list control visibly
   mutates much of the tree before failing.
2. Derive selections from independently verified state, including every directory
   whose dumpdir must remove children and ancestors whose metadata needs repair.
   Deliberately omitting a changed file here leaves it wrong with exit 0.
3. Choose when directory metadata must be restored. Blanket selection with
   default options touches pristine directory metadata; blanket
   `--no-overwrite-dir` leaves required metadata changes unapplied. This fixture
   does not implement or test a multipass solution.
4. All objects here are newly created synthetic upper-overlay objects. No
   ENOTTY/base-backed object is extracted. Research50 makes needless metadata
   writes a concrete copy-up concern, but this run does not certify a same-image
   base-classification algorithm or no-copy-up restore.
5. Selected flags omitted by tar remain a separate research40 preservation gate.
   Existing-directory extra-xattr removal remains the research37 gate. This run
   does not cover hard-link graphs, sparse layouts, ACL changes, capabilities,
   special files, interrupted restore, root/home/Docker migration or reopen.

The full archive remains necessary for archive-structure validation; a correct
selection list is an additional obligation, not a substitute for it. No complete
target/source equality is claimed for this deliberately partial fixture.

## Validation and cleanup

JavaScript syntax and Python AST checks pass. The one live fixture completes;
all four intended partial extractions exit 0 with empty stderr. The empty-list
control records its expected failing extraction. The offline verifier passes
**75 assertions**, including exact measured-source hashes and the negative
controls; run it with `node .scratch/machines/research/52-selective-incremental-verify.mjs`.

Explicit immutable flags are cleared before removing the entire synthetic tree.
The worker thaws the original cgroup, restores membership, removes its sibling
cgroup and verifies the original mount namespace was not changed. The owned box,
loaded local alias and host temporary tree are removed without errors. Recorded
space stays above 20,850,769,920 bytes (about 19.4 GiB), exceeding the 2-GiB floor.
sbx is released to the parent; no further live run is pending.
