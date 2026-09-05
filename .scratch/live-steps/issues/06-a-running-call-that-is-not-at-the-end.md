Type: task
Status: open

# A running call in the middle of the transcript has no block

## Problem

Found by enriching the demo, 2026-09-05, which is what the enrichment was for.

`works-through-a-list` now mails Bob from the middle of the list and carries on rather than
waiting, and `many-steps` gives Bob a scenario of his own. So the demo finally has two agents
holding calls at the same time — and the first frame of it shows the hole in `liveTailOf`:

```
  > RAN 16 TOOLS · 1 FAILED  🔵 Bob
  🟠 Alice
     Wrapping each object so the whole desk answers the pointer.
     ▣ npm test -- api/serialize   • • •      ← Bob's, drawn as nobody's
  > RAN 5 TOOLS · 1 NOTE
  🟠 Alice
     Checking it.
     ▣ npx astro check 2>&1 | tail -30  • • •
  🔵 Bob
     • • •
```

Bob's `npm test` is running, and it is drawn as a bare mono line under **Alice's** caption. It is
the exact anonymous line ticket 03 was built to abolish, and the block that should hold it is
sitting at the foot of the column with three dots in it.

The cause is in `liveTailOf`'s first line: the tail is the **trailing** run of loose tool rows.
That is true when one agent is working and false the moment two are — Bob's call opened, Alice
then produced six more rows, and his live line is buried above them with no way out.

## What to decide

Whether a live call is lifted to the live region **wherever it is**, or stays where it happened.

Lifting is what ticket 03's principle says: live work belongs in the live region, and a running
call is not a record yet, so moving it is not moving what the user is reading. The cost is that
a line would travel down the column when another agent writes something and travel back up into
a fold when it finishes, which is two moves for one call and the sort of thing `DESIGN.md`'s
in-flow `shut` was written to avoid.

Staying put is what the column already does, and needs the opposite fix: a **face on the loose
line itself** when its agent is not the one whose block is below, which reintroduces per-line
attribution — the thing the block replaced.

Neither is obviously right. What is certain is that the present answer, an unattributed line, is
the one both of them exist to prevent.

## Note

The batch-stays-together rule bites here too. A settled-but-unfolded call of an in-flight agent
can also end up mid-transcript, and any rule that lifts the running ones and leaves that one
behind splits a batch across two places on screen.

## Done when

Every call in flight is under the face of the agent running it, in every frame of
`--demo-scenario=many-steps`, with a screenshot on this ticket.
