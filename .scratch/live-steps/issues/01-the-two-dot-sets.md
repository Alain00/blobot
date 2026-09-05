Type: grilling
Status: resolved

# Two sets of three dots, forty pixels apart

## Problem

Observed by the author, 2026-09-05, on `--demo-scenario=many-steps`, and reproduced in a
screenshot at 13s into the turn:

```
> RAN 20 TOOLS · 1 FAILED
  [ selection.ts +5 −1 ] [ index.ts +1 −0 ] … [ labels.ts +5 −0 ]
  ▣ npx astro check 2>&1 | tail -30   • • •      ← the running call
  🟠 Alice
     • • •                                        ← the pending bubble
```

Two in-flight devices, the same glyph, the same keyframes, one above the other.

In principle they say different things. `.tool now`'s dots say *this call has not returned*. The
pending bubble's dots say *this agent has not started speaking*. In practice, while a tool is
running the second is **entailed** by the first: an agent inside a tool call is not speaking, and
nothing on screen was in doubt about it.

`isPending` already applies exactly this reasoning once — it returns false the moment there is a
live message to watch, *so the dots never sit under text that is already streaming* — and does not
apply it to a running call, which is the same situation with a different thing to watch.

`DESIGN.md` has settled this shape twice, both times against the duplicate:

- *WORKING beside three dots that are already saying so is the same claim twice, in the row of an
  agent* — which is why the status word yields to the dots.
- *an icon beside the word it denotes is the same claim twice in the narrowest place in the app,
  which is what took WORKING out from beside the dots* — which is why the glyph took the verb's
  column rather than joining it.

## The proposal to argue with

**The dots stand down; the face does not.**

The bubble is doing two jobs and only one of them is duplicated. Its dots are the duplicate. Its
**face and name** are attribution, and attribution is about to become load-bearing rather than
decorative, because ticket 03 puts the live steps under it and ticket 02 makes there be more than
one of them.

So the answer is not "hide the pending bubble while a tool runs", which is the cheap fix and
throws away the half that is needed. It is:

- the bubble's dots are drawn only when **no step of this agent's is running** — that is,
  `starting` and `thinking`, the two states where there is no tool line to look at and the dots
  are the only sign the message landed;
- the face and the name stay for the whole turn, and become the header of the live block.

## Counter-arguments to answer

- **"Then `working` has nothing moving except one line's dots."** Correct, and that is the point:
  one moving thing per running call, and the count of them *is* the concurrency signal ticket 02
  wants to be able to show. Today two running calls would produce two step-dot sets and one
  bubble-dot set, and the odd one out means nothing.
- **"The bubble's dots are the reassurance the message landed."** They are, for the seconds before
  the first tool call. That window is `starting` and `thinking`, which this keeps.
- **"The rail row also has dots."** It does, and that is a different region answering a different
  question (*is this team doing anything*, from across the room). Not in scope.

## Done when

The two-dot-set frame cannot be produced by any scenario in `mock/scenarios/`, and the reason is
stated on the rule rather than in a component.

## Answer

**The dots stand down; the face stays, and becomes the head of the live block.** Built
2026-09-05, together with 03, 04 and 05 — see the note below on why 01 could not land alone.

`isPending` keeps its three states and its live-message exclusion, and is now only asked about
the case where there is nothing else to see: an agent that is `starting` or `thinking` with no
call open. The moment a call opens, the block's body *is* the calls, and the dots at the end of
each of those lines are the only in-flight device on screen. One moving thing per running call,
which is also what makes the count of them legible as concurrency.

The face does not stand down with them, because it was never the duplicate. It is attribution,
and 03 is what gives it a job.

**Why this could not ship on its own.** The narrow version — hide the pending bubble while a
call runs — regresses the team pane: two agents running would lose the only thing in the
transcript saying which of them was doing anything. The other narrow version — keep the face,
drop the dots — leaves a face and a name with an empty body under it, below the calls it is
supposed to be about. Both are worse than what they replace. The frontier order this map was
written in was wrong about that, and the session that took 01 took 03 with it.
