Type: task
Status: closed, obsolete
Blocked by: nothing, but see the note on conflict below

# Say that the operator's own skills are not loaded

## Closed, 2026-08-29, obsolete before it was built

ADR-0003's amendment reversed the decision this ticket existed to disclose. The operator's own
skills load and are offered, so there is nothing to say and no expectation to correct.

Kept rather than deleted because the reasoning is still the right shape for the next time blobot
decides something about the runtime on the user's behalf: say what it *does*, in the disclosure
that already closes team creation, stated rather than consented to. Ticket 14's precedent.

The original body follows.

---


## Problem

ADR-0003 drops `user` scope, so a user who types `/grilling` in blobot's composer reaches a
session that never loaded it. Nothing tells them why. A personal skill silently not existing
reads as blobot being broken, which is the one outcome worse than the decision itself.

## Decided already

Grilling issue 03 settled **where** this is said: the disclosure that already closes the team
creation flow, in the same breath as the permission posture.

It is the same category of fact — something blobot decided about the runtime on the user's
behalf — and it is already the one place the app makes that kind of statement. Ticket 14's rule
governs the shape: **stated, not consented to.** There is no checkbox.

Two alternatives were considered and rejected. Explaining it inside the palette puts a paragraph
of apology in a control that should be a list, and the user who never opens the palette still
deserves to know. Saying nothing was rejected outright.

## What to write

Say what an agent *does* load, not only what it does not: the repository's own instructions and
commands. The reason is the interesting half and it is short — a teammate works from what the
team shares, and the operator's personal setup is not shared with the agent's teammates.

Follow ticket 14's precedent in one more way: it says blobot sets the runtime to prompt rather
than naming commands. Do not enumerate scopes or say `settingSources` here.

## Constraints

- `DESIGN.md` first, and it is the existing disclosure's voice rather than a new block.
- **No em dashes.**
- Do not call it a limitation or apologise for it. It is a choice with a reason.

## Note on conflict

This lands in `apps/desktop/src/renderer/src/components/NewTeam.tsx`, which a concurrent session
is editing for the *your agents* screen. Left unbuilt for that reason rather than any other.
Whoever picks it up should check that the disclosure has not moved first.
