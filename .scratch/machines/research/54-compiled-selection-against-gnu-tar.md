# Compiled archive index/selection passes six real GNU tar cases after a fixture transport correction

2026-09-06 local date. The completed run starts `2026-09-05T23:52:17.327Z` UTC.

**All six corrected-transport cases produce a target PAX archive byte-for-byte
equal to the source, with zero differing indexed members.** The imported
production functions correctly return `null` for identical trees, select
unchanged ancestors of a changed file, and select unchanged hardlink members
when their reference file must be replaced. Twelve type swaps, removals, additions
and unusual byte names also pass. No production code or preservation guards are
changed by this research.

The first attempt failed before restoring anything because this fixture tried
to reopen a Node `stdio: 'pipe'` through `/proc/self/fd/3`. That result is **not**
a selector counterexample. A second box was explicitly authorized to correct only
the list transport to research52's Python memfd mechanism; the compiled functions
are identical across both runs.

## Artifacts and exact code under test

- [Host fixture](54-archive-selection-fixture.mjs), [held worker](54-archive-selection-worker.cjs),
  [synthetic seeder](54-archive-selection-seed.py), [guest probe](54-archive-selection-probe.cjs).
- [Completed results](54-archive-selection-results.json), [offline verifier](54-archive-selection-verify.mjs).
- [First results](54-archive-selection-first-results.json),
  [first probe with the unsuitable Node pipe transport](54-archive-selection-first-probe.cjs).

The host imports only the compiled exports from
`packages/core/dist/machines/sbx/state-archive.js` and `state-archive-index.js`,
captures their `.toString()` values, and sends those function definitions to the
guest. Indexing and selection execute **inside the guest**, using its Node
`Buffer` and `crypto.createHash`. There is no host-side source/target inventory.
The source implementations are
[the structural verifier](../../../packages/core/src/machines/sbx/state-archive.ts)
and [index/selector](../../../packages/core/src/machines/sbx/state-archive-index.ts).

Exact measured hashes:

| Item | SHA-256 |
| --- | --- |
| `state-archive.js` compiled module | `a6b2326b696952f7e2194f5629b1640024d71f87ec71a8424a8a3c8210123997` |
| `state-archive-index.js` compiled module | `f2d282a6e9332a7753df6c5b5e1ab2c63fdba71986bc2e58652fe26d80d68188` |
| `createStateArchiveVerifier.toString()` | `cb1d5f4808c3b87f29deb4b243662c1eb18c6f067947d4d47d903fc86d664913` |
| `createSbxArchiveIndex.toString()` | `85ec340419df0b465592586f9ae3eea93f95d73a7360e02cf7d84bbbf2d9a144` |
| `selectSbxArchiveMembers.toString()` | `0742a1f1f4ca09a4597ecd55bdf1f7e39c810fa1f258e1db1da7a99c2641a7ec` |

These hashes bind the findings to the compiled code measured here, not every
later implementation bearing the same export names. Both runs record matching
compiled-module and function hashes. The completed probe bundle hash is
`17eab580d0762d98cff2850374ca0ff25158235e57e6c053f24321e32b54cf33`.

## Procedure and containment

