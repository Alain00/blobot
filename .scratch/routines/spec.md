# Routines: work that happens on a schedule

Raised by the author, 2026-08-30: *"help me plan how we do coroutines, and make that agents can
make them, list them on a sidebar or something. Coroutines are very useful, it's the base of
automation."* Clarified in the same breath: **schedules, cron jobs, repeatable.**

Nothing here is broken. Every turn blobot has ever run was started by a person typing, and this
effort exists because the author wants turns that start without one.

## The word

`coroutine` is taken, and it means the other thing — a suspendable function. The glossary's rule
is *use these words; don't drift to synonyms*, so the name is decided once, here, before ten
files spell it three ways. The proposal is **Routine**: a named, repeatable instruction to one
Agent, on a schedule. Issue 01 settles it.

## What this actually is

A Routine is **a prompt with a clock instead of a person behind it.** That is the whole
mechanism, and stating it that plainly is what keeps this effort from becoming a workflow engine:
there are no steps, no branches, no outputs feeding inputs. `promptFromUser` already delivers a
prompt to one agent, runs a turn, and bounds what follows. A Routine is that call, made by a
timer.

Everything difficult about it is downstream of one fact: **nobody is at the screen.**

## What is binding today

- **A permission request parks until it is answered, and pins the team while it does.** This
  entry originally said *cancelled, never allowed*, on `orchestrator.ts:824`. Issue 03 found that
  path is unreachable in the desktop app: `index.ts:586` subscribes in **main**, at team start, so
  a running team always has a listener whatever is on screen. A 03:00 request therefore waits
  forever, the agent is `waiting`, `running-team.ts:29` counts `waiting` as working, and
  `team-pool.ts` will never evict that team. Parking is today's behaviour; the bound is what is
  missing. Issue 03.
- **The turn budget is per user prompt.** `orchestrator.ts:185`, ten per team by default,
  released when the user answers *continue?*. A Routine has no user to answer, so the budget's
  release valve is closed and its purpose — *bounding cost when nobody is watching* — is finally
  load-bearing rather than theoretical. Issue 04.
- **A peer carries no operator authority.** `envelope.ts`, and `.scratch/team-addressing/issues/03`
  refused relayed authority permanently. A stored recurring turn is *more* authority than a peer
  message, not less, so it cannot be granted through a channel that carries less. Issue 05.
- **The palette is an allowlist of what a person authored.** `docs/adr/0003`. A Routine an agent
  wrote and blobot then runs unattended is the same question that ADR answered for skills.
- **No hosted service is required for the app to run.** `CLAUDE.md`. There is no server to hold
  a cron table, so a schedule fires only while blobot is open. Issue 02, **resolved**: it cannot
  honestly be called cron, and it is not.
- **The pool keeps three teams live, LRU, never evicting one mid-turn.** `team-pool.ts`. A
  Routine firing on the fourth team either starts it (and evicts something the user chose) or
  does not fire. Issue 08.
- **Every timestamp is epoch millis from the injected clock; no SQL time defaults.**
  `store/schema.ts`. This is why a scheduler is testable here at all, and why the checked-in
  scenarios can run a week of firings in a millisecond.
- **The rail inverts for `waiting`**, and DESIGN.md says why: it is *the only way a backgrounded
  team blocked on a permission request can reach the user*. That sentence was written before
  anything fired unattended. It is about to be the main event.

## The shape being proposed

One `routines` table. One `Scheduler` in `packages/core` holding the injected `Clock`, deciding
only *what is due*, and calling one seam on the orchestrator. Main owns the timer; core owns the
rule. The renderer gets a list and two verbs, arm and disarm.

A Routine names **one agent** and not a team, because everything a turn needs is per agent: an
AgentWorkspace, a session, a mailbox, a status. This mirrors ADR-0001's reason and it is not
re-litigated.

## Out of scope

- **Steps, conditionals and outputs.** A Routine is one prompt. If the work needs three agents in
  order, the prompt says so and the agent uses `message_agent`, which is the mechanism that
  already exists and already carries the bounds. blobot does not grow a DAG.
- **A background daemon, a tray agent, or anything that runs with the window closed**, until
  issue 02 says otherwise. Deciding this by accident, in an implementation, is the failure mode.
- **Compaction.** As ever, the CLI behind the adapter owns it. `.scratch/transcript-scale/spec.md`.
- **Raising the trust ceiling.** `trusting` is the ceiling and `bypassPermissions` stays
  unoffered. A Routine that needs more authority than the user granted awake does not get it for
  being asleep.

## Issues

- `01-the-word-and-the-shape.md` — **Resolved 2026-08-30: the word is Routine.** Written into
  `CONTEXT.md` under a new **Automation** heading, with `cron` added to **Avoid**.
