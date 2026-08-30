Type: task
Status: resolved

# The activity column does not survive a switch

## Problem

Reported by the author, 2026-08-30, while ticket 05 was being built: *"as i switch teams the
context/activity get lost, why?"*

Because the activity column was only ever live. `AppState.feed` is built by `applyEvent` from
tool completions and turn endings as they arrive, and the `snapshot` reducer case sets
`feed: []` on purpose, since a snapshot replaces the pane. The transcript beside it comes back
in full from the database. So switching to another team and back left a team that had done a
morning's work looking like a team that had done nothing, and nothing on screen said the column
had only been unloaded.

It is worse than a missing log, because the same wipe took a *conversation* line with it. A turn
that stops for any reason but `end_turn` draws `turn stopped · …` in the transcript, and that
line was live-only too. Ticket 04's first screenshot showed the proof: an answer that stopped
mid-sentence, with nothing under it, reading exactly like an answer that finished.

The rows were in the database the whole time. `tool_calls` has every call with its terminal
status and `turns` has every ending with its stop reason.

## What to do

Put the log in the snapshot, and format a restored entry through the same code as a live one.

- `SqliteStore.logOfTeam(teamId, limit)`, bounded by time across both halves rather than by
  count on each, for the same reason ticket 02 gives: the last N of each independently pairs a
  turn ending with tool calls from another hour.
- Carry what happened, not the line that was drawn. The pane formats it, so the two cannot
  drift apart.
- Restore the unusual endings as transcript items as well, because that is where they live.

## Done when

- Switching away and back shows the same column.
- A turn that stopped early still says why, after a switch.
- Store and reducer tests, and the same claim checked on screen.

## Answer

Done, 2026-08-30, in the same session as 04 and 05.

`SqliteStore.logOfTeam` returns finished tool calls and finished turns, each bounded to the
column's own 200 and then windowed together by time. `snapshot()` carries it as `UiSnapshot.log`,
and the reducer builds the column from it with `restoreFeed`, keyed exactly as the live path is
(`${toolCallId}:done`, `${turnId}:${agentId}:${at}`) so a restored entry and a live one for the
same call are one entry rather than two. Unusual endings are rebuilt as system items through
`stoppedBecause`, the same function the live path calls.

**One thing a restored line deliberately cannot say.** Live, a cancelled tool that reports
`completed` with an explicit `exit: null` prints `(exit null)` rather than being trusted. The
column stores a null for that *and* for every tool that never had an exit code, so a restored
line printing it would be guessing. It says the status and stops there.

**Not restored, and still correct:** an in-flight tool line. Those are the conversation saying
what an agent is doing *now*, and the existing comment in the snapshot case says so.

Verified on screen with `--demo --demo-scenario=out-of-room`: after the turn ended and the pane
re-snapshotted, the column carried `turn ended · max_tokens` and `read src/ completed`, and the
transcript carried `ALICE · TURN STOPPED · THE CONTEXT WINDOW IS FULL`. Before this, both were
blank at exactly that moment, which is how the bug was found rather than reasoned about.
