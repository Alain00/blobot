Type: grilling
Status: resolved
Blocked by: 02

# What a run costs when nobody is watching

## Problem

The turn budget is **per user prompt** (`orchestrator.ts:185`): ten turns per team, spent by
agents waking each other, halted when exhausted, released when the user answers *continue?*. The
code comment says the budget exists because the app runs unwatched. Until now that was a
precaution. A Routine makes it the only thing between an hourly firing and a bill.

Three costs compound, and only the first is bounded today:

1. **Within a run.** The existing budget bounds it, but the release valve is a person, and there
   is none. A Routine that exhausts its budget at 03:00 halts and stays halted until morning,
   which is correct and should be *reported*, not silently repaired.
2. **Across firings.** Nothing bounds an hourly Routine running 24 times overnight, each spending
   up to ten turns, on each of several agents. That is the number nobody estimates correctly in
   advance.
3. **Across Routines.** Six armed Routines on three teams is six times whatever 2 works out to.

## What exists to build on

`orchestrator/bounds.ts` already refuses a peer message over 4,000 characters *at the tool
boundary rather than truncating it*, caps a wake batch at five and requeues the rest, and shows
its breakdown under the context gauge. That file is the precedent: **a ceiling blobot enforces
itself, stated in the interface, refused rather than silently trimmed.** Routine ceilings belong
there and nowhere else.

## The proposal to argue with

- **A run gets its own budget, not the team's ten.** A default of about three. Grounds: a Routine
  is one instruction to one agent, and a Routine that needs ten turns of agents waking each other
  at 03:00 is a workflow, which this effort refused to build.
- **A per-Routine daily ceiling on firings.** Not on tokens — blobot cannot price a turn, and the
  usage numbers it has are per-session context, not spend. Firings are the unit it can actually
  count and the user can actually reason about.
- **A Routine that exhausts its run budget is disarmed after N consecutive exhaustions**, and says
  so. An instruction that never completes is not automation, it is a leak.
- **The ledger is visible where the Routine is**, in the same register as the gauge's breakdown:
  counts and turns, never a guess at money.

## Grill list

- Should a Routine be allowed to use `message_agent` at all? Waking three teammates at 03:00 from
  an instruction the user wrote a month ago is the largest unattended action in the app. Refusing
  it makes Routines much weaker; permitting it is where cost 2 becomes cost 3.
- What is the interaction with a parked permission (issue 03)? A run parked for six hours has
  spent one turn and is holding a process. Firing counts and turn counts diverge here.
- Is the default ceiling a rule or a preference? Ticket 14's pattern says: blobot's own vocabulary,
  a small closed set of words, per agent. `careful`/`normal`/`trusting` is the shape to copy if
  this needs to be user-facing at all.

## Amendment, 2026-08-30, from issue 02

**Catch-up was refused entirely**, so there is no wake-up storm to bound and the third bullet of
*What exists to build on* has one case fewer. The ceiling is per firing and per day, as proposed.
A missed firing costs nothing, because nothing runs.

**From issue 03**: a parked run has spent its turns and is spending nothing while parked. Firings
and turns are separate counts in the ledger and must not be added together.

## Answer

**Resolved 2026-08-30. Four ceilings, three of them in `bounds.ts`, and the sharpest one is a
vocabulary rather than a number.**

### 1. The schedule's shapes are a closed set, and nothing finer than hourly

The strongest cost control here is not a counter. It is **refusing to offer the schedules that
produce the bill.** Three shapes, and no expression language:

- every hour, at a minute past
- every day, at a time
- every week, on a day, at a time

*Every five minutes* is not offered, so it does not have to be bounded, explained or recovered
from. This also removes the per-Routine daily ceiling the draft proposed: the maximum firings per
day is now knowable from the shape, by looking at it, which is a better property than a number
enforced somewhere else. A closed set the UI can render in words is issue 09's storage decision
too, and the two are the same decision seen twice.

### 2. A run gets three turns, and it is a constant

`ROUTINE_TURN_BUDGET = 3` in `orchestrator/bounds.ts`. Not a column on `routines`, and not a
setting. A per-Routine turn number is a knob nobody can set correctly in advance, and the honest
unit the user reasons about is firings, which shape 1 already bounds. A Routine that genuinely
needs ten turns of agents waking each other is a workflow, which this effort refused to build in
its second paragraph.

The team's own `turnBudget` column is untouched. A Routine run does not spend it and does not
release it.

### 3. `message_agent` stays available to a Routine run

Considered refusing it, and refusing is wrong. An agent waking a teammate while the user is away
is **not new authority** — agents already ping-pong unattended whenever the user walks off
mid-turn, and the budget is what has always bounded it. Refusing it inside a Routine would make
Routines much weaker for no gain in safety, and would create a second class of turn with different
rules, which is the kind of split that gets forgotten in an adapter six months later.

The run budget of three is the bound. A peer wake spends from it.

### 4. Disarm after three consecutive failed runs

Shared with issues 03 and 08, written once and referenced from all three: **three consecutive runs
that end in anything other than `ran` disarm the Routine**, and the screen says which reason it
was. Budget exhausted, permission expired, workspace gone, runtime missing — all the same rule. An
instruction that has failed the same way three nights running is not automation, it is a process
leak with a schedule attached.

### The ledger

On the Routine's row, in the register the context gauge's breakdown already uses: **counts, never
money.** Firings, runs, turns spent, and how many ended parked. Firings and turns are separate
columns and are never added: issue 03 established that a parked run has spent its turns and is
spending nothing, so a single blended number would be wrong in the one case anybody looks.

blobot has no price for a turn — the usage it holds is per-session context, not spend — and
inventing one would be the app asserting a figure it cannot source.

## Measured, 2026-08-30, by issue 10's scenario 5

`packages/core/src/routines/firing.test.ts`, twenty-four hourly firings under a virtual clock, on
the worst-behaved pair the mock has — two agents that wake each other on every turn:

- **72 turns overnight.** Every firing halted at `ROUTINE_TURN_BUDGET`, none reached the team's
  ten, and each announced its own halt, so the ledger has twenty-four lines rather than one
  summary.
- On the team's own budget the same night is **240**, with nobody watching. That is the number the
  constant exists to prevent, and it is why the run budget is not simply the team's.

**The constant stands at three.** What the measurement changes is what the *screen* owes the user:
the expensive variable is not the ceiling, it is the shape. Daily costs three turns a night;
hourly costs seventy-two of them against exactly the same ceiling, and a person choosing between
those two shapes is making a twenty-four-fold decision that neither number is on screen for.

So the schedule step says what the shape costs, in the register the gauge already uses — a count
of firings a day, beside the shape, at the moment it is chosen. Not a price, because blobot has
none. **Issue 06 owes this**, and it is the one addition this measurement makes to that ticket.