GNU tar `1.35`, Linux `7.0.12` arm64 guest, Darwin arm64 host;
sbx client/server `v0.42.0-rc5`, revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`. The same approved local tar/alias from
research40/50/52 is loaded and its returned ID prefix checked; there is no pull.
The completed box is `blobot-selection54-5b2fec47-fdbe-450a-82ca-992f32596859`,
ID `da979e31-2074-4726-9b9b-824086972230`.

The research52 containment is retained: owned 2-CPU/2-GiB box, private home/Docker
volumes, empty credential/network-allow lists, synthetic host worktree, Docker
quiescence, frozen original app-container cgroup and sibling maintenance worker.
A private nonrecursive root bind view excludes descendant mounts. Every seeded,
restored or deleted path is below the new guest-only
`/opt/blobot-selection54-UUID` tree. No real source-base entry is rewritten.

For each case the guest creates complete PAX archives of source and target with
research37/52's deterministic full `-G` recipe. It feeds each archive through the
actual compiled index factory, using fragment sizes cycling through 1, 7, 511,
4096 and 65536 bytes. The supplied verifier's observer hashes accepted member
headers/PAX and payload. Only after both full indexes finish does the actual
selector derive the list.

If the selector returns `null`, extraction is skipped. Otherwise its **unchanged
Buffer bytes** become a NUL-terminated list in a guest memfd, with no decoding or
rewriting of filenames. GNU tar receives the full source archive on stdin and
the selection via `-T /proc/self/fd/N`, using:

```sh
--incremental --numeric-owner --acls --xattrs --xattrs-include=* \
--delay-directory-restore --no-recursion --null --verbatim-files-from \
--no-wildcards --anchored --no-unquote
```

The target is then fully rearchived and indexed. The primary success condition
is equality of the **complete archive bytes**, independently of whether the
index comparison also reports equal members. Source repeatability and source
unchanged-after-restore are checked too. Whole-archive hashes, byte/member counts
and booleans are returned; member names, link targets, individual member hashes,
selection buffers, contents and archive bytes remain inside the guest.

The native selection/dumpdir behavior and the empty-list hazard were established
in [research52](52-selective-incremental-extraction.md). GNU's manual documents
explicit member selection, nonrecursive matching and incremental restoration;
it does not guarantee this application's selection algorithm.
[GNU tar manual](https://www.gnu.org/software/tar/manual/tar.html)

## Measured cases

| Case | Directly different source members → selected members | Result |
| --- | ---: | --- |
| Identical trees | 0 → 0 (`null`) | Tar never invoked; complete PAX and measured target metadata unchanged |
| Content-only change; all directory members initially identical | 1 → 4 | Changed file plus three unchanged ancestors selected; complete PAX equals source |
| Additions, deletions, twelve swaps and rare names | 27 → 27 | Target 31 members becomes source's 29 members; complete PAX equals source |
| Changed hardlink reference with two byte-identical alias members | 1 → 5 | Both aliases selected with reference and ancestors; reference inode replaced; all three paths share one inode |
| Separate files become hardlinks | 2 → 4 | Three target paths become one inode; unchanged reference inode retained |
| Hardlinks become separate files | 2 → 4 | Three target paths become three distinct inodes; unchanged reference inode retained |

Every invoked extractor exits zero with zero stderr bytes. All six full-archive
comparisons pass, and every after-index reports zero mismatched members. Archives
range from 10,240 to 61,440 bytes; this is not a throughput or memory-scale test.

The content-only fixture sets parent mtimes to the same exact nanosecond value
before either archive is created. The whole encoded directory members match,
not merely their mtime fields. Selecting ancestors still restores those mtimes
after tar replaces the child inode, as demonstrated by full-PAX equality.

In the reference-change case, two hardlink members have exactly the same indexed
encoded-header/payload digest in source and target before extraction, while the
reference member differs. The selector adds both dependents anyway. Physical
inode queries after extraction confirm that both point to the replaced reference
inode. The merge/split cases additionally verify the desired inode graph and that
an unchanged reference is not replaced unnecessarily.

The mutation fixture covers all twelve directed type changes among regular file,
directory, symlink and FIFO; old directories are nonempty. It also adds a new
directory/file and deletes target-only root and nested objects. Names include
spaces, tab, newline, backslash, literal glob characters, a dash-prefixed basename,
UTF-8 and a filename containing raw byte `0xff`. Successful full rearchive checks
the literal byte names as well as their content and encoded metadata.

Target symlinks point only to a sibling synthetic sentinel tree. The sentinel's
inode/owner/mode/size/link-count/mtime/ctime snapshot remains equal throughout.
This is a narrow trusted-archive fixture, not a general symlink-escape proof.

## First-attempt limitation and correction

The first owned box, UUID `94891f45-391d-41a3-ad40-e565d660f072`, completes
indexing and selection. Its identical-tree case passes. Each of its five attempted
extractors exits 2 immediately, with 104 stderr bytes and a target archive still
identical to its pre-extraction archive. Member/error strings were intentionally
not returned to the host, so these results do not preserve an exact syscall errno.

The fixture used Node `stdio: 'pipe'` at fd 3, then asked tar to reopen
`/proc/self/fd/3`. Node explicitly documents that these are not ordinary Unix
pipes usable through descriptor-file paths. Replacing only that transport with
the measured memfd approach makes all five restores succeed with unchanged
compiled selector code. This supports the fixture-transport diagnosis; the
first host assertion's generic “counterexample” wording must not be interpreted
as evidence against the selector.
[Node child_process, options.stdio](https://nodejs.org/api/child_process.html#optionsstdio)

## Limits, validation and cleanup

No counterexample to this compiled selector is found in the six tested cases.
This does not prove that every full filesystem can be migrated. No unencoded
inode flags are set or admitted; research40's flag omissions remain a separate
gate. Source-base provenance/ENOTTY handling, directory extra-xattr removal,
complete ACL/capability changes, sparse extents, device nodes, malformed archives,
hardlinks outside the captured tree, interrupted restore, large trees,
root/home/Docker composition and postboot verification remain outside this test.

The no-op metadata snapshot uses BigInt-derived values inside the guest and
compares mode, UID/GID, size, nlink, inode/device, mtime and ctime. It does not
compare atime or claim to enumerate every filesystem attribute. Full-PAX equality
is explicitly limited to the encoded dialect and cannot repair omitted metadata.

Syntax/AST checks pass. The offline verifier passes **128 assertions**, including
the initial transport failure, corrected outcomes, compiled-code hash agreement,
hardlink graph checks and cleanup. It runs without invoking sbx:

```sh
node .scratch/machines/research/54-archive-selection-verify.mjs
```

Both boxes are used sequentially and removed. Each run deletes its synthetic guest
tree, thaws the original cgroup, restores worker membership, removes its sibling
cgroup, checks the original mount namespace unchanged and removes only its owned
loaded alias and host temporary tree. Cleanup reports no errors or remaining
owned resources. The completed run's minimum sampled available host space is
20,835,442,688 bytes (about 19.4 GiB), above the 2-GiB floor. sbx has been released
to the parent; this research has no live work pending.
