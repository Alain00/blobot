# Composed full-state transfer reaches a concrete special-inode refusal

2026-09-06. [The actual guest stack](60-composed-state-fixture.mjs) ran through
the actual host channel and `copySbxState` in two fresh UUID-owned RC5 Machines
from the same pinned local image. There are no user files, credentials or runtime
turns. Rootfs, home and Docker all pass source archive/attribute preflight. The
candidate root inventory is read before accepting its incoming metadata bundle.

The transfer **does not pass**. [The first receipt](60-composed-state-first-results.json)
records the sanitized failure during the root archive operation. [The diagnostic
receipt](60-composed-state-results.json) adds an aggregate-only wrapper around the
actual attribute plan. It records 62,729 source root members, 44 selected entries
and one attribute difference (a directory). Three selected symlinks have statx
attributes zero with mask `0x303874` and deliberately skipped descriptor ioctls.
The actual attribute preflight rejects them before its first candidate mutation.
No source/target filenames, archive contents or xattr values are emitted.

The diagnostic wrapper changes neither selection nor admission. The receipt
records both original bootstrap and instrumented-source hashes. Both runs remove
their owned Machines, image alias and temporary directories. No network pull,
login, provider request or shared setting mutation occurs.

This is a **coverage gate in an ordinary fresh image**, not a successful full
migration or proof that the symlinks lost state. [The API and inheritance research](58-xattr-acl-reconciliation-and-fileattr-limits.md)
explains why unavailable attributes cannot be invented as zero. Preserve the
existing replacement guard while investigating a native storage-preserving route
or a verifiable treatment of those objects. Postboot writers and durable cutover
remain separate gates. The functional unit suite and admitted synthetic
restoration do not waive this actual whole-root refusal.
