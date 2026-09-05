Type: grilling
Status: open
Blocked by: 06, 08

# The silent drop, and every other way this fails

## Question

The defect that started this effort is not that blobot cannot show a picture. It is that blobot
**deletes one without saying so**. `session-updates.ts:76` takes the text of a content block, and
line 77 returns `[]` when there is none, so an image arrives, is measured as empty, and produces no
event. Not a placeholder, not a note, not a gap: an absence, in a transcript whose entire job is to
be an accurate record of what happened.

That is happening today, to any operator with a browser MCP server installed, and it will keep
happening on every path this effort does not cover — a mime type nobody planned for, a picture too
big for whatever ceiling ticket 09 sets, a runtime that does something ticket 01 did not see, a
blob the store failed to write.

This repo has a house answer for this shape and it is worth applying deliberately: a turn that
stops early says `turn stopped · the context window is full` rather than naming a protocol enum,
and *no pull request* and *we could not look* are separate states that never draw the same.

## What it has to settle

- **The line for a picture that arrived and was not drawn**, in blobot's words, naming why. This is
  the smallest useful piece of the whole map and it should be extractable and shippable on its own,
  ahead of every other ticket here.
- **Whether it is drawn once per picture or once per turn.** An agent in a screenshot loop would
  otherwise produce a column of identical apologies.
- **The catalogue of failures**, each with its state: a kind blobot will not draw, a size over the
  ceiling, a decode that failed, a store write that failed, a picture whose bytes are gone on a
  later replay, and a runtime shape ticket 01 never saw. Some of these are the same state and
  saying so is part of the answer; drawing six different sentences for one fact is the other
  failure mode.
- **What the agent is told, if anything.** Every other refusal in this app is answered at the tool
  boundary, in words, to the agent — the peer-message bound, the Handbook bounds, an attachment
  refused at pickup. A tool result blobot merely observed has no boundary to refuse at, so the
  agent may carry on believing the user saw something they did not. That gap is real and this
  ticket has to name it even if it cannot close it.
- **What a runtime with no picture support does.** `accepts` exists so the composer can refuse
  before the user types. There is no counterpart for the reverse arrow and there may not need to
  be, since blobot never asks for a picture; confirm rather than assume.
- **What the tests are.** The `-32602` canary in `.scratch/handbooks/` and the Cursor
  client-supplied `mcpServers` canary are the pattern: a behaviour blobot depends on, asserted, so
  a vendor's release does not remove it quietly.

## What is binding

- Never a protocol enum in front of a user. blobot's own words.
- An absence is not an acceptable failure mode anywhere in the transcript.
- A refusal is refused in words and never truncated silently.
- No em dashes in anything a user reads.
