Type: task
Status: resolved
Blocked by: 03, 06

# What a run leaves behind

## Problem

Something happened at 03:00. The user opens the app at 09:00. What do they find, and how do they
tell it apart from the work they left running last night?

Today, a turn started by `promptFromUser` writes a `messages` row carrying the user's own words in
the user's own voice, and the transcript draws it as the user speaking. A Routine's prompt is the
user's words — but the user did not say them at 03:00, and a transcript that claims they did is
the app lying about who was there.

## The constraint

DESIGN.md has **three transcript voices** and this ticket must not invent a fourth without
arguing for it. The candidates:

1. **The user's voice, with a mark.** The prompt is the user's words; a small mono tag says the
   clock delivered them. Cheapest, and it keeps the transcript's grammar of *someone said, someone
   answered*.
2. **A fourth voice for the clock.** Honest, and expensive: a new voice is a new thing to design in
   every state the transcript has, and DESIGN.md's three exist because three was hard enough.
3. **Not in the transcript at all**, only in the Routine's run history. Rejected on sight: the
   agent's session contains it, so the transcript that omits it is missing turns, and the next
   thing the user reads makes no sense.

The lean is **1**: the user's voice, a mono tag reading the Routine's name, in the same register
as the turn-stopped line (`turn stopped · the context window is full`) which already proved that
a mono sentence under a turn can carry a fact the voices do not.

## Also owed by this ticket

- **The rail signal.** A team whose Routine ran overnight and finished should say nothing — `idle`
  is the resting state of a quiet app and is not printed. A team with a **parked permission**
  (issue 03) is already `waiting` and already inverts, and that is the one that must reach the
  user. What the rail must not do is grow a third signal for *"a Routine ran here."*
- **The run history.** Per Routine: fired at, outcome, and the reason when it is not *ran*.
  Skipped, cancelled, parked, budget exhausted, agent gone. This is the surface that tells the
  user whether their automation is real, and issue 02's answer decides how much of it is *skipped*.
- **What a skipped firing writes.** Nothing in the transcript, because nothing happened in the
  session. It is a run-history row and only that.

## Grill list

- Six Routines fired overnight across three teams. Is there any surface that says *"this happened
  while you were away"* as one thing, or does the user go looking six times? A digest is tempting
  and is a new screen; the honest minimum may be that the Routines screen sorts by last run.
- If the answer to issue 02 is *catch up on launch*, the user opens the app and immediately
  becomes the audience for four runs at once. The transcript treatment above is fine for one and
  probably not for four.

## Amendment, 2026-08-30, from issues 02 and 03

- The second grill-list item is dead: **catch-up on launch was refused**, so four runs never
  arrive at once. What arrives is `missed 4 firings` and a `Run now` verb, which is a row on this
  screen rather than a transcript problem.
- **The morning signal for a parked run is the rail inversion that already exists** and nothing
  new is drawn. Issue 03 found that parking is today's behaviour rather than a thing to build.
- Still open here, and now the whole of the ticket: which voice a Routine's prompt takes, and what
  the run history holds.

## Answer

**Resolved 2026-08-30. The user's voice, with a `system` line above it. No fourth voice, and the
mechanism already exists.**

### The transcript

The draft's three candidates missed the one the code already has. `renderer/src/model.ts:736`
builds `kind: 'system'` items — `turn stopped · the context window is full` and its siblings — a
mono line in the transcript that is **not a voice** and was invented precisely to carry a fact the
three voices cannot say. That is the right instrument, and using it costs nothing new:

- The prompt draws **in the user's voice**: solid, filled, right-aligned. The words are the user's;
  they authored them and nobody else said them.
- A `system` line sits **above** it: `routine · nightly typecheck`. That is the whole of the
  disclosure, and it is honest about the one thing the bubble gets wrong, which is *when*.

A fourth voice is refused. DESIGN.md's three exist because three was hard enough, and dashed
against solid is the trick that must not be softened by adding a third texture to compete with it.

### The run history

`routine_runs`, one row per firing, and the outcome is a closed set of three with a reason:

- **`ran`** — a turn started and ended.
- **`skipped`** — no turn started. Reason: no window, agent busy and coalesced, workspace gone,
  runtime not installed, team deleted. Nothing is written to the transcript, because nothing
  happened in the session.
- **`stopped`** — a turn started and did not finish. Reason: permission expired, budget exhausted.
  This one *is* in the transcript, as the `system` line the runtime's stop reason already produces.

The screen sorts by last run (issue 06), which is why there is no digest surface and no
*while you were away* screen. The thing that ran overnight is at the top of the list in the
morning.

### The rail

**Reopened and amended 2026-08-30 by issue 11, on this section only — resolved there: a Routine
run leaves an unread mark, as ink weight on the rail row's existing preview line, cleared by
opening that agent's pane. Never an inversion, never a dot, and never earned by a turn the user
started.**

The original reasoning, kept because it is still right for every other run: The answer below weighed a Routine
whose value is the work and never weighed one whose value is the *message* — *summarise hacker
news and send it back to me*, which was the first Routine the author wrote down. For that one, a
silent rail means the report lands somewhere the user has no reason to look. The transcript answer
above stands.

**Nothing new.** A finished run leaves an idle team, and `idle` is not printed: it is the resting
state of a quiet app. A parked run leaves a `waiting` agent, which already inverts its rail row,
which DESIGN.md already says is how a backgrounded team reaches the user. A third signal meaning
*a Routine ran here* would spend contrast on a fact nobody needs at a glance and would dilute the
one signal that does.