- `02-a-schedule-with-no-server.md` — the grilling. **Resolved 2026-08-30: a Routine fires only
  while blobot is open, with a window on screen. A missed firing is skipped and recorded, there is
  no catch-up in any form, and the remedy is a `Run now` verb pressed by a person.** The word
  *cron* does not appear in the product.
- `03-nobody-is-listening-at-3am.md` — **Resolved 2026-08-30: park, do not cancel, with an expiry
  that belongs to the Routine run and not to the request.** A user's own turn still waits forever.
  The ticket's premise was wrong and the correction is above: nothing was cancelling, and an
  unanswered request already pins a pool slot today, without Routines.
- `04-what-a-run-costs-when-nobody-is-watching.md` — **Resolved 2026-08-30: the sharpest ceiling
  is a vocabulary, not a number.** Three schedule shapes and nothing finer than hourly, so the
  runaway case is not offered rather than bounded. `ROUTINE_TURN_BUDGET = 3` as a constant, not a
  column. `message_agent` stays available, because an unattended peer wake is not new authority.
  Three consecutive failed runs disarm.
- `05-may-an-agent-schedule-itself.md` — **Resolved 2026-08-30: an agent may propose, only a
  person may arm, and a proposal never fires.** `propose_routine` on the loopback server, recipient
  must be the caller, capped in `bounds.ts`, and the persona says so, because an agent not told
  what happened next will report the work as scheduled.
- `06-where-routines-live-on-screen.md` — **Resolved 2026-08-30: a `ROUTINES` row above TEAMS,
  opening a screen over the working surface**, beside the door to *your agents*. Sorted by last
  run, which is why there is no digest surface. A proposal is drawn apart from a disarmed Routine,
  and that separation is what keeps ADR-0003's fail-closed property.
- `07-what-a-run-leaves-behind.md` — **Resolved 2026-08-30: the user's voice, with a `system`
  line above it.** No fourth voice: `model.ts:736` already builds a mono transcript line that is
  not a voice, invented to carry exactly this kind of fact. The rail gains nothing.
- `08-busy-evicted-moved-retired.md` — **Resolved 2026-08-30**: a table of nine cases, and one
  shared rule — three consecutive runs ending in anything but `ran` disarm the Routine.
- `09-the-seam-and-the-table.md` — **Resolved 2026-08-30**: `promptFromRoutine` as a sibling of
  `promptFromUser`, a `Scheduler` in core that owns no timer, `routines` and `routine_runs`, and
  the recorder records nothing new.
- `11-a-routine-that-reports-back-has-nobody-to-report-to.md` — **Open.** Raised by the author's
  own first example, *summarise hacker news every day at 9am and send it back to me*. A Routine
  whose value is the **message** rather than the work lands in a pane the user has no reason to
  open, and the rail says nothing because the agent went straight back to idle. **Reopens issue 07
  on its rail answer only**, on the grounds that 07 weighed only the other kind. **Resolved
  2026-08-30: an unread mark, as ink weight on the rail row's existing preview line, earned only
  by a Routine run and cleared by opening that agent's pane.** Never an inversion, because
  `waiting` owns the only one.
- `10-mock-a-routine-that-fires-into-a-wall.md` — **Resolved 2026-08-30**: eight scenarios under
  a virtual clock. Scenario 5 runs before the screens, because it can still change issue 04's
  constant.

Order: 01 first and alone. 02, 03 and 05 are the three that can kill or reshape the feature and
should be answered before anything is built; 04 follows 02. 06 and 07 are one design pass. 09
implements. 08 and 10 land last and together.

**All eleven are resolved and the frontier is empty: nothing is left to decide before this code
gets written.**

Build order: 09 first, because the seam and the tables are what everything else runs against, and
because a `Scheduler` under a virtual clock is testable before a timer exists. Then 10's scenarios
1 to 6, then 03's expiry and 08's disarm rule against them. 05's tool next. 06 and 07 last, drawn
against a scheduler that already works — the same order the first demo used when it built the UI
against `MockAgentRuntime` rather than against a real CLI.

## Found while grilling, and not this effort's to fix

**An unanswered permission request pins a team in the pool, today, with no Routine involved.**
`waiting` is not `idle`, `isWorking` is true, and the pool never evicts a working team. A user who
leaves a request unanswered loses a pool slot, a session and a bridge process until they come
back. Issue 03 bounds the *Routine* case with an expiry and deliberately leaves the user's own
turn waiting forever, because that property is what the rail's one inversion is spent on. The
general case belongs to whatever effort owns the pool, and it is **not** fixed by making `waiting`
count as idle in `isWorking` — that guard exists to stop an agent being killed mid-tool-call.
