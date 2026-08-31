Type: task
Status: resolved
Blocked by: 02, 04, 05

# The seam, and the table

## Problem

Where a scheduler goes, what it is allowed to know, and the honest name for a prompt with nobody
behind it.

## The seam

`promptFromUser` is named for a user. A Routine is not a user, and calling it anyway would be the
same class of untruth as `STOPPED` on every rail row: a name asserting something the system knows
is false. Two candidates:

1. **A sibling on the orchestrator** — `promptFromRoutine(agentId, text, routineId)` — sharing
   everything with `promptFromUser` except the budget it applies (issue 04) and the origin it
   records on the `messages` row. The transcript then draws from a fact rather than from a guess.
2. **One method with an origin parameter.** Fewer paths, and every caller now has to think about
   an argument that is `'user'` in every existing call site.

The lean is **1**, with the shared body factored beneath both, because the difference is real:
different budget, different voice, different failure handling when a permission is raised.

## The scheduler

`packages/core/src/routines/scheduler.ts`, holding the injected `Clock`, and it **decides only
what is due.** It owns no timer and calls no orchestrator: it answers *given now, which Routines
should fire, and which firings were missed.* Main owns the timer and the calling, exactly as main
owns the pool and core owns the wake policy.

This is what makes the whole feature testable: `schema.ts` already refuses SQL time defaults so
that *"a checked-in scenario under a virtual clock stays testable"*, and a week of firings runs in
a millisecond against a fake clock. A scheduler that reads `Date.now()` anywhere throws that away.

The timer in main should be a **repeating short tick that asks the scheduler**, not a
`setTimeout` per Routine to a distant due moment: a long timeout does not survive a laptop
suspending, and issue 02's *fire only while open* answer has to cope with a machine that was
asleep for six hours and thinks it was awake.

## The table

`routines`, in `packages/core/src/store/schema.ts` with a checked-in migration. Columns follow
issue 01's concept and the schema's two standing rules — **no credential column anywhere**, and
**no SQL time defaults**. Notable decisions rather than a full list:

- `agent_id`, not `team_id`. Per ADR-0001's reason: a turn needs an AgentWorkspace, a session and
  a mailbox.
- The schedule stored as **what the user chose**, not as a parsed cron string, if issue 02's
  answer means blobot cannot honestly claim cron semantics. A small closed set of shapes the UI
  can render in words beats a five-field expression nobody can read back.
- `armed` as its own column, defaulting to off, because issue 05 makes the disarmed state the
  one that matters.
- A `routine_runs` table for the history issue 07 needs: fired at, outcome, reason. Rows, not a
  JSON blob, because this is the one thing here anybody will ever query.
- **No `enabled_by` free-text.** If issue 05 lands, who proposed a Routine is an agent id.

## Grill list

- Does a Routine survive a team being evicted from the pool? It must: it is a row, not a runtime
  object, and nothing about it lives in a `RunningTeam`.
- Does `SqliteRecorder` record a firing as an event, or is `routine_runs` the record? Two records
  of the same fact will disagree within a month.

## Answer

**Resolved 2026-08-30.** The draft stands. Four things the answered tickets pin down.

### `promptFromRoutine`, a sibling

Option 1, with the shared body factored beneath both. The difference is not cosmetic and is now
three-fold: a different budget (`ROUTINE_TURN_BUDGET`, issue 04), a different origin recorded on
the `messages` row so the transcript draws from a fact rather than a guess (issue 07), and a
different answer when a permission request is raised (issue 03's expiry, which applies to a
Routine run and never to the user's own turn). An origin *parameter* would put all three
behind an argument that is `'user'` at every existing call site, which is how the expiry ends up
applied to a user's turn by accident.

### `packages/core/src/routines/scheduler.ts`

Holds the injected `Clock` and answers one question: **given now, which Routines are due, and
which firings were missed.** It owns no timer, calls no orchestrator, and touches no window. Main
owns the timer, the window check and the calling, exactly as main owns the pool and core owns the
wake policy.

A repeating short tick, never a `setTimeout` per Routine to a distant moment. Issue 02 made this
load-bearing: a machine resuming from sleep must be indistinguishable from a machine that was
shut, and both must produce `missed` rather than a late firing. `missed` is **terminal** — never a
queue, because issue 02 refused catch-up in every form.

Nothing here reads `Date.now()`. `schema.ts` already refuses SQL time defaults so a scenario under
a virtual clock stays testable, and a week of firings under a fake clock is what makes issue 10
possible at all.

### The tables

`routines`:

- `agent_id`, not `team_id`. ADR-0001's reason: a turn needs an AgentWorkspace, a session and a
  mailbox, and none of those are a Team's to lend.
- `name`, `prompt`.
- **The schedule as a closed set, not an expression.** Issue 04 offers three shapes — hourly at a
  minute, daily at a time, weekly on a day at a time — so the column is a kind plus its two
  numbers, and the UI renders it in words by construction. No cron string is stored, because no
  cron string can be entered, because `cron` is on the glossary's Avoid list.
- `armed`, defaulting to off. Issue 05 makes the disarmed state the one that matters.
- `proposed_by`, an agent id, null on a Routine a person wrote. Never free text.
- `last_fired_at`, epoch millis from the clock.

`routine_runs`: `routine_id`, `fired_at`, `outcome` (`ran` / `skipped` / `stopped`), `reason`.
Rows rather than a JSON blob, because this is the one thing here anybody will ever query — issue
06 sorts the screen by it and issue 08's disarm-after-three counts it.

### `SqliteRecorder` records nothing new

`routine_runs` is the record of a firing. A second copy in the event stream would disagree with it
inside a month, and the event stream is the *durable subset of the agent event vocabulary*, which
a firing is not: a firing is a thing blobot did, not a thing an agent emitted. The turn a firing
starts is recorded exactly as any other turn already is.
