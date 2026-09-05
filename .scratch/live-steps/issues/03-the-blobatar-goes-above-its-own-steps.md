Type: grilling
Status: resolved
Blocked by: 01, 02

# The blobatar goes above its own live steps

## Problem

The author's order, verbatim:

```
[steps folded]
[blobatar]
[outgoing transitioning step (displaced by finished or capacity)]
[current step 2]
[current step 3]
[incoming transitioning step]
```

Today it is the other way around: the fold, then the loose running calls, then the blobatar and
its dots at the very bottom of the rows. The face is *under* the work it is doing.

## The proposal to argue with

**Adopt the order, and for a reason the author did not give.**

The stated reason is concurrency within a turn, which ticket 02 has to build before anyone can
look at it. The unstated and stronger reason is **attribution across agents, which is broken
today**:

In the team pane two agents run at once already. Their running steps are drawn as loose `.tool`
rows in one shared column with nothing on them saying whose they are. Two agents at three calls
each is six anonymous mono lines interleaved in call-start order. There is no reading of that
column that recovers who is doing what.

Putting each running agent's face above its own live steps makes the live region **one attributed
block per agent**, which is the only version that survives more than one agent. It also matches
what the settled transcript already does — a message is a face, a name, and then the thing said —
so the live block becomes the same shape as everything under it rather than a second grammar.

## What this decides that the author's list does not say

- **The fold stays above.** Finished work above, live work below, which is the direction the
  column already reads and the direction `shut` already travels.
- **The block is per agent, not per pane.** One agent, one face, its own steps under it. Two
  agents running is two blocks, in a stable order (roster order, not call order — a live region
  that reorders itself while you read it is worse than an anonymous one).
- **A settled block does not become one.** Everything already folded draws exactly as it does
  now. `DESIGN.md`: *What moves is not the record. It is the part that has not finished becoming
  one.*

## Counter-arguments to answer

- **"A finished step now has to travel past the face to reach the fold."** It does not travel at
  all, and must not start: `shut` is a height collapse in flow, and `DESIGN.md` carries the scar
  from the hour it was out of flow (*two dimming tool lines across `Alice TYPING`, both
  illegible*). The step collapses where it is and the fold's count goes up by one. Nothing
  crosses the face. Say this on the rule, because it is exactly the thing someone will
  reimplement as a translate.
- **"Frequency."** Twenty-two calls is forty-four transitions. `DESIGN.md` refused the `@mention`
  list its open animation on frequency alone. But it *admitted* the swallow on the grounds that
  it is capped at two in the air and sits inside a turn that is already the loudest thing on
  screen, and this is the same animation in the same block. Settled precedent, not a new fight —
  provided the cap on animations in flight survives, which is a different cap from ticket 04's.
- **"One agent's block will jump when its first call starts."** It will, and that is the arrive
  transition doing its job.

## Done when

Two agents running concurrently in the team pane produce two blocks, each with its own face, and
a screenshot of that frame is on this ticket.

## Answer

**Adopted, and for the reason the ticket gave rather than the one that raised it.** Built
2026-09-05 as `liveTailOf` in `model.ts` and `Live` in `Conversation.tsx`.

The transcript splits into `settled` and a **live tail**: the trailing run of loose tool rows
belonging to agents whose turn is in flight, grouped into one block per agent in first-appearance
order. Everything above it is handed to `Rows` exactly as before.

Three things the ticket did not settle, decided while building:

- **The tail is bounded by a status, not by whether a call has returned.** A batch whose first
  member finishes must not have that member jump out of the block and back into the column above
  it; and a lone completed call never reaches `WORTH_FOLDING`, so a tail defined by looseness
  alone would hold a face over it for the rest of the session. `isInFlight` — `starting`,
  `thinking`, `working`, and deliberately not `responding` — is what closes it.
- **The swallow had to be hoisted.** `useSwallowed` diffs a row that was loose against an item
  that is folded, and the tail takes the loose ones out of what `Rows` sees. Left where it was it
  would have been diffing a list the tail had already emptied, and the fold would silently have
  stopped being seen to take anything. It is measured over the whole row list in `Conversation`
  now and passed down.
- **Nothing travels.** `shut` is still a height collapse in flow. A finished step collapses where
  it stands and the fold's count goes up; nothing crosses the face, which is the scar `DESIGN.md`
  already carries from the hour that animation was out of flow.

**Verified in the team pane**, `--demo` at 8s: Bob's running `read src/auth.ts` is drawn under
Bob's own cyan face while Alice's turn sits above it. Before this it was an anonymous mono line
in the shared column, and with two agents running it was an unreadable interleave. The
two-blocks-at-once case is covered by `liveTailOf`'s test rather than by a screenshot, because no
demo script yet puts two agents in flight in the same frame — a leftover, on `build.md`.
