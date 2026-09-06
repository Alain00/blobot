# Machines review handoff

2026-09-06. Repository `/Users/guillermo/Work/blobot`, branch `feat/machines`.
`origin/main` at `9516cc9ea08b20f585c0758bb8497bc2389d3c14` is already included;
final fetch found no incoming main commits. Git/GitHub identity is Guillermo,
`guillermolopezg00@gmail.com`, `guillermolg00`; no coauthor trailers.

## What is committed

- `b657256`: operational engine setup, guest sign-in, placement and preview UI;
  queue/cancellation/shutdown fixes, independent review and Electron captures.
- `7a2b0f1`: Codex launch environment correction plus actual published runtime
  acceptance, preserving the initial failure and the successful ACP repeat.
- `3368173`: reconciled current acceptance ledger and first-box ticket.

Earlier per-ticket commits remain on this branch. The only pre-existing unrelated
worktree edit is `pnpm-lock.yaml` (+19 lines); it is intentionally not part of this
work. Do not stage or revert it while continuing Machines.

## Current state and next work

Read [the preview guide](../../docs/machines.md), [review](review.md),
[current evidence ledger](research/53-first-box-evidence-ledger.md), then
[the map](map.md). The operational screen ticket is resolved. The image and
first-box tickets remain claimed for account/platform acceptance; their old
full-copy resize prerequisite was explicitly deferred in the sizing decision.

Production box activation is off. For development review start Electron with
`BLOBOT_MACHINES_PREVIEW=1`. Actual own-image Claude/OpenCode signed-out session/MCP
handshakes pass; Codex/Cursor initialize and require authentication; fx needs login
before initialize. Eight actual login challenges/cancellation paths pass, without
completing any account login. Do not describe this as authenticated runtime coverage.

Remaining release checklist: completed vendor sign-in and private login persistence/
isolation, authenticated turns with mailbox/permissions/attachments/cancel/resume,
real MCP streaming/reconnect, clean-host installer behavior, supported Ubuntu
arm64/amd64 KVM operation, and Guillermo's product/visual review. No host credentials
should be imported to bypass these checks. Ordinary sleep keeps the same Machine;
post-creation CPU/RAM edits and a selectable inheritance editor remain deferred.

The latest real-engine fixtures are stopped and removed. Sbx was left clean with
its original vendor templates retained. No agent is still doing background work.

## Validation

Core 1,102 passed / 47 skipped; desktop 638 passed / 1 skipped. Both typechecks and
builds pass. The Electron fixture asserts mixed placement submission and checks
login/composer spacing and narrow creation; screenshots are linked from research71.
Native CI build/smoke covers all five published runtimes on arm64 and amd64; it
is not Linux/KVM acceptance. Six initial review/live findings were fixed. The [additional review](review-cleanup.md)
corrected setup cancellation, Team close/edit admission and stale sleep readiness,
added a download byte ceiling and grouped exports. Ten regressions were added. Tracked
diff whitespace and current guide/review links pass.

## PR contract

Published [draft PR #5](https://github.com/Alain00/blobot/pull/5), targeting main,
under `guillermolg00`. Verified draft status, exact first paragraph, matching
remote head and no merge conflicts. First paragraph:
**Este PR todavía no está listo: aún no he terminado de revisar todo.**

The body records the account/platform gate, scope deviations, validation, important
flows and review links. No merge is authorized. There are no automated PR checks
configured for this branch; the validation above was run locally, while the native
image CI results belong to their separately published build. Locate the existing
PR with `gh pr view feat/machines`; do not create a duplicate.
