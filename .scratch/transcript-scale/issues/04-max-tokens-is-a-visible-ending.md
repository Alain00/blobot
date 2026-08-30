Type: task
Status: resolved

# `max_tokens` is a visible ending

## Problem

blobot does not manage the agent's context and should not: `turnBudget`
(`orchestrator.ts:341`) bounds turns per user prompt, which is a cost guard, and compaction
belongs to the CLI behind the adapter. That is the rule and it is the right rule.

What is ours is the ending. The adapter already translates `max_tokens` through rather than
swallowing it (`adapters/claude/translate.ts:139`), with a comment saying exactly why: a
refusal that renders as a silent stop is a bug report waiting to happen. The same is true of a
turn that stopped because the agent ran out of room.

Unverified: what the pane actually *draws* when a turn ends that way. The stop reason reaches
the UI; whether the reader can tell the difference between "finished" and "ran out" has not
been checked.

## What to do

Check it first, then decide whether there is work here at all. `MockAgentRuntime` already
exists to reproduce endings like this, so a scenario that stops on `max_tokens` is the
instrument.

If the ending is invisible, give it a mark. Monochrome, in the transcript's own vocabulary,
saying that the turn ended early and why. `DESIGN.md` governs what that looks like and what it
may say; read it before writing the string, and no em dashes in copy the user reads.

Do not add a remedy. Suggesting compaction, or offering to continue, is a product decision
nobody has made and would put blobot in the business of managing a context it has said it does
not manage.

## Done when

- A mock scenario ends a turn on `max_tokens`, and a test asserts what the pane shows.
- The same for `refusal` and `max_turn_requests`, which arrive down the same path and have the
  same failure mode.

## Answer

Done, 2026-08-30. Checked first, as the ticket asked, and there was work but less than it feared.

**What the pane drew.** The stop reason did reach the transcript: `model.ts` already put a
system line under a turn that ended any way but `end_turn`. What it said was
`turn stopped · max tokens`, the protocol's own word with the underscore taken out. That names a
mechanism, and a user reading it has no way to get from there to "the agent had no room left",
which is the whole point of the line.

**What changed.** `stoppedBecause(stopReason)` is one exported function, so the three endings
that arrive down the same path say what happened rather than which enum member it was:

| stop reason | the line |
| --- | --- |
| `max_tokens` | `turn stopped · the context window is full` |
| `max_turn_requests` | `turn stopped · the runtime hit its own request limit` |
| `refusal` | `turn stopped · declined to answer` |
| `cancelled` | `turn stopped · cancelled` |

Attributed in the team pane, so it reads `Alice · turn stopped · the context window is full`.
The activity column still logs the raw reason, because that column is a log.

**No remedy, and a test that keeps it that way.** One of the four tests asserts the strings match
no offer to compact, continue or retry. Suggesting compaction is a product decision nobody has
made, and the line sits three pixels from the composer where `/compact` already lives.

**The instrument is a mock scenario**, as the ticket said it should be: `runs-out-of-room` stops
mid-sentence on `max_tokens` after a `usage` step that fills the window, and it is a demo run of
its own (`--demo-scenario=out-of-room`), because the gauge reading 100% and the transcript saying
why are only worth anything together. `refuses` already covered `refusal`; `max_turn_requests`
is covered at the reducer rather than with a scenario of its own, since it arrives down exactly
the same path with nothing runtime-specific about it.

**One thing this found that the ticket did not name**, and it is the bigger half:
`06-the-activity-column-does-not-survive-a-switch.md`. The system line was drawn live and then
lost on the next snapshot, so the first screenshot of the new scenario showed an answer that
stopped mid-sentence with nothing under it at all. Ticket 04's work is only visible because 06
is done.
