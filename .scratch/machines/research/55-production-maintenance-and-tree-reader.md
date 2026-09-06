# Production maintenance and full-tree reading pass in a held sbx guest

2026-09-06. [Fixture](55-production-maintenance-fixture.mjs),
[guest probe](55-production-maintenance-worker.cjs) and
[results](55-production-maintenance-results.json).

The actual compiled `prepareSbxStateMaintenance` and `readSbxStateTree` functions,
plus the archive verifier/index, run inside a UUID-owned sbx guest. The fixture
serializes their function sources; files, archives and member inventories stay
inside the guest. Only synthetic checks, counts and aggregate hashes return.
The report records the preparation-function and guest-probe hashes. It does not
record separate hashes for the reader/index source bundle.

One box is used first as a source and, after an actual stop/reopen, as a target.
Both roles pass. This is **not** a source-to-target migration: each role adds its
own marker and its inventory intentionally differs from the preceding role.

## Observed behavior

The worker enters through `unshare --mount --propagation private`, verifies its
container/cgroup/root-mount relationship, checks private ext4 volumes, gracefully
terminates the private Docker daemon and containerd, moves itself to an owned
sibling cgroup, and freezes the original container. Its three nonrecursive bind
views exclude descendant mounts. The original host worktree's marker is absent
from the root view.

- Source rootfs/home/Docker views read their own synthetic markers, and writes
  fail with `EROFS` on all three views.
- Target writes through each view reach that tree's underlying guest storage.
  Only newly created synthetic extra markers are written and then removed.
- Both roles validate and hash two full archives of each tree. Every repeated
  archive matches exactly and produces a complete accepted member index.
- Disposal removes the views while the original container remains frozen.
  Host `sbx stop` succeeds after the source worker exits; the target invocation
  reopens the same box, prepares successfully again and is stopped afterward.

| Tree | Source archive bytes / members | Target archive bytes / members |
| --- | ---: | ---: |
| rootfs | 1,597,634,560 / 62,730 | 1,597,634,560 / 62,731 |
| home | 10,240 / 4 | 10,240 / 5 |
| Docker | 716,800 / 45 | 716,800 / 46 |

All tar streams complete without warnings; the reader rejects any stderr.
The target invocation's host-side stderr contains only sbx's ordinary restarted
sandbox notice. That is separate from guest tar stderr.

## Scope and limits

Darwin arm64 host, Linux 7.0.12 arm64 guest, sbx RC5 revision
`ca4a4bd42035628137d78c5a0bef5c0d3301a35a`, using the same approved local public-image
archive and alias as research50. The fixture verifies the loaded image prefix
against the recorded manifest. No download, provider, login, real workspace or
global configuration mutation occurs. Private volumes are 8 GiB and 20 GiB;
the box has 2 CPUs and 2 GiB RAM. Available host space stays above 20,851,101,696
bytes. Cleanup verifies removal of its exact box, loaded alias and host temp tree.

The Docker daemon has no running user containers in this fixture. Graceful
shutdown with workloads, live-restore configuration, cancellation at every
boundary, Linux-host/amd64 behavior, inode attributes outside PAX, candidate
restoration and final lifecycle cutover remain separate gates. The helper
currently refuses live-restore and unexpected topology. These measurements do
not turn archive equality into proof of metadata that tar omits.

## Code validation

The archive index selects changed members plus required ancestor directories
and dependent hardlinks. [The independent GNU tar fixture](54-compiled-selection-against-gnu-tar.md)
verifies six complete synthetic restorations. A `null` selection must skip tar;
[research52](52-selective-incremental-extraction.md) shows that empty `-T` means
extract everything. A reopened Node stdio pipe is not a valid selection file;
the measured fixture uses a guest memfd.

New process-reader regressions cover serialization, streamed output, warnings,
truncation, byte limits, receiver failure and loss of held maintenance. Full core:
**1,002 passed / 47 skipped**. Core typecheck/build and desktop typecheck pass.
The real fixture validates normal preparation/reading, while those regressions
use synthetic Node subprocess output for failure paths. Production reconfiguration
and box-activation guards are unchanged.
