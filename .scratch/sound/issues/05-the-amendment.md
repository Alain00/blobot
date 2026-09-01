Type: task
Status: resolved
Blocked by: 01

# What the rule at 1031 becomes

## Problem

Ticket 01 established that *blobot still never interrupts: no notification, no badge, no sound*
governs the notification budget and that arming anything in that group contradicts it. `CLAUDE.md`
says contradicting a `DESIGN.md` rule is a reopen and a note, never a quiet edit. This ticket
writes the replacement.

## Answer

**Resolved 2026-08-31. The sentence keeps its first two clauses and loses the third, narrowly.**

### What is edited

The Routines bullet keeps its sentence about that bullet's own subject, since the claim it makes
there is still true: an agent arming a Routine does not notify, badge or sound. Nothing in this
effort gives a Routine firing a sound — ticket 02 refuses it by name.

What changes is that the sentence stops being readable as an app-wide prohibition. It gains a
pointer, and a new bullet is added to the Motion section's neighbourhood carrying the actual rule:

> **Sound is a fourth channel, and it answers to the same two budgets motion does.** *2026-08-31.*
> One test decides which: **did the person cause this sound in the last 200ms by an act they
> committed?** Yes and it is interaction, which cannot interrupt by definition and is admitted on
> exactly the grounds the second motion budget is admitted on. No and it is notification, which
> can, and which is **one event**: an agent is `waiting`, blocked on a permission request, on a
> team you are not looking at. That single exception is bought and not assumed — with nobody
> listening a permission request is cancelled, never allowed, so silence there loses work the user
> did not choose to lose. Nothing else in the app notifies. A Routine firing does not, because the
> rail's unread mark is earned by origin. A turn ending does not, because one prompt to four
> agents ends four turns. Navigational sound does not exist: the `@mention` list was refused its
> open animation on frequency alone, and frequency is a harsher disqualifier for a sound than for
> a motion, because a sound cannot be looked away from.
>
> **One voice for the whole app**, synthesized and never a file, quiet by design. Attention is
> bought with **duration and never with volume**: a notification that is the loudest thing in the
> app breaks the same rule the governing colour rule states, one channel over.
>
> **Everything sits behind a switch**, the way everything decorative sits behind
> `prefers-reduced-motion`. There is no `prefers-reduced-sound` to query, so the switch is the
> whole accommodation and it is visible, persistent and remembered.

### What is not edited

The governing colour rule, the three transcript voices, the motion budgets, and the
`prefers-reduced-motion` withdrawal block are all untouched. This adds a channel; it does not
renegotiate the three that exist.

### Note for `build.md`

This is a `DESIGN.md` amendment carried by an effort outside ticket 12's lineage, which is the
first time that has happened. The rule it narrows was written by the Routines effort, so
`.scratch/routines/` gets a pointer back to here.
