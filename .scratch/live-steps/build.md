# Live steps: what was decided while building, and what is left

Built 2026-09-05, all five tickets in one session. `map.md` has the decisions; this has the parts
that are only visible from inside the code.

## What bit

**The frontier order in the map was wrong.** 01 and 02 were charted as independent and 03 as
blocked by both. 02 really is independent. 01 is not: both narrow readings of it leave the app
worse than it was — hiding the pending bubble under a running call costs the team pane the only
attribution its transcript had, and keeping the face while dropping the dots leaves a name with an
empty body under the calls it is about. The answer to 01 *is* 03. Recorded on 01 rather than
quietly re-cut, because the mistake is the interesting part.

**The swallow silently depended on being handed the whole row list.** `useSwallowed` diffs a row
that was loose on the previous render against an item that is folded on this one. The live tail
takes the loose rows out of what `Rows` receives, so left where it was the hook would have been
diffing a list the tail had already emptied and no fold would ever have been seen taking
anything — with nothing failing, because the animation is cosmetic and the timer owns removal. It
is measured in `Conversation` over the full `rows` now and passed down as a prop.

**The two-faces case is a *settled* caption, not a live message.** Ticket 05 predicted the wrong
one. `isInFlight` leaves `responding` out, so a block and a streaming message can never be on
screen together. What actually happened, in the first screenshot of the built thing, is that an
agent's one-line caption before a batch is settled prose one item short of `WORTH_FOLDING`, so it
stays a loose row — and the block drew Alice's face directly under Alice's face. `continuesAgent`
groups the first block under it, which is what every continued turn already does.

**A batch fires N arrive animations in one frame.** Three `.tool.now` entrances at once. Left
alone: it is one visual event (the batch appeared) rather than the three competing ones
`DESIGN.md` caps the swallow at two for. Worth looking at again on a slow machine.

## Left over

- ~~No demo script puts two agents in flight in the same frame.~~ **Spent the same day.**
  `works-through-a-list` mails Bob from the middle of the list and carries on rather than
  waiting, and `many-steps` gives him `bob-checks-the-id-shape` — his own batch of three reads,
  an edit, a test run, and a reply that corrects her rather than agreeing with her. The two turns
  genuinely overlap, the fold swallows the mail and his whole turn under Alice's block, and the
  rail shows both agents working.

  **And the first frame of it found ticket 06.** `liveTailOf` takes the *trailing* run of loose
  calls, which is true of one agent working and false of two: Bob's `npm test` opened, Alice
  wrote six more rows, and his running call is stranded above them as exactly the unattributed
  mono line the block was built to abolish. Open, and the frontier.
- **The face still remounts at the seam** where the block gives way to the message. Unchanged
  from before this effort rather than introduced by it. Ticket 05 names it.
- **Nothing has met a real batch.** Claude, Codex, Cursor and fx all batch tool calls, and none of
  them has been watched doing it through this block. The mock reproduces the shape; only a live
  run says whether the ids and the ordering really arrive the way `Promise.all` models them.

## Round two, 2026-09-05: 07 and 08

**`runFrom` could not be consulted from the live path, and that was the whole size of 08.** It
terminated on the first unsettled item belonging to anybody in the run, so its boundary was
*defined* to end where the live region began. The fix is one pass: `rowsOf(items, live?)`
computes the boundary over both halves and returns the live half as a row. `liveTailOf` is gone.

**The two admission predicates were the same function.** `settledWork` and `partnerWork` had been
character for character identical since length stopped deciding admission, and the doc comment on
the second still described a difference that no longer existed. Collapsed into `runWork`, which
is 07's rule arriving in the code: what admits a line is what the line *is*, and who spoke it
decides only where it comes back out.

**Then the screen put the exception back.** With prose left alone, Alice's live message still
broke her own run, and Bob's open call landed below it in a principal-less fold reading
`RAN 1 TOOL` — the stranded line from 06 with a chevron on it. The principal's live prose has to
be admitted, because the lifted set takes all of it straight back out, so the run reaching past a
sentence being written hides nothing. A teammate's must not be: that really would take it off the
screen mid-stream. One `principal: boolean` argument, and it is the only place in `runWork` where
the speaker matters.

**A batch is bounded by narration.** The live row is the trailing run of the principal's calls,
extended backwards over settled siblings until it meets something the principal said. Without the
backwards extension a finished call drops out of the block into a loose line and the agent's face
draws twice; without the bound at narration the whole turn stays live and nothing folds until it
ends. The one shape this gets wrong is a turn of many calls with no prose at all between any of
them, which none of the four runtimes produces and the mock does not either.

