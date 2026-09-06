# The compiled attribute backend restores the admitted synthetic state

2026-09-06. [The corrected real-guest fixture](59-attribute-restore-fixture.mjs)
passes with the actual compiled maintenance, PAX reader/index/selector/receiver,
attribute codec/backend and static Python helper. [Its receipt](59-attribute-restore-results.json)
records seven checks, 24 members, 2,584 attribute bytes and 51,200 archive bytes.
[The worker](59-attribute-restore-worker.cjs) uses only the home and Docker volumes
of a newly created UUID-owned Machine, clearing their initial synthetic contents.
It restores the first over the second while both views are held.

The source has ten directory policies (baseline, immutable, append-only, nodump,
noatime, sync, dirsync, topdir, project-inherit and their measured combination),
five corresponding file policies, hardlinks, xattrs and POSIX ACLs. The candidate
starts with different contents, protected directories, an immutable extra file,
an extra xattr on each directory and different ACLs. The actual receiver clears
only touched protections, restores the full PAX selection, removes surplus xattr
names and applies final flags bottom-up. A new full PAX archive and the entire
attribute manifest exactly match the source. The protected extra is gone and the
hardlink refers to the same restored inode.

A subsequent new source symlink is deliberately outside the current attribute
admission contract. Its replacement is rejected **before candidate mutation**;
the candidate's PAX digest and all observed attributes are unchanged afterward.
Unknown/skipped APIs are represented distinctly and are never converted to zero.
This is essential: [the fileattr research](58-xattr-acl-reconciliation-and-fileattr-limits.md)
documents possible inherited policy/project state on special inodes that these
APIs do not expose. The implementation therefore keeps unknown entries only when
their PAX and observed attributes match and they remain unselected. This is an
explicit remaining coverage limit, not a completed general-purpose migration.

[The first receipt](59-attribute-restore-first-results.json) failed in fixture
setup before the receiver ran: this pinned image does not contain `setfacl`.
The corrected seed writes the Linux POSIX ACL xattr encoding already measured
in the prior fixture. No image, production code or admission was changed to make
that rerun pass. Both runs clean their own box, alias and temporary directory.
No provider, login, pull or global setting mutation occurred. Host Darwin arm64,
guest Linux 7.0.12, sbx RC5 and the same pinned local fixture image.

The filesystem backend now composes metadata-first bundles with the real worker
contract. Its unit tests compare actual target re-reads with the expected bundle,
including an intentionally incorrect attribute restore, source drift and abort.
The guest bootstrap serializes that stack without host module imports. **The
whole two-Machine transfer and postboot cutover are separate acceptance gates.**
Production activation and mounted-worktree/private-Docker replacement stay gated.
