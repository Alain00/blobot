Type: task
Status: resolved
Blocked by: 01, 05

# Where Routines live on screen

## Problem

The author said *"list them on a sidebar or something."* The rail is the sidebar and it is
already spoken for, with rules that make it work.

DESIGN.md, verbatim constraints this ticket must satisfy:

- **The rail is one list.** A team row and an agent row are the same box, down to the padding,
  because a taller row *"made the rail read as two lists stacked rather than one."*
- **Nothing in this column covers anything else in it.** Pinning was tried and rejected.
- **A row above TEAMS** is the established door to a screen over the working surface — that is
  where *your agents* is reached from, *"because that is the order the model reads in."*
- **`waiting` already spends the app's one inversion in the rail.** A Routine indicator competing
  with it loses, and must not try.
- Status is monochrome, carried by motion, a mono word and a hairline. The blobatars are the only
  saturated thing on screen.

## The proposal

**A screen over the working surface, reached from a row above TEAMS, exactly like *your agents*.**

- The rail gets **`ROUTINES`**, a second row in the group that already holds the door to *your
  agents*. Not a third list, not a tree under each team, not a disclosure triangle.
- The screen is a **working** surface and takes none of the creation flow's editorial treatment:
  no hand face, no standfirst, no numerals. A row is the Routine's name, the blobatar and name of
  the agent it belongs to, the team it is on, the schedule in words, and when it next runs. The
  prompt sits under them clamped to two lines, the way standing instructions do on *your agents*.
- **Arming is a control on the row**, and it is the loudest thing on the screen because it is the
  only thing on it that grants authority. Disarmed is the resting state and reads as such.
- **A proposal from an agent (issue 05) is not a disarmed Routine and must not draw like one.** It
  is a row with an ink edge and two verbs, and it is at the top until answered.
- Editing and deleting are icon buttons on the row, revealed on hover and `:focus-within`, the
  rail's rule for the rail's reason.

## Why not the alternatives

- **A per-team list under the team's rail group.** It makes the rail two lists stacked, which the
  design has already rejected once by measurement, and a Routine is per agent anyway so the
  nesting would be three deep.
- **A panel beside the activity column.** The activity column is *the log* — tool calls and
  finished turns. A schedule is not activity, and the column already never auto-collapses because
  shoving the conversation sideways mid-turn is unacceptable; a second thing living there is the
  same cost paid twice.
- **In the navigator.** The navigator is *the place you ask*, and it lists teams and agents. A
  Routine should be **findable** there once this screen exists, which is a small addition, but it
  is not a home.

## What this ticket owes DESIGN.md

A *Screens, and what each one is for* entry for **Routines**, in the same register as *Your
agents*, and one line under the rail's entry naming the second door. Written when the ticket
resolves, not before.

## Note on copy

No em dashes in anything a user reads on this screen.

## Answer

**Resolved 2026-08-30. A screen over the working surface, reached from a `ROUTINES` row above
TEAMS**, beside the door to *your agents*. The proposal above stands; what follows is what the
grilling added or nailed down.

### The rail gets a row, not a list

`ROUTINES` sits in the group above TEAMS that already holds *your agents*, in the order the model
reads in: an agent exists before a team, and a Routine belongs to an agent. Two rows in that
group is still one column with one box size, which is the rule that matters.

**The row carries no count and no status.** A number of armed Routines is not something the user
can act on from the rail, and a status there would compete with `waiting` for the app's one
inversion, which issue 03 just made the load-bearing signal for a parked run. If a Routine needs
the user, the *team* row says so, because a parked run is a `waiting` agent and that is already
drawn.

### The screen

A working surface, no editorial treatment. A row is: the Routine's name, the blobatar and name of
the agent it belongs to, the team, the schedule in words, and when it next runs. The prompt sits
under them clamped to two lines, as standing instructions do on *your agents*.

- **Sorted by last run, most recent first.** This is issue 07's *what happened while I was away*
  answered without a digest screen: the things that ran overnight are at the top, in order,
  already. A sort is cheaper than a surface and cannot go stale.
- **Arming is the loudest control on the screen**, because it is the only one that grants
  authority. Disarmed is the resting state and reads as such.
- **`Run now`** is on every row. Issue 02 made it the whole of the missed-firing remedy, so it is
  not a debug affordance, it is the second most important verb here.
- **`missed 4 firings`** where the next-run line would be, when there are any. Plain, not an
  error: a laptop that was shut is the ordinary condition, not a fault.
- Editing and deleting are icon buttons revealed on hover and `:focus-within`, the rail's rule for
  the rail's reason.

### A proposal is not a disarmed Routine, and this is now load-bearing

Issue 05 made the separation the whole of what keeps ADR-0003's fail-closed property. A Routine the
user disarmed is a decision they made; a proposal is a decision they have not made yet. So:

- Proposals sit **above** the list, not sorted into it, with an ink edge, until answered.
- Two verbs, and they are the only two: **Arm** and **Discard**. There is no third that quietly
  keeps it around unanswered.
- The row says which agent asked, and shows the prompt in full rather than clamped, because a
  person is being asked to read it and that is the entire mechanism.

### Amendment, 2026-08-30, from issue 10's scenario 5

**The schedule step says what the shape costs.** Measured: an hourly Routine spends 72 turns
overnight and a daily one spends 3, against the same per-run ceiling. The expensive variable is
the shape, and a person choosing between them is making a twenty-four-fold decision with neither
number on screen. So the count of firings a day sits beside the shape where it is chosen, in the
register the context gauge already uses — a count, never a price, because blobot has none.

### Copy

One line at the head of the screen, and it is the only place the limitation is stated:

> blobot runs these while it is open. It does not run them in the background.

No em dashes anywhere on this screen. No `cron`.

### DESIGN.md

A *Screens, and what each one is for* entry for **Routines**, in the register of *Your agents*,
plus one clause on the rail's entry naming the second door in that group. Written with the build,
not before it, so it describes what exists.
