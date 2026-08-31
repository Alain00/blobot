Type: prototype
Status: resolved
Blocked by: 09

# Mock a Routine that fires into a wall

## Problem

Ticket 08's thesis, which this repo has held to since: *a kind mock produces a UI that shatters on
first contact with a real runtime.* The mock reproduces observed traps on purpose — ragged deltas,
a cancelled tool reporting `completed`, `used: 0` on cancel.

Routines add a whole class of traps that are **hard to observe live**, because observing them
means waiting until 03:00 and closing your laptop. Under a virtual clock they are free. If they
are not checked in before a real timer runs once, they will be found by the author, at night, in
a real repository.

## The scenarios to check in

1. **The firing that asks for permission with nobody there.** Whatever issue 03 decides — parked
   or cancelled — this is the scenario that proves it, and it is the single most likely first
   contact with a real Routine.
2. **The parked run that is still parked at the next firing.** Proves issue 03's expiry and proves
   the second firing does not stack a second parked run on the same agent.
3. **The firing that lands on a busy agent**, and the second firing that lands while the first is
   still queued. Proves the coalescing rule from issue 08.
4. **The overnight storm.** Twenty-four hourly firings under a virtual clock, against issue 04's
   ceiling. This is the one that produces a number, and the number is the argument for whatever
   the default ends up being.
5. **The Workspace that vanished**, N times, ending in the Routine disarming itself.
6. **The run that exhausts its budget and halts**, with nobody to answer *continue?*.
7. **The catch-up on launch**, if issue 02 permits it: the app opening on Monday with four
   Routines overdue since Friday. Whatever the coalescing rule is, this is where it is proved,
   and if the output is ugly that is the ticket telling issue 02 it chose wrong.

## Note

Scenarios 4 and 7 are the two that can still change a decision after it was made. They should be
run before the UI work in 06 and 07 is finished, not after, because both produce a shape the
screen has to draw.

## Amendment, 2026-08-30, from issues 02, 03 and 05

- **Scenario 7 is dropped.** Catch-up on launch was refused; the Monday storm cannot happen.
- **Scenarios 1 and 2 are promoted.** Issue 03 found that a request parks rather than cancelling,
  and that parking pins a pool slot, so scenario 2 is the one that proves the expiry and it is the
  most valuable test in the effort.
- **New scenario: an agent proposes four Routines in one turn**, and the fourth refusal reaches
  the model as an answer it has to account for. Issue 05's cap, exercised from the model's side.
- **New scenario: a firing with no live window.** Issue 02 skips it on every platform, and this is
  the case a macOS build would otherwise reach and a Linux build would not.

## Answer

**Resolved 2026-08-30.** The final list, after the amendment above. Eight scenarios, all under a
virtual clock, all checked in before a real timer runs once.

1. **The firing that parks on a permission with nobody there**, and is answered in the morning.
   The happy path of issue 03, and the one that proves a parked run survives.
2. **The parked run still parked at the next firing.** Proves the expiry, proves the second firing
   does not stack a second parked run, proves the pool slot comes back. **The most valuable test
   in the effort.**
3. **Three consecutive parked-and-expired runs**, ending in the Routine disarming itself. Issue
   08's shared rule, exercised through issue 03's case.
4. **The firing that lands on a busy agent**, then a second firing while the first is still
   queued. Proves the coalescing rule.
5. **Twenty-four hourly firings overnight** against `ROUTINE_TURN_BUDGET`. Produces the number
   that justifies the constant, and if the number is ugly it is issue 04 being told it chose
   wrong.
6. **The Workspace that vanished**, three times, ending in a disarm with the reconcile's own words.
7. **An agent proposing four Routines in one turn**, the fourth refused at the tool boundary, and
   the refusal reaching the model as an answer it has to account for. Issue 05's cap from the
   model's side.
8. **A firing with no live window.** Skipped on every platform. The case a macOS build would
   otherwise reach and a Linux build would not.

Scenario 5 runs **before** the screens in 06 and 07 are finished, because it can still change
issue 04's constant, and the ledger those screens draw is the shape of whatever it decides.

## Amendment, 2026-08-30, from building scenario 7

Scenario 7 says *four Routines in one turn, the fourth refused*. It was written before issue 05
resolved on **one proposal per turn** and three standing, so the number that gets refused moved:
the first lands and the next three are refused inside the turn. The scenario is built as written
otherwise, and the standing cap is exercised beside it across four turns.

What the scenario exists for is untouched, and it is the reason it survives the change: the
refusal reaches the model as a **failed tool call with words in it**, not as silence and not as a
failed turn. `Scenario.proposeRoutine` on the mock is what makes that observable, the way
`messageAgent` makes the mailbox observable.
