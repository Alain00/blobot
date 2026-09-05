# Full PAX structure is checked before accepting a state transfer

2026-09-05. The production `createStateArchiveVerifier` accepts the exact GNU PAX
dialect used by the preservation fixtures, with bounded parsing and complete directory
coverage. The checker is not connected to a production guest worker yet. It does not
relax the resource-replacement guard or certify attributes outside the archive format.

Evidence: [fixture](41-state-archive-fixture.mjs), [result](41-state-archive-results.json),
[implementation](../../../packages/core/src/machines/sbx/state-archive.ts),
[negative and fragmentation tests](../../../packages/core/src/machines/sbx/state-archive.test.ts).

The fixture runs the existing local arm64 image in a UUID-owned Docker container, with
no network, pulls or host mounts. Python creates only synthetic data: an empty directory,
ordinary files, a cross-directory hardlink, an absolute symlink, FIFO, sparse file, binary
user xattrs, access/default ACLs, fractional mtime and long/newline/option-like filenames.
GNU tar emits a full `--incremental --format=pax` archive with the exact research37 flags.
The production checker consumes the synthetic stream. It accepts all 20,480 bytes; tar
exits zero with no stderr. The container is removed and its absence checked.

The checker validates checksums, lengths and padding, the two-block terminator, per-member
PAX fields, confined member/hardlink paths, and full dumpdir entries. Every declared child
must have exactly one member of the declared type; undeclared, duplicate and omitted members
are refused. `N` exclusions and rename-control dumpdir entries are refused, as are global
headers, unsupported extensions, concatenated archives and truncated payloads. Absolute or
dangling symlinks remain valid filesystem objects; controlled extraction must not follow
them outside the isolated view. The format rules come from the primary sources recorded in
[research37](37-complete-pax-dumpdir-and-live-runtime.md).

Input chunks are at most 64 KiB. A metadata record is at most 1 MiB, with one bounded buffer;
the coverage index is limited to one million entries and 64 MiB of path bytes. Exceeding a
bound refuses the archive. These are acceptance bounds, not guarantees that every filesystem
fits them. Source preflight must run the same validation before target mutation.

Seventeen unit cases cover the accepted format and negative boundaries, including execution
of the serialized factory without imports. The real GNU fixture is complementary evidence,
not just a hand-authored stream that mirrors the parser. Run it with:

```sh
node --import tsx .scratch/machines/research/41-state-archive-fixture.mjs
```

Real Agent names, contents and extended attributes must remain inside guest workers. Only
this synthetic fixture validates on the host. A matching SHA and complete encoded inventory
still cannot prove preservation of filesystem flags absent from PAX. The guest maintenance
worker, isolated receiver, complete restoration, post-boot semantics and durable cutover
remain separate integration requirements. No real Agent, provider login or inference ran.
