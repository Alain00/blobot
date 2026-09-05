Type: task
Status: resolved
Blocked by: 07

# A teammate has no block of its own in the team pane

## Problem

The concrete half of 07, and the author's actual sentence: *"subsequent bots that are not the main
one should be part of the turns flow, not a main thinking state."*

Today, in the team pane, a woken teammate gets everything a principal gets: its own live block,
its own face, its own dots, at the top level of the column. Its calls sit beside the principal's
as peers. Then the moment they settle they are swallowed into the principal's fold and the
teammate stops existing as a voice at all.

Ticket 06's screenshot is the same fault from the other side: Bob's `npm test` is running, has
Alice's rows after it, and is drawn as a bare unattributed line — the block that should hold it
is at the foot of the column, and the block that should hold it *once it finishes* is above.

## The proposal to argue with

**In a team pane, only a principal has a live block. A teammate's live work goes where its
settled work goes: inside the principal's run.**

- The live tail is computed **per run**, not per agent: it belongs to whoever the run's principal
  is, and a partner's unsettled work is part of that run rather than a run of its own.
- A teammate never draws a top-level face, live dots, or a pending state in the team pane. What
  says it is working is the block it is inside.
- **In its own pane nothing changes.** There it is the principal, and it gets the block, the face
  and the dots exactly as now — which is 07's *internal is relative to the pane*.

## The edge this has to answer

**A teammate still running when the principal's turn ends.** Alice finishes; Bob is three calls
into work she asked for. There is no live turn left for him to be part of, and the run above him
is settled.

Three candidates, none obviously right:

- The run stays open while any partner in it is still working, and the fold keeps filling. Honest
  about causation, and means a block can be live long after its principal went idle.
- The run closes and Bob is promoted to a principal of his own — a block appears for him at the
  point his work stops being anybody's machinery. Truthful about the present, and makes an agent
  change category mid-turn, which is a thing the reader watches happen for no reason they caused.
- The run closes and Bob's remaining work draws inside the closed fold, which keeps counting.
  Cheapest, and asks a shut block to be a live thing.

## Done when

No frame of `--demo-scenario=many-steps` in the team pane contains a call drawn outside a face's
block, and no teammate has a top-level face while a principal is holding the turn.

## Note, 2026-09-05 — 07 makes this bigger than it reads, and hands it 06's settled half

Two things came back off 07's grilling and both land here.

**`runFrom` cannot be consulted from the live path.** It terminates on the first unsettled item
belonging to anybody in the run (`settledWork` for the principal, `partnerWork` for a teammate;
both false for `running` and `asking`). Its boundary is *defined* to end where the live region
begins. So the work is not "read `addressed` in `liveTailOf`", it is **compute the run boundary
once over settled and unsettled items together** and render one run at two altitudes.

**And that means this ticket owns the settled side of 06.** 06's screenshot has two folds in it —
`RAN 16 TOOLS · 1 FAILED` above the stranded line and `RAN 5 TOOLS · 1 NOTE` below — because
`rowsOf` broke Alice's run at Bob's open call and opened a fresh one after it. Lifting the loose
line alone leaves one turn drawn as two records with a hole in the middle. Add to the *done when*:
**one turn, one fold**, with the live block inside it rather than a second record beside it.

**Free, and worth a test rather than a change.** 07's clause 3 (*internal is relative to the
pane*) already holds: `itemsFor` filters before `rowsOf`, so in Bob's own pane the user's
`@alice` bubble is gone, `addressed` is never set, and the *nothing addressed* branch makes Bob
his own principal. Pin it.

## Answer

Built 2026-09-05. The proposal stands as written, and the edge below is decided.

### The shape it took

**One pass, not two.** `rowsOf(items, live?)` computes the run boundary over settled and
unsettled work together and hands the live half back as a **row of its own**, standing where its
run stands. `liveTailOf` is gone. It took the *trailing* loose calls off the end of the row list,
which is true of one agent working and false the moment two are.

- **A running call is admitted to a run** and taken straight back out by `liveRunIn`. That one
  line is the whole of 06 and of this ticket: a run used to end at the first unsettled line from
  anybody, so a teammate's open call cut the principal's turn in half and stood between the two
  halves as an unattributed mono line.
- **Only the principal gets a live row.** A teammate's open calls stay in the run its mail
  caused, which is where the same calls go the instant they return.
- **`settledWork` and `partnerWork` collapsed into one `runWork`.** They had been character for
  character identical since the day length stopped deciding admission, and the doc comment on the
  second still described a difference that was not there. What admits a line is what the line
  *is*; who spoke it decides only where it comes back out. That is 07 in the code.
- **One exception survives, and it is real**: the *principal's* live prose is admitted (the
  lifted set takes all of it back out, so letting the run reach past it hides nothing), a
  *teammate's* is not (folding prose mid-stream would take it off the screen). Found on the
  screen rather than at the desk — the first build left Alice's `TYPING` breaking her own run and
  Bob's open call orphaned below it in an unattributed `RAN 1 TOOL`.
- **Batches are bounded by narration.** The live row is the trailing run of the principal's
  calls, extended backwards over settled siblings until it meets something the principal said.
  So a call that returns while its neighbours run does not jump out of the block, and the batch
  before the last caption still folds.
- The blocked-out empty block (`starting`, `thinking`, no calls yet) stays at the foot of the
  column and is now filtered to principals, which is the one place `rowsOf` cannot say it.

### The edge: a teammate still running when the principal's turn ends

**The first candidate. The run stays open and the fold keeps filling; the teammate is never
promoted.** Two reasons, and neither is the "honest about causation" one the ticket offered:

1. **The second candidate flickers.** Promote Bob when Alice goes idle and he has to be demoted
   again the moment his reply wakes her, which the mailbox's auto-wake makes the *ordinary* end
   of this state rather than an unusual one. An agent changing category twice for scheduling
   reasons is worse than one that never changes.
2. **The third is the first, described differently.** A run is a contiguous span of items;
   nothing in the stream marks a principal going idle. "Closed but still counting" and "open"
   compile to the same code, and only one of them is true.

It costs what 09 is for, and the cost is now measurable rather than predicted: the fold read
`RAN 17 TOOLS` while Bob's `npm test` was open and `RAN 22 TOOLS` when it was not. **A fold's
count is a live number now.** `DESIGN.md` says so where it says the rest of this, rather than
leaving 09 to discover it.

### Done when

- `--demo-scenario=many-steps`, team pane, frames at 6s / 8s / 9.5s / 11s / 12s: no call is drawn
  outside a face's block, no teammate holds a top-level face, and one prompt is **one fold**.
  06's two folds and its stranded line are both gone.
- `--pane=bob`, same run: Bob is his own principal with his own face, his own edit and his own
  open `npm test`, and Alice's mail folds into `RAN 3 TOOLS 🟠 Alice`. 07's clause 3, live and
  costing nothing, exactly as the grilling predicted.
- 549 desktop tests, 753 core, typecheck clean. Eight tests replace the five `liveTailOf` had,
  including the teammate case, 06's ordering and the own-pane case.
