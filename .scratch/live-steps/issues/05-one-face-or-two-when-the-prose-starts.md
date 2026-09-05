Type: grilling
Status: open
Blocked by: 03

# One face or two, when the prose starts

## Problem

Falls out of ticket 03 and is not in the author's list.

Today the turn ends like this: the fold, then a fresh `Alice` block — face, name, paragraph.
Ticket 03 gives the *live* region a face and a name too. Play both and the end of a turn is:

```
> RAN 22 TOOLS · 1 FAILED
🟠 Alice          ← the live block's header
   (steps, now empty)
🟠 Alice          ← the message
   Zero errors, and the build is green. …
```

The same agent's face twice in a row, with nothing between them, at the moment the reader is
looking for the answer. That is worse than what exists now, and it is caused by the fix.

## The proposal to argue with

**One block that grows, not two blocks that stack.**

The live block's face *is* the message header. A turn is one continuous thing: the agent starts,
runs steps under its own name, and then speaks under that same name. The steps rise into the fold
as they finish, and the prose streams in where they were. Nothing is mounted twice and no face
appears twice.

This also answers a thing the current layout gets wrong for free: `isPending` today drops the
pending bubble the moment a live message exists, so at the transition the face is unmounted and
a different face is mounted a few pixels away. It reads as a flicker because it is one.

## What has to be checked

- **The gaze gate.** The pending face looks at the composer while the user is in it, and
  `DESIGN.md` is explicit that *a settled transcript message still does not gaze, or pose, or
  move at all*. If the live block's face becomes the message's face, it has to stop gazing at
  the moment the turn ends — the same instant `animated` comes off. The rule survives; the
  implementation now has a seam it did not have.
- **Whether a turn with no prose leaves a bare face.** An agent that runs steps and says nothing
  (it happens: a turn that only sends mail) would end as a face with an empty body under a fold.
  Probably the block collapses into the fold's own attribution, which the fold already has —
  `ran 2 tools · 1 message with Bob` names its principal with its face.

## Done when

A turn drawn from `starting` to `end_turn` mounts one face for the agent and never two, and a
screenshot of the last frame is on this ticket beside the current one.
