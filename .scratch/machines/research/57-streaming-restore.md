# The compiled streaming receiver restores a synthetic private tree

2026-09-06, Darwin arm64, sbx RC5, the same pinned local fixture image.
The [fixture](57-streaming-restore-fixture.mjs) injects the actual compiled
maintenance, archive reader/index/selector, bundle decoder and receiver into one
owned guest. Its [worker](57-streaming-restore-worker.cjs) constructs a small
synthetic tree, then restores it over the held private home volume.

[The corrected run](57-streaming-restore-results.json) passes all seven checks:
complete PAX equality including hardlinks and deletion; an immediately unlinked
regular selection file; metadata preflight before archive bytes; an identical
transfer that leaves file ctime alone; rejection of a truncated stream without
the finish hook; helper termination on abort; and disposal of private views.
The archive is 20,480 bytes with eight members. The fixture includes a dangling
symlink, a directory-to-symlink replacement and literal newline/glob/option names.
Only aggregate synthetic results leave the guest; the archive remains in its memory.

[The first run](57-streaming-restore-first-results.json) failed before restoration:
the fixture called asynchronous `fs.symlink` without a callback. Changing that
fixture call to `fs.symlinkSync` was the only correction before rerunning.
Both runs removed their owned box, image alias and temporary directory. No pull,
provider request, login or global setting mutation occurred.

This tests **PAX restoration and transport ordering**, not complete Machine
preservation. The mandatory attribute hooks only record their invocation here;
they do not reconcile Linux flags or xattrs. The test uses one synthetic tree,
not three trees across two Machines, and does not test durable cutover. Existing
activation and replacement guards remain. The receipt records the worker and
maintenance-function hashes, not separate hashes for every injected dependency.

Validation at this checkpoint: 23 bundle/description tests, including fragmented
input, backpressure, poisoning after concurrent/failed writes, canonical raw
names and hardlink/path validation. Full core: **1,025 passed / 47 skipped**;
core typecheck and build pass. The unrelated root lockfile edit is excluded.
