# Machine screen prototype and integration checkpoint

2026-09-06, against `5b4b46c` and the current UI from main. Three variants live on the existing
Settings/Machines surface on **`prototype/machines-screen` at `642b051`**. The prototype has a
synthetic preload, memory-only actions, `?variant=0|1|2`, a development-only switcher and a
single-command launcher (`node scripts/prototype-machines.cjs` from `apps/desktop`; add
`--capture` for the screenshot sequence). No real IPC, provider, credentials or sbx mutation.

## Visual direction

The implementation direction, under the author's delegation of routine choices, is **A: inline
controls**. It keeps all Agent rows visible, names the Team for disambiguation, and expands the
chosen row for CPU/memory and details. B adds another navigation column inside Settings;
C gives comparison figures more space but duplicates the selected Agent below the table and
pushes the useful controls farther down. The existing sleep preference stays below the registry.

A setup dialog is reached from Settings or the box offer during team creation. It shows the
four readiness words and explicit actions, never a terminal. `ready` stays visible until done.
The Agent sign-in notice belongs above that Agent's composer. Kind detail is per Agent; it
uses the disclosure ticket's accepted open-network/shared-Git wording. No Machine-specific
mark or rail status is added beyond the already accepted power dot.

Both kinds have their working folder on the host. The prototype uses **open working folder**
for the existing system opener; it does not pretend that `shell.openPath` guarantees VS Code.
There is no reason to modify SSH settings for this door. Placement controls still belong to
Team/Agent instances, not profile hire, and existing members must not silently switch kinds.

Screenshots (visually reviewed after fixing shared dependency font access):
`/private/tmp/blobot-machine-screen-w6sIxX/variant-0.png`, `variant-1.png`, `variant-2.png`,
`setup.png`, `sign-in.png`, `ready.png`, `conversation.png`, `narrow.png`.
The prototype's state combinations are synthetic, not engine observations or activation evidence.
It omits production validation, focus management and transactional resource edits; do not merge
its source as the implementation. Its full code is retained on the prototype branch.

## Integration facts still blocking completion

Read-only review by `image_startup_hosts`:

- `start-team.ts:155` creates local Machines only; `machineFor('box')` remains refused.
  Placement is not yet stored on a member, and MachinePreferences only stores idle duration.
- `SbxEngine` has readiness/start/sign-in/isolation primitives but no desktop IPC or installer.
  A detected engine is not admission; `beforeWork` has the stronger check.
- `OwnedSbxMachine` has guest detect/sign-in, requiring no active transports. Host runtime
  login currently runs from the operator's home; it cannot be reused as an Agent login.
- CPU/RAM defaults are 2 cores/4 GiB. Reconfigure is deliberately refused with a mounted
  Workspace or Docker data until full-state preservation is complete. It must stay refused.
- `openInWorkspace(teamId, agentId, '.')` is a contained, membership-checked host path opener,
  already exposed by IPC. It opens the system association, not a guaranteed editor.
- **No safe login-wait delivery gate exists yet.** `promptFromUser` can mark a message delivered
  before calling a failed runtime; it does not check guest sign-in. The store can keep messages
  undelivered and relaunch tests cover those rows, but this is not enough to ship the mock notice's
  “Your message is waiting.” Add an admission-aware queue and verify zero provider turn before
  login, delivery once after successful readiness, retention on failed/cancelled login, and
  per-member independence before connecting this screen. No real provider was invoked here.

The screen ticket stays **claimed, not resolved**. Its design prerequisite is cleared, while
its operational path requires the image ticket's remaining preservation/runtime integration.
Return to that claimed image work before enabling the box offer, then finish the screen and its
end-to-end validation. This is an implementation dependency, not a new product question.
