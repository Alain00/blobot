# Machines final organization and robustness review

2026-09-06. Reviewed PR #5 from `9516cc9ea08b20f585c0758bb8497bc2389d3c14`
to `f99e0a4`, then validated the corrections below. The code-review skill ran
independent Standards and Spec passes; the parent also tested setup cancellation
and repository organization. This supplements [the earlier review](review.md).

## Standards

The independent boundary review found no new confirmed P1/P2 in workspace/Git
mount admission, skills containment, ownership, launch environment, pinned archive
validation or guest login/callback routing. The accepted shared Git and open network
boundaries were evaluated as the current contract, not against superseded allowlists.

- **Download hardening, fixed.** A pinned-size artifact was previously rejected
  only after consuming its whole body. An isolated four-byte pin consumed 102,400
  bytes before rejection. Downloads now refuse the first excess chunk before
  writing it, cancel the body and delete the invalid partial file. Two regressions
  cover fresh download and Range resume, proving bounded progress/write size,
  early cancellation and no published/partial artifact.
- **Organization, cleaned.** Image/login exports now live next to their adapters,
  installer exports next to engine exports. Public names remain unchanged. The
  OwnedSbxMachine comment now describes preview activation and the accepted
  read-only skills mount. `.scratch` is intentionally tracked, and the deferred
  transfer modules remain internal evidence under the explicit sizing decision;
  neither is removed as speculative cleanup.

## Spec

- **P2, fixed: Team re-entry before previous close.** The original probe published
  a second execution while release of the first remained pending. With a real
  Machine this can fail the ownership lease; during roster changes it can also
  admit stale membership. The pool now waits for the prior close, blocks admission
  through edit/delete persistence, rejects stale pending starts and closes each
  execution once. Shutdown drains changes admitted before closing SQLite.
  Three regressions cover eviction/re-entry, editing during startup and shutdown
  during a durable change. A simultaneous second mutation is refused.
- **P2, fixed: stale readiness after sleep.** Machine power changes intentionally
  do not change runtime status. The Agent card previously listened only to status,
  message and login notifications, so sleep could leave its readiness presented
  as current. It now refreshes on the existing snapshot power property; a rendered
  regression changes power with no status event and checks the `last check` label.

No new scope creep was confirmed. The macOS window-reopen behavior examined by
this pass already existed in main and was not changed speculatively.

## Additional integration check

- **P2, fixed: cancellation after setup confirmation.** A delayed second inventory
  read allowed a cancelled setup to continue with shared SSH settings and daemon
  restart. The operation signal now reaches the engine command runner, which
  checks before and after commands and terminates the native child on abort.
  Setup closes admission before shutdown and rechecks cancellation after external
  installer/readiness waits. Four regressions cover post-confirmation cancellation,
  real native child termination, desktop signal propagation, and setup shutdown.

An existing UI assertion still used the old queue sentence. It was updated to
check the current user-visible queued-message contract; the complete suite passes.

## Validation and remaining acceptance

Core: **1,102 passed / 47 skipped**. Desktop: **638 passed / 1 skipped**.
Both typechecks and builds pass. Ten new regression cases exercise the failures
above; they do not merely assert private implementation shapes. `git diff --check`
passes. The actual Electron interaction fixture was repeated after the changes.
No live provider login or sbx VM was needed for this pass.

The PR stays a draft under Guillermo's account, with the original not-ready note
first. Preview activation remains off by default; actual account/provider-turn,
clean-host installer and Linux/KVM acceptance remain in
[the current ledger](research/53-first-box-evidence-ledger.md).

Independent axes: Standards — no new confirmed P1/P2, one download hardening and
organization cleanup applied; Spec — two P2 findings corrected. The parent's
additional integration pass corrected one setup-cancellation P2.

## Subsequent PR comments

Copilot and Claude’s 33 inline comments and 11 summary points were assessed in
[the follow-up response ledger](review-pr-comments.md). Its validation supersedes the
counts above: core 1,135 passed / 47 skipped; desktop 684 passed / 1 skipped.