**The default is `NOBODY_LIVE`.** `rowsOf(items)` with no status record assumes a settled
transcript, which is both honest — a row that still says `running` on a transcript nobody is
watching is a call whose end was never learned — and the reason every existing fold test passed
unchanged through a rewrite of the function they test.

### Left over

- **The fold's count is live now** (`RAN 17` with a teammate's call open, `RAN 22` without). That
  is 09 and it is the frontier.
- **A Routine firing re-addresses an in-flight turn.** `addressed` is reset by every `user` item
  and a Routine draws in the user's voice. On the map's *Found on the way*; older than this
  effort.
- **Still nothing has met a real batch.** Unchanged from round one, and now it would exercise
  `liveRunIn`'s backwards walk as well as the ids and the ordering.

## And then the author looked at it

**The exception in `runWork` was the wrong side of the trade.** Refusing a teammate's live prose
kept it on screen while it streamed and then took it away when it settled: the reply arrived at
the reader's altitude, over the turn they had asked for, and left without explanation. Admitting
it fixes the leaving and loses the arriving, so neither end of the predicate was the answer. The
answer is a third place, and it is on the amendment on ticket 08: **a finished teammate reply is a
step in the live block**, at a call's altitude with its own face, clipped to the row.

Two things fell out. `runWork` is one function with no `principal` argument again, which is what
07 said it should be, and `liveRunIn` now returns two kinds of index sorted back into transcript
order — the principal's open batch and the teammate replies that came back during it — because a
reply that landed between two calls belongs between them.

`.tool.reply` is the one new selector: the step row, the teammate's blobatar in the verb slot, and
the words in `--sans` rather than `--mono`. Prose set as a command would be the only place in the
app where somebody's sentence is drawn as machinery.

### A live step has a floor now

The reply was still never on screen, and the author's diagnosis was better than the rule it
corrected: *"it's not that is visible for a short time, the thing it's never visible, i think each
live step should have a min screen time, for example 300ms"*.

The batch bound is **degenerate for a single-call batch**, which is what most of them are: the
boundary is the batch's first call, and that call was opened *after* the reply landed, so the
reply is never after it. Its life on screen was not short, it was zero. Widening the rule was the
wrong fix, because it is two questions — whether a step is still what is happening now, which is
about the turn, and whether the reader got to see that it happened, which is about the screen.
Answering the first with the second is how the block filled up with stale work in the first place.

So the model stays strict and `useDwell` holds anything it drops inside `DWELL` (300ms, the
author's number), in place, matched by id. The timer owns the removal, which is `useSwallowed`'s
shape exactly.

**And the live row is keyed by its agent now**, not by its first item. It had been remounting the
whole block every time that item changed, which threw away the blobatar's animation state and,
once the dwell existed, the hook's memory of what had just been on screen — the first build of
the dwell did nothing at all for that reason, and the test that caught it is the only one in here
that renders twice onto the same root.

Not caught in a still: a 300ms window is not something `--screenshot-at` finds by guessing. The
fake-timer test is the evidence.

### Why no positional rule could ever have worked

Two attempts failed in opposite directions and the third one measured it instead of reasoning
about it. A `console.log` in `liveRunIn`, one run of `many-steps`:

```
principal=alice replies=[21] batch=[25]          lastOwn=25 boundary=25 news=[]
principal=alice replies=[21] batch=[31,32,33]    lastOwn=33 boundary=31 news=[]
principal=alice replies=[21] batch=[38,39,40,41] lastOwn=41 boundary=38 news=[]
```

Bob's reply is item **21**, forever, while Alice climbs past 40. **An agent message takes its `at`
from its first delta**, so a reply that took a few seconds to write is inserted into the
transcript at the moment it *began* — and by the time it settles, the principal has produced
several items that sort after it. It is new and it is positionally old. No comparison of
positions can date it, which is why one rule made it permanent and the other made it invisible.

What is new is the **transition**: a live message becoming a settled one. Nothing on the item
records when that happened, and the only thing that sees one render follow another is the
renderer. So `liveRunIn` hands over every settled reply and says nothing about how long it
stands, and `useDwell` starts a clock the first time it sees one, `REPLY_STANDS` at 8s.

Two clocks in one hook and they are not the same thing: `DWELL` is a **floor** under something
whose life belongs to the model (a call is on screen while it is open), and `REPLY_STANDS` is the
**whole** life of something that has no life of its own, because it has already happened.
