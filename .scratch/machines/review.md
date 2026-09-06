# Machines implementation review

Reviewed 2026-09-06 against `origin/main` at `9516cc9ea08b20f585c0758bb8497bc2389d3c14`,
including the final setup/login/UI work in progress. The code-review skill ran
independent Standards and Spec reviews. These are technical findings, not the
author's still-pending product review or account/platform acceptance.

## Standards

- **P1, fixed: shutdown omitted starting Teams.** A deferred `TeamPool.start`
  could complete after `closeAll`, leave a live Machine and outlive SQLite.
  The pool now closes admission, drains pending starts and existing closures,
  refuses late publication, and retains idempotent shutdown. A deferred-start/
  deferred-close regression includes concurrent selectors.
- **P1, fixed: compaction could write after shutdown.** A pending handoff archive
  outlived `runtime.stop`, then attempted restart and recorded `context_compacted`.
  Disposal now prevents new admission; shutdown drains all continuations even
  when one rejects. A resumed archive cannot restart a disposed execution.
  The original probe now observes zero post-close recorder writes; the regression
  retains the archive write until shutdown is verified to be waiting.

No other confirmed standards/functional failure remained in the reviewed routes.
The staged state-copy modules are retained under the explicit deferred-capability
decision in ticket25; the reviewer did not classify that authorized retention as
speculative generality.

## Spec

- **P1, fixed: activation before outstanding acceptance.** Default builds now
  refuse sandbox activation before invoking the engine. Explicit development
  preview is required; both creation pickers and Settings disclose that state.
  Account/provider-turn and Linux/KVM checks remain recorded as pending.
- **P2, fixed: Settings lacked persisted resource limits.** Its Agent sandbox
  list reads saved Team/Agent rows and shows CPU/RAM without editable controls.
- **P2, fixed: mixed-Team Workspace rows omitted placement.** Each sandbox
  member now has the location segment in the team view as well as its own pane.

The Spec reviewer rechecked all three fixes. No new issue was found in those
changes. Per-Agent composition was researched separately and resolved in ticket24
and ADR-0003, retaining the existing local/box inheritance contracts.

Initial findings: Standards 2 (both P1), Spec 3 (one P1, two P2); all five corrected.
The remaining release acceptance is explicit in [the preview guide](../../docs/machines.md).


## Final validation

Core: 1,098 passed / 47 skipped. Desktop: 632 passed / 1 skipped. Both typechecks
and builds pass. The actual Electron fixture verifies mixed-placement submission,
login/composer spacing and the narrow creation flow; see
[the captures and procedure](research/71-machine-screen-verification.md).
Skipped tests include deliberately opt-in live/provider/platform cases; they are
not included in the passing total and do not discharge the release gate.


The final live runtime pass found one additional concrete defect: Codex's adapter
always supplies CODEX_CONFIG, but its image contract rejected that key before ACP.
The narrow contract correction has a runtime-to-transport regression and a real
fresh/reopen repeat in [research72](research/72-desktop-runtime-launch-acceptance.md).
The repeat reaches the provider's authentication gate; no Codex login/MCP success
is inferred. Total confirmed findings corrected: six.


## Additional organization and robustness pass

The user requested one more complete pass after publication. See
[the follow-up review](review-cleanup.md) for independent Standards/Spec findings,
three corrected functional races/stale-state cases, bounded downloads and cleanup.
Current totals are 1,102 core and 638 desktop tests passing, with 47/1 skipped;
both typechecks/builds pass. The release acceptance gate remains unchanged.
