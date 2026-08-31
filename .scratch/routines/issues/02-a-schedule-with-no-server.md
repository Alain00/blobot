Type: grilling
Status: resolved
Blocked by: 01

# A schedule with no server

## Problem

blobot is local-first by rule: *no cloud dependencies, no hosted service is required for the app
to run*. There is therefore nowhere for a schedule to live except this process, and this process
ends when the user closes the window — `apps/desktop/src/main/index.ts:1380` quits the app on
`window-all-closed` everywhere but macOS.

So: **a Routine set for 03:00 does not fire if blobot is not open at 03:00.** That is not a bug to
be fixed later, it is the shape of the product, and the question is what blobot says and does
about it.

## Why this is the ticket that can kill the feature

"Automation" that silently does not happen is worse than no automation, because the user stops
checking. Every option below is a way of not being that.

## The options

1. **Fire only while open, and say so plainly.** A missed firing is skipped and recorded. The
   list shows `next run 09:00, if blobot is open`. Honest, tiny, and the feature is then useful
   for the machine-is-on case (a nightly on a desktop, an hourly during a working day) and useless
   for the laptop-in-a-bag case.
2. **Catch up on launch.** A firing whose due moment passed while the app was closed runs when
   the app opens. Cheap to build and the worst of the three: open the laptop on Monday and four
   agents start working at once on Friday's instruction, spending Friday's budget against a repo
   that has moved. If this is chosen it needs a coalescing rule (at most one catch-up per Routine,
   ever) and a hard ceiling.
3. **A background process that outlives the window.** A tray agent, a launch agent, a systemd
   unit. This is the only option that makes the word *cron* true. It is also a new install
   surface, a second lifecycle, agents spawning with no window to show them, and permission
   requests arriving at a UI that does not exist. It does not break the local-first rule, which
   is about *hosted services* — but it is a product decision an order of magnitude larger than
   the rest of this effort.

## The lean

**Option 1, with option 2 available per Routine and off by default.** A `catch up if missed`
tick, disarmed by default, on the Routine itself — because the honest answer differs per
instruction: *run the typecheck* is worth catching up on, *post the standup* is not. Option 3 is
a separate effort with its own spec, and this one must not smuggle it in.

## What resolving this decides for the rest

- Whether the word *cron* appears in the UI at all. On option 1 it must not: cron does not skip.
- Whether issue 09's `Scheduler` needs a concept of *overdue* or only of *due*.
- Whether issue 04's ceiling is per firing or per wake-up storm.

## Grill list

- What does the list say when a Routine has missed its last four firings? Is that an error state,
  or the ordinary condition of a laptop?
- On macOS the app does not quit when the window closes. Does a Routine fire with no window open?
  If yes, blobot behaves differently on two platforms and issue 03's *nobody is listening* becomes
  *nobody is listening, on Linux, sometimes*.
- Does sleep count as closed? A timer set for eight hours' time on a machine that suspends fires
  late, not on time, and `setTimeout` gives no signal that it did.

## Answer

**Resolved 2026-08-30. A Routine fires only while blobot is open, with a window on screen. A
missed firing is skipped and recorded, and there is no catch-up.** The word *cron* does not
appear in the product.

### Catch-up is refused, including as an opt-in tick

The draft leaned on option 1 with option 2 available per Routine, off by default. Grilling it
killed the tick.

A per-Routine *catch up if missed* is a decision the user makes **once, months before the
situation, with no information about it**. The cases where catching up is right (*run the
typecheck*) and the cases where it is wrong (*post the standup*) are not distinguishable by any
rule blobot can state, so the tick does not encode a policy — it encodes a guess, and stores it.
Then it fires four runs the moment the laptop opens, which is issue 07's worst layout problem and
issue 04's worst cost problem arriving together, caused by a checkbox nobody remembers ticking.

There is already a correct way to run a missed Routine, and it needs no stored policy: **run it
now**, a verb on the row, pressed by a person who is looking at it. That is strictly better than
catch-up on every axis — the human is present, the repo's current state is visible, and the
decision is made with the information rather than before it. One verb replaces a column, a
policy, a coalescing rule and a storm.

So the Routines screen says `missed 4 firings` and offers `Run now`. Nothing runs itself late.

### A firing needs a window, on every platform

`index.ts:1386` quits the app on `window-all-closed` everywhere except macOS, where the process
survives its last window. Left alone, Routines would fire on macOS with no window, which is worse
than not firing: issue 03 parks a permission request so a person can answer it, and there is
nobody to show it to. The `send()` would go to a destroyed window and the run would hang against a
listener that exists in main and reaches nothing.

**A firing is skipped when there is no live window**, on every platform, and the reason recorded
is the same one. This buys platform parity and removes an unreachable UI state, at the cost of a
macOS user losing nothing they were promised, because nothing was promised.

### Sleep needs no special case

Issue 09 already specifies a repeating tick asking *what is due given now* rather than a
`setTimeout` per Routine. A machine resuming from six hours' sleep is then indistinguishable from
a machine that was shut: the scheduler finds firings whose moment has passed, and they are
skipped and recorded like any other. No clock-jump detection, no drift correction, no third state.

### What the product says

`every day at 09:00` on the row. Once on the screen, not on every row: **blobot runs these while
it is open. It does not run them in the background.** Two plain sentences, no em dashes, and they
are true rather than reassuring.

### What this decides downstream

- Issue 04's ceiling is per firing and per day. There is no wake-up storm to bound, because
  catch-up is gone.
- Issue 09's scheduler needs *due* and *missed*, and `missed` is terminal — never a queue.
- Issue 10 drops scenario 7. The Monday catch-up cannot happen.
- Issue 07 no longer has to draw four runs arriving at once.

### The cost, stated

blobot is not a scheduler for a laptop that is closed at night, and this answer does not pretend
otherwise. A background process that outlives the window is the only thing that changes that, and
it remains a separate effort with its own spec: a second lifecycle, a new install surface, and
agents running with no UI to raise a permission to. Nothing in this effort may drift toward it.
