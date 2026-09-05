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
