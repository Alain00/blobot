Type: grilling
Status: resolved
Blocked by: 07

# A routine that reports back has nobody to report to

## Problem

Raised by the author, 2026-08-30, with the first concrete Routine anybody has written down:
*"everyday at 9am do a summary of hacker news and send it back to me."*

The ownership half of that is already right and is not what this ticket is about: that Routine
belongs to **one agent on one team**, `<team>/<agent>`, which is what issue 09 stored and what
`CONTEXT.md` now says in those words.

The other half is a hole. **The deliverable of that Routine is a report to the user, and blobot
has no way to tell the user it arrived.**

## What issue 07 decided, and why it is wrong here

Issue 07 answered the rail in one line: *nothing new.* A finished run leaves an idle team, `idle`
is not printed because it is the resting state of a quiet app, and a third signal meaning *a
Routine ran here* would dilute the `waiting` inversion.

That reasoning holds for a Routine whose value is the **work** — run the typecheck, tidy the
branch. The user finds out by looking at the repository, and the app staying quiet is correct.

It fails for a Routine whose value is the **message**. Under issue 02 the app is open at 09:00, so
the summary is written into that agent's pane, in that team, and if the user is on another team or
another screen the rail says nothing, because the agent went straight back to idle. The report is
sitting somewhere the user has no reason to look. A daily briefing nobody is told about is a daily
briefing that does not exist.

This is not a new class of Routine to be typed and switched on. It is most of them: *summarise*,
*review*, *check and tell me* are what a person actually schedules.

## The constraint that makes this hard

`waiting` already spends the app's one contrast inversion, and issue 03 just made that the
load-bearing way a parked run reaches the user. **Whatever this is, it is not a second
inversion**, and it must not compete with the one signal that means *an agent is blocked on you*.
Nor is it a notification: nothing in blobot has ever interrupted the user, and a desktop
notification is an OS surface with its own permissions, which is a bigger door than this ticket
should open on its own.

## The candidates

1. **An unread mark on the agent's rail row**, carried by the existing preview line — the rail
   already draws *the last thing that agent said, and when*. This is the smallest thing that could
   work: the row already holds the content, and what is missing is only that it was never seen.
   Cost: the app grows a read/unread concept it does not have, and *unread* is a per-user-per-view
   fact that has to live somewhere.
2. **On the Routines screen only.** Issue 06 already sorts by last run, so the report is at the
   top of that screen in the morning. Costs nothing new and is honest — but it means the user has
   to remember to go and look, which is the same failure one screen further along.
3. **A digest**, refused once already in issue 07 for good reasons, and worth naming again so it
   is refused deliberately rather than by omission.
4. **Nothing, and say so in the product.** The Routine's prompt can end *"and message me"*, which
   lands in the transcript, and blobot's answer is that a schedule is not a mailbox. Defensible,
   and it makes the author's own example a second-class use of the feature.

The lean is **1, bounded to Routine runs only**, with 2 as its second home. An unread mark
earned by a turn the user did not start is a different claim from an unread mark on every turn,
and only the first is being proposed.

## What this reopens

**Issue 07, on its rail answer only.** Its transcript answer — the user's voice under a `system`
line — is untouched and correct. The grounds for the reopen are that 07 weighed a Routine that
does work and never weighed a Routine whose output *is* the message, which is the first one the
author wrote.

## Grill list

- Is *unread* a property of a run, or of a message? A run is the thing the user did not ask for,
  so it should be the run. But the thing they want to see is the message.
- What clears it? Opening that agent's pane is the obvious answer and is probably right.
- Does this leak into ordinary turns? It must not. An agent finishing work the user started while
  they look at another team is not unread, it is finished.
- Six Routines overnight, six marks. Is that a column of dots the user tunes out inside a week?
  If so, candidate 2 is the honest answer and 1 is the one that feels good in a mockup.

## Answer

**Resolved 2026-08-30. Candidate 1, narrowed: an unread mark, earned only by a Routine run,
carried as ink weight on the rail row the app already draws, cleared by opening that agent's
pane.** Issue 06's screen is its second home and needs no change to be it.

### What it is

The rail already draws *the last thing that agent said, and when*, quiet. When the last thing an
agent said came from a Routine run the user has not looked at, **that line draws at full ink
instead.** That is the whole treatment.

- **Not an inversion.** `waiting` owns the app's one inversion and issue 03 made it the way a
  parked run reaches the user. This must lose to that, and weight against quiet does lose to it,
  legibly, when both are in the column at once.
- **Not a dot and not a count.** A dot is a new element in a column whose job is quiet, and a
  count answers a question nobody asked: two unread reports and five are the same decision.
- **Monochrome**, like every other status signal here. The blobatars stay the only saturated
  thing on screen.
- **Folded onto the team row** the way `StatusWord` already folds, so a team the user is not on
  can carry it. A signal only visible once you are already on the team answers nothing.

### The four grill-list questions

- **Unread is a property of the run**, not of the message. The run is the thing the user did not
  ask for, and it is the thing `routine_runs` already records. The message is what they then read.
- **Opening that agent's pane clears it.** Nothing else does. Not opening the team, because the
  team pane is not where that agent's turn is.
- **It does not leak into ordinary turns.** An agent finishing work the user started is not
  unread, it is finished, and marking it would put a mark on almost every row within a day and
  make the signal worthless. The mark is earned by origin, which is exactly the fact
  `promptFromRoutine` records on the `messages` row for issue 07's sake — one fact, two uses.
- **Six overnight is six marks, and that is acceptable**, because they clear on opening and
  because issue 04 capped the schedule shapes at hourly. It would not be acceptable with a
  five-minute schedule, which is one more thing that ceiling buys.

### What it is not

Not a notification, not a badge on the dock, not a sound, not a digest. blobot has never
interrupted the user and this ticket does not start. The mark is there when they look, and the
Routines screen sorted by last run is there when they go looking on purpose.

### Issue 07's rail answer, restated

07 said *nothing new in the rail* and that stands **for every run the user started**. It is
amended only for a Routine run, on the grounds the reopen gave: a Routine whose value is the
message has nowhere else to land.
