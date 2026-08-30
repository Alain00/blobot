Type: task
Status: ready-for-agent
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
