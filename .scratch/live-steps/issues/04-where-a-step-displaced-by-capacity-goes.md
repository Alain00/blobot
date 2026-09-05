Type: grilling
Status: open
Blocked by: 03

# A step displaced by capacity has nowhere honest to go

## Problem

The author's order names two ways a step leaves the live block:

> `[outgoing transitioning step (displaced by finished or capacity)]`

**Finished** is sound and already built: the call returned, it collapses in flow, the fold above
takes it, and the fold's line says `ran N tools` about it. The record is true at every frame.

**Capacity** is not. A step displaced because the window is full is **still running**. It cannot
go into the fold, because the fold is a count of work that *finished*, and a running call in
there makes `RAN 20 TOOLS` a false sentence. If it simply leaves, the UI has claimed a call ended
when it did not — which is the same class of lie as a cancelled tool reporting `completed`, the
trap `mock/scenarios` exists to keep us honest about.

So the two exits in that line are one real exit and one hole.

## The proposal to argue with

**No capacity cap. The live list is as long as the batch.**

- Real batches are two to five calls. The tall live block the cap is defending against is a case
  that does not occur; a cap that only ever fires on a turn nobody has is a cap that costs a lie
  for nothing.
- The block is already bounded from above by the fold, which takes every step the moment it
  finishes. The live list's length is *the number of calls currently in flight*, which is a fact
  worth being able to read directly rather than a quantity to be managed.
- Capping it means the block stops being a true statement of what is running, which is the only
  thing it is for.

## The alternative, if a cap wins anyway

A cap plus an explicit overflow line as the last row of the block: `+3 more running`. Honest, and
cheap. Its cost is a fourth figure in a region that already carries the fold's count, and one
more number for a reader to reconcile mid-turn.

What is **not** acceptable either way: a running call that disappears with no successor
statement.

## Note on the other cap

`DESIGN.md` caps the swallow at **two animations in the air**, for a legibility reason — *three
lines closing under one header is a column of scrolling text where a reader is trying to follow
one live line*. That is a cap on *motion*, not on *how many steps are shown*, and it stands
whatever this ticket decides. The author's list conflates the two; keep them apart.

## Done when

The word "capacity" is either gone from the design or has a successor statement attached to it,
and the rule is stated where the block is built rather than in a component.
