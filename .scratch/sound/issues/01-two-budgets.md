Type: grilling
Status: resolved

# Two budgets, and what the rule at 1031 actually forbids

## Problem

`DESIGN.md` says, in the Routines bullet: *blobot still never interrupts: no notification, no
badge, no sound.* That sentence is binding and it appears to end this effort before it starts.

It was written about a specific thing: an agent arming a Routine off screen, and the argument that
the transcript block plus the rail's unread mark are the whole disclosure, with nothing reaching
past the window. It was never argued against interface sound in general, because interface sound
was not on the table when it was written.

The question is whether a rule written about one case governs a case its author was not
considering, and if so, how much of it.

## The proposal to argue with

**The load-bearing word is *interrupts*, and it does real work.**

A sound that plays because you clicked something cannot interrupt you. You initiated it, you are
looking at the app, and the sound arrives inside the same act. It is feedback, not an approach.

`DESIGN.md` already makes this exact distinction, twice, and both times admits the thing on the
same grounds:

1. **Two motion budgets.** Ambient motion runs forever and is spoken for by status, so a second
   ambient animation is almost always wrong. Interaction motion *runs once, because a person just
   did something, and is over before the eye gets back to the status column* — a different budget,
   admitted on that basis.
2. **The gaze layer, 2026-08-31.** Admitted explicitly because *it answers to the second budget
   and not the first*, and admitted at an amplitude **above** the status signal, which would be
   flatly illegal in the first budget. The file states that both can be true because they are
   different budgets.

Interaction sound is the third instance of an argument this file has already accepted twice.
Notification sound is not, and gets no help from it.

## Grill list

- Is *interrupts* really load-bearing, or is it a word that happened to be in the sentence? If the
  rule had said *blobot makes no sound*, would anything change?
- A sound you caused still reaches everyone else in the room. Is *cannot interrupt you* the right
  test, or is the test *cannot interrupt anyone*?
- The gaze precedent cuts both ways. It admitted a thing at higher amplitude than the signal by
  splitting the budget. Is budget-splitting a principle or a way to say yes to anything?
- What does the rule protect that sound would take? Name it concretely or the rule is a habit.

## Answer

**Resolved 2026-08-31. The rule governs one of the two budgets, and only one.**

### Interaction sound is admitted, and does not need the amendment

*Interrupts* is load-bearing, and the two precedents above are not a trick. The consistent
principle across all three is **who initiated it**: a channel spent on something the user just did
is bounded by how often the user does things, which is a bound the user holds. A channel spent on
something blobot decided is bounded by nothing the user controls, which is why ambient motion is
rationed to one loop and why the notification half of this effort is hard.

The objection that a sound reaches the whole room is real and is answered by ticket 03's level and
ticket 06's default, not by refusing the category. It is an argument about loudness, and loudness
is a parameter.

The objection that budget-splitting could justify anything is the sharpest one on the list, so the
split is written down as a **test rather than a category**, and it is one line:

> **Did the person cause this sound in the last 200ms by an act they committed?**

Yes and it is interaction. No and it is notification. Nothing sits between, and no future sound is
admitted by inventing a third budget.

### What the rule protects, named

It protects **the user's right to not be reachable**. blobot runs agents that work for minutes at a
time, and the whole design says: go and do something else, the transcript keeps the record, the
rail's mark says what happened while you were gone. Every disclosure in this app is *durable and
silent* rather than *immediate and loud* — the transcript block that stays and says `disarmed`
rather than vanishing, the unread mark earned by origin, the status word that survives a team
switch. A notification is the opposite claim: come back now.

That is worth protecting and this effort does not get to spend it casually. Which is why the
amendment in ticket 05 is narrow, and why the notification group is one event and not a category
that grows.

### Consequence for the rest of the map

- Tickets 02, 03, 04 concern both budgets and are decided on their own merits.
- Ticket 05 amends the rule for the notification budget alone.
- Tickets 06, 07, 08 are almost entirely about the notification budget, which is why they are the
  hard ones and why they are still open.
