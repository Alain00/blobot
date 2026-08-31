Type: grilling
Status: resolved
Blocked by: 01

# Nobody is listening at 3am

## Problem

`orchestrator.ts:824`: when a permission request finds no listeners, blobot settles it with
`null` — **cancelled, never allowed.** Ticket 14 chose that direction deliberately and it is the
right default for a team the user stopped mid-turn.

An unattended run is that case by construction. So today, a Routine that fires while nobody is
at the screen and asks to run `git push` gets: request raised, no listener, cancelled, turn ends,
nothing done, and the user finds out in the morning if they look. The first Routine anybody writes
will hit this, because the useful ones touch the world.

**This is the ticket that decides whether Routines do work or only produce sentences.**

## What must not be the answer

**Widening trust for unattended runs.** `trusting` is blobot's ceiling, `bypassPermissions` is
refused by ticket 14, and *"the user was asleep"* is the weakest imaginable argument for granting
more authority than they granted awake. Any option that ends in a Routine doing something the same
agent could not do with the user watching is out.

## The options

1. **Park, do not cancel.** A permission request raised during an unattended run is *held*, the
   agent goes `waiting`, and the request is answered when a human arrives. DESIGN.md already
   states that the rail's inversion exists so *a backgrounded team blocked on a permission request
   can reach the user* — that sentence was written for exactly this and predates anything
   unattended. The run does not fail; it pauses, possibly for hours.
2. **Cancel, and report it as the outcome it is.** Keep today's behaviour, and make the Routine's
   run history say `stopped, needed permission for git push`. Zero new mechanism, complete
   honesty, and the user learns to write Routines that stay inside the vouched set.
3. **Refuse to arm a Routine whose prompt will obviously ask.** Undeliverable: blobot cannot know
   what an agent will do, and a heuristic on the prompt text would be blobot deciding meaning,
   which it does not do anywhere else.

## The lean

**1, bounded by 2.** Park by default with an expiry — a held request that nobody has answered by
the next firing is cancelled and recorded, so a Routine cannot accumulate a queue of sleeping
agents each holding a bridge process. Option 3 is rejected outright.

Parking has a real cost and it must be stated in the ticket's answer: a parked run **holds a
session, a bridge process and a pool slot** for as long as it is parked, and `team-pool.ts` never
evicts a working team. Four parked Routines could pin the pool and lock the user out of starting
anything. The expiry is not a nicety, it is what makes parking safe.

## Grill list

- Is a parked request `waiting` on the status fold, or a new state? It should be `waiting` and
  nothing new — but the fold currently reaches `waiting` from a live request, not a held one.
- What does the user see at 09:00? Three inverted rail rows and no idea which came from a Routine
  and which from work they left running. Issue 07 owns the answer; this ticket owns the fact that
  it needs one.
- Does a parked run count against the turn budget while parked? It has spent a turn and is
  spending nothing.
- If the answer is *park*, the disclosure in the creation flow may become untrue: it says blobot
  sets the runtime to prompt. It still does. But "prompt" now sometimes means "prompt in six
  hours", and the flow should say so where Routines are armed rather than in the flow.

## Answer

**Resolved 2026-08-30. Park, do not cancel — with an expiry that belongs to the Routine run and
not to the request. And the ticket's premise was wrong in a way worth writing down.**

### The premise was wrong: nothing was ever cancelling

This ticket was written against `orchestrator.ts:824` — no listeners, settle `null`, cancelled.
That path is **unreachable in the desktop app.** `apps/desktop/src/main/index.ts:586` subscribes
`onPermissionRequested` in **main**, when the team starts, not from the renderer. A running team
therefore always has a listener, whatever is or is not on screen. The cancel path covers the
headless demo and the tests, and nothing else.

So today, a permission request raised at 03:00 is not cancelled. It is forwarded over IPC to a
renderer nobody is looking at, and **it waits forever.** The agent is `waiting`, and
`running-team.ts:29` counts `waiting` as working, so `team-pool.ts` will **never evict that team**.
One unattended request already pins a pool slot, a session and a bridge process indefinitely, and
this is true before a single Routine exists.

That reframes the whole ticket. Parking is not a thing to build; it is the existing behaviour.
What is missing is the **bound**, and a Routine is what makes its absence expensive, because a
Routine parks the same agent again every time it fires.

### The decision

1. **A Routine run parks on a permission request, exactly as a user's turn does.** No new state,
   no new status. `waiting` on the status fold, the rail's one inversion, and DESIGN.md's sentence
   about a backgrounded team reaching the user finally has the case it was written for.
2. **A parked *Routine run* expires.** Cancelled — the answer `null` already means cancelled and
   is the one answer we may give on nobody's behalf — when it is still unanswered at the earlier
   of: the Routine's next due moment, or a fixed ceiling. The run history records
   `stopped, needed permission for git push`.
3. **A user's own turn still waits forever.** The expiry is a property of the run's origin, not of
   the request, and that line is deliberate: the user started that turn and can answer it, and an
   agent blocked on a human sitting there until answered is the property the design spends its
   only contrast inversion on. Taking a timeout to it would be this effort quietly changing a
   decision that is not its own.
4. **N consecutive expiries disarm the Routine**, sharing issue 08's disarm-after-N rule. An
   instruction whose every run dies on the same prompt is not automation, and retrying it nightly
   is a process leak with a schedule attached.
5. **No trust is widened.** `trusting` stays the ceiling, `bypassPermissions` stays unoffered, and
   a Routine may do nothing the same agent could not do with the user watching. *The user was
   asleep* is the weakest argument in the building for granting authority, and it is refused here
   permanently so that nobody has to have the conversation twice.

### Why the expiry is not a nicety

Without it the failure is not "a Routine did not finish". It is: four nights, four parked runs,
four pinned pool slots, four bridge processes, and a pool that can no longer start the team the
user is trying to open — with the only visible symptom being that blobot got slow. The expiry is
what makes parking safe enough to be the default.

### The bug this ticket found, which is not a Routine bug

The pinning above exists today, without Routines, for any team left with an unanswered request.
Worth its own ticket in whatever effort owns the pool, and named here so it is not discovered a
second time. It is **not** fixed by this effort and must not be fixed by making `waiting` count as
idle in `isWorking`: evicting an agent that is mid-tool-call is exactly what that guard exists to
prevent.

### What this decides downstream

- Issue 04: a parked run has spent its turns and is spending nothing. Firings and turns diverge,
  and the ledger counts both.
- Issue 07: the morning signal for a parked run is the rail inversion that already exists. Nothing
  new is drawn.
- Issue 09: the run's origin has to reach the permission handler, which is one more reason
  `promptFromRoutine` is a sibling rather than a parameter.
- Issue 10: scenarios 1 and 2 are now the two that matter most, and 2 is the one that proves the
  expiry rather than the parking.
