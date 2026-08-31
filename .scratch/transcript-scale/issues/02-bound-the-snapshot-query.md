Type: task
Status: resolved
Blocked by: 01

# Bound the snapshot query

## Problem

The snapshot is the whole team transcript, every time.

`SqliteStore.forTeam` (`packages/core/src/store/sqlite-store.ts:290`) and `answersOfTeam`
(`:307`) both `.all()` with no `LIMIT` and no cursor. `snapshot()`
(`apps/desktop/src/main/index.ts:188`) calls them at launch and on every team switch, and hands
the result across the IPC boundary. `TeamPool` keeps three teams live but the snapshot is
rebuilt on selection regardless, so switching between two long-lived teams re-serializes both
transcripts every time the user clicks.

This is the issue that makes the other two matter. Ticket 01 stops the renderer paying for
history on every delta; virtualization (03) stops it paying for history in the DOM. Neither
stops the main process reading and serializing an unbounded row set.

## What to do

Give both queries a bound, and give the pane a way to ask for what is above it.

The queries are ordered ascending today because the pane wants them in order. A bounded
version has to select the *last* N and reverse, which is `desc` + `limit` + a reverse in the
mapping — cheap, and the index on `at` already exists for `lastActiveAt`.

The two halves have to be bounded *together*, which is the awkward part: `forTeam` returns
messages and `answersOfTeam` returns answers, and `model.ts:139` merge-sorts them. Taking the
last N of each independently gives a window with a ragged edge — a reply whose question fell
off. Bound by time rather than by count: find the cutoff first (the `at` of the Nth most
recent row across both), then select both halves from that cutoff. A slightly uneven count is
fine; a conversation missing half its speakers is not, and the snapshot reducer's comment
already says so.

Pick N by what a reader plausibly scrolls back through in one sitting, not by what the DOM can
survive — 03 is what makes the DOM survivable. Something in the low hundreds.

Then: "load earlier". It needs a cursor (the oldest `at` currently held), a store method that
takes it, and a reducer action that *prepends* rather than replaces — `snapshot` replaces the
pane on purpose and must keep doing so.

Scroll anchoring is the part that will be got wrong. Prepending content above the viewport
moves everything down, and `useStickToBottom` only knows about the bottom. Hold the scroll
position across the prepend, or the reader is thrown to a random place in their own history
every time they reach the top.

## Open question for the author

Whether "load earlier" is a button or happens on scroll. A button is honest and cheap and
cannot fire twice by accident; infinite scroll is what people expect from a chat pane. This is
an interface decision, so it is `DESIGN.md`'s to make, not this ticket's — resolve it before
building the affordance, and land the bounded query either way.

## Done when

- Typecheck, tests and build pass.
- A store test proves the window is contiguous across both halves: seed a team whose messages
  and answers interleave, bound it tight, and assert no answer arrives without the message it
  answers.
- Launching a team with a long history shows the recent end of it, scrolled to the bottom, with
  a way to reach what is above.
- Reaching the top and loading earlier does not move what the reader is looking at.

## Answer

Done, 2026-08-30. The snapshot carries the recent end of a transcript and a way to reach what is
above it.

**One query, not two.** `SqliteStore.transcriptOfTeam(teamId, { limit, before })` replaces the
pair at the snapshot boundary; `forTeam` and `answersOfTeam` survive for tests and are now
documented as unbounded with a line saying the snapshot may not call them. `TRANSCRIPT_WINDOW` is
200, deliberately the figure the activity column already keeps, so the two halves of a restored
pane reach back about as far as each other.

**Bounded by time across both halves**, the way `logOfTeam` does it and for the sharper reason
the ticket gave: over-fetch each half `desc`, merge the times, cut both at the shared cutoff. The
store test seeds sixty interleaved turns one tick apart and asserts the set of questions and the
set of answers are the same set, so a ragged edge shows up as an unpaired index rather than as
something a reader has to notice.

**`more` is free.** The over-fetch is `limit + 1` per half, so a row surviving the merge below
the cutoff *is* the evidence that history exists above. No second query, no count.

**The affordance is a control, decided with the author.** Infinite scroll wants a second
scroll-position mutation inside the one `ResizeObserver` that already pins the column to the
bottom, and the two fight. `.earlier` borrows `.route`'s mono label and not its chevron, because
a chevron promises the content is already here and folded and this is a fetch.

**Scroll anchoring holds the distance from the bottom, not the scroll position.** `scrollTop` is
measured from the top and every prepended pixel invalidates it; `scrollHeight - scrollTop` is
measured from the end of the column and prepending does not move the end. Restored in the
observer rather than in a one-shot layout effect, and released only on the first frame where the
height has stopped changing, because markdown lays out late and a code block later still — the
same three cases the comment on `useStickToBottom` already warned about. `pinned` is false
throughout, since the reader is at the top, so the two paths cannot race.

**The team id travels with the cursor**, and main refuses the call when it is not the open team.
Several teams are live; a page that came back after a switch and prepended one team's history to
another's would be a worse outcome than no page.

**Prepend is its own action.** `earlier` is not expressed as a snapshot of a wider window, which
would have thrown away the live tail, the pending rows and any permission block standing in the
pane. It dedupes by id, keeps the copy already on screen because that one may be mid-stream, and
never moves the cursor forward — an empty page leaves it where it was, or the control asks for
the same window forever.

**Tests.** Five in `store.test.ts` (contiguity across both halves, the recent end ascending,
paging without repeating or skipping, a short conversation that reports nothing above it, an
empty team), four reducer cases in `model.test.ts` (cursor from the snapshot, prepend, the
duplicate, the empty page), and four in `ConversationEarlier.test.tsx` (absent at the true
beginning, present above a window, absent with no fetcher, and one wait that cannot be started
twice).

**One honest limitation, written into the method.** The cutoff is a time, so a window whose oldest
rows all share a millisecond keeps every one it fetched and loses any beyond the over-fetch at
that same instant. It needs more than `limit` rows inside one millisecond, which a team of agents
taking turns does not produce. `logOfTeam` has the same shape. Recorded rather than defended
against, because the alternative is a composite cursor and this does not earn one.

**Not verified on screen, and it should be.** The app was run on a deliberately tiny window
(`TRANSCRIPT_WINDOW = 4`, reverted) and launches and renders correctly on the bounded query. But
the `load earlier` control itself never appeared in that frame and could not: `--demo` holds its
database in memory and the renderer only re-snapshots on mount and on a team change, so the
demo's snapshot always predates the demo's own history. Seeing the control in the real app needs
a persisted team with more than 200 rows, which is a minute of a human's time and no more. The
scroll anchor cannot be tested in jsdom at all, which the component test says out loud rather
than pretending otherwise.

## Comments

**2026-08-30, on 03.** The residue this leaves for virtualization is smaller than the ticket
assumed. A reader now has to click `load earlier` deliberately, repeatedly, to mount an unbounded
DOM, rather than getting one handed to them at launch. That is a legitimate input to 03's
"whether 01 and 02 together already put this far enough away to defer", and it is offered as
evidence rather than as the answer.
