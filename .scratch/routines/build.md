# Routines: build status

The spec is `spec.md`; every decision is on a ticket in `issues/`, all eleven resolved. This file
is what exists in the code and what the next session picks up.

## Built

**Issue 09, the pure half.** `packages/core/src/routines/`:

- `domain.ts` — `Routine`, `Schedule`, `RoutineRun`, `RoutineOutcome`.
- `schedule.ts` — `lastOccurrenceAtOrBefore`, `nextOccurrenceAfter`, `occurrencesBetween`,
  `describeSchedule`. Walks a `Date` rather than adding a constant, so a 9am briefing stays at
  9am across a DST boundary.
- `scheduler.ts` — `Scheduler.due(routines, now)`, and `FIRING_TOLERANCE_MS`.
- 16 tests, all under a virtual wall clock. `pnpm --filter @blobot/core exec vitest run src/routines`.

**The tables**, in `store/schema.ts` with checked-in migration `0012_wise_turbo.sql`: `routines`
and `routine_runs`. `agent_id` and never `team_id`; a schedule kind plus two small numbers and
never a cron string; `armed` defaulting to false.

Exported from both entry points. `@blobot/core/domain` gets the types and the schedule arithmetic
(pure, so the renderer can say *next run* without asking main); the main entry adds `Scheduler`.

Typecheck clean, 483 core tests pass.

**Issue 09, the seam.** `Orchestrator.promptFromRoutine(agentId, text, { runId, permissionExpiryMs })`,
a sibling of `promptFromUser` and not a parameter on it. It carries the three differences:
`ROUTINE_TURN_BUDGET = 3` in `bounds.ts` beside the other ceilings blobot enforces itself;
`messages.routine_run_id` recording the origin; and issue 03's permission expiry, which is armed
only while a Routine run is in flight and never on the user's own turn.

**The store methods** on `SqliteStore`: `createRoutine`, `allRoutines`, `routinesOfAgent`,
`routineById`, `setRoutineArmed`, `settleRoutine`, `tombstoneRoutine`, `recordRoutineRun`,
`routineRunsOf`, `consecutiveRoutineFailures` (issue 08's disarm-after-three), and
`unseenRoutineRuns` / `markRoutineRunsSeen` (issue 11's unread mark). Migration
`0013_black_beyonder.sql`.

**Issue 10's scenarios, the ones that do not need main's tick.**
`packages/core/src/routines/firing.test.ts`: the overnight storm (5), the firing that parks and is
answered (1), the run still parked at the next firing (2), three nights of the same wall (3), a
firing landing on a busy agent (4), and the same night as the scheduler sees it. Scenarios 6 and 8
— the vanished Workspace and the missing window — are the tick's, and land with it.

19 more tests. Core is 510 green, desktop 289, both typecheck.

### What scenario 5 measured

**72 turns overnight**, on two agents that wake each other every turn: twenty-four firings, each
halting at `ROUTINE_TURN_BUDGET`, none reaching the team's ten. The same night on the team's own
budget is **240** with nobody watching, which is the number the constant exists to prevent.

**The constant stands at three.** What the measurement changed is issue 06: the expensive variable
is not the ceiling, it is the *shape*. Daily costs three turns a night and hourly costs seventy-two
against the same ceiling, so the schedule step now owes a count of firings a day beside the shape,
at the moment it is chosen. A count, never a price.

**Main's tick.** `apps/desktop/src/main/routine-runner.ts`, and it is issue 08's table with one
branch per row. `RoutineRunner.tick()` asks `Scheduler.due` what is due, fires what is, and
writes a `routine_runs` row saying what happened in words. Injected `Clock`, injected
`RoutineHost` — `hasWindow`, `teamOfAgent`, `open`, `finished` — so nothing in it needs Electron
and a week of firings runs in a millisecond. Wired in `index.ts` beside the database, started
after the window and stopped with the last one, and `unref`'d so a timer never holds the app up.

Issue 10's **scenarios 6 and 8** land with it, in `routine-runner.test.ts`, plus the whole of the
case table: the ordinary firing, the disarmed Routine, the vanished Workspace three nights
running, the runtime that is no longer installed, the agent taken off the roster, the run that
stops on a permission, the coalesced second firing, the busy ceiling, and the crash-consistent
row. 14 tests.

**`TeamPool.hold`.** A firing runs a team and never switches to it, so a held team goes in
*behind* the active one and is pinned for the length of the run. Without the pin, a Routine on a
fourth team could be evicted between being started and being asked to do anything, because it is
idle until its turn begins and `isWorking` cannot protect it — which is exactly the slot-pinning
issue 03 predicted a run would do.

**Three more constants in `bounds.ts`**: `ROUTINE_DISARM_AFTER` (issue 08's shared rule),
`ROUTINE_PERMISSION_CEILING_MS` (issue 03's ceiling, taken as the earlier of it and the Routine's
own next due moment), and `ROUTINE_BUSY_CEILING_MS`.

**A firing cascades and the deletion cascades.** Deleting a team tombstones its Routines, which
is the one case where the record is not kept. Taking an agent off a roster **disarms and keeps**
them instead, saying who they belonged to.

**Issue 05's `propose_routine`.** A second tool on the loopback server, advertised **only when
the team keeps Routines** — a tool a model can see is a capability it will believe in.
`Orchestrator.handleProposeRoutine` is its handler, beside `handleMessageAgent`, and the row it
writes is `armed: false` with `proposed_by` set. Nothing an agent can call arms one.

- **No recipient field and no arming field.** The absence is the rule: the bearer token is the
  caller, so a Routine proposed for a teammate has nothing to name it with. An `agent` argument
  passed anyway is refused at the server rather than quietly made the caller's own.
- **The caps are refused, never trimmed**, in `bounds.ts`'s posture:
  `ROUTINE_PROPOSALS_PER_TURN = 1`, `ROUTINE_PROPOSALS_STANDING = 3`, the name under
  `ROUTINE_NAME_LIMIT`, the prompt under the peer message ceiling. Standing counts proposals
  nobody has answered; arming one clears the way.
- **`parseProposedSchedule`** (`routines/proposal.ts`) is where the closed set of three shapes is
  enforced against a model. A cron string is refused rather than parsed, and nothing is rounded to
  the nearest thing blobot can do: a Routine invented from a request blobot did not understand is
  worse than a refusal the model can read.
- **The ack and the persona both say it does not run.** `Proposed: "...", every day at 09:00. It
  is not running and it will not run until a person arms it ... Say that you have proposed it. Do
  not say it is scheduled.` The persona line sits with the one saying a peer message is a
  colleague's request rather than the operator's, which is the framing that survives contact with
  a message trying to talk it out of it. Same hazard the Codex adapter answers by saying in words
  that it has no subagents.
- **`Scenario.proposeRoutine`** on the mock, so issue 10's scenario 7 runs through the real
  orchestrator and the refusal is observed arriving as a failed tool call.
- **`onRoutinesChanged`** on the orchestrator, forwarded by main, because a proposal is the one
  thing an agent can put in front of the user without saying anything.
- `OWN_TOOL_CHARS` now measures **both** tools. It is measured rather than typed precisely so
  that the number moves when a tool is added and nobody has to remember.

Core 557 green, desktop 312, both typecheck, the app builds.

**The screens** (06, 07, 11), built last against a scheduler that already worked, the way ticket
12 was built against `MockAgentRuntime` rather than against a real CLI.

- **`Routines.tsx`**, over the working surface, reached from a **`ROUTINES` row above TEAMS**
  beside the door to *your agents*. A working surface in the register of that screen and not the
  creation flow's: it borrows `.agentspage` / `.agentssheet` / `.agentshead` outright, because a
  second sheet that looked like a different sheet would be claiming the two are different kinds
  of place. Sorted by last run, most recent first, which is issue 07's *what happened while I was
  away* answered with a sort rather than a digest. `arm` is the loudest control on the row;
  `run now` is beside it on every row; editing and deleting are icons on hover and
  `:focus-within`. `missed 4 firings` sits where the next-run line would be, plain.
- **Proposals sit above the list with an ink edge**, prompt in full, exactly two verbs.
- **`RoutineForm.tsx`**, a modal because the Routine outlives the screen that opened it. Three
  shapes and a time, no expression and no `cron` anywhere, and issue 06's amendment on the line
  under it: `every day at 09:00 · 1 firing a day`. The agent is a picker when writing and
  **stated rather than offered** on an edit, because a Routine is `<team>/<agent>` and moving one
  would be a new Routine wearing an old one's run history.
- **Issue 07's transcript line.** `messages.routine_run_id` becomes a name in main
  (`routineNameOfRun`) and travels two ways: `routineOrigins` on the snapshot and on `earlier`,
  and a third argument on the `blobot:message` stream. `itemsOfMessage` emits a `system` item at
  the same `at` immediately before the user bubble, and `Array.sort` is stable, which is what
  keeps it above the thing it is about. No fourth voice.
- **Issue 11's unread mark.** `unread` on the snapshot, folded from `unseenRoutineRuns` over
  every agent on every team, drawn as `.unread` on the rail's existing preview line and on a
  backgrounded team row's `when`. Cleared by `openPane`, in the reducer *and* in main, so the
  mark goes on the click rather than on the next snapshot.
- **`RoutineRunner.runNow`**, which issue 06 needed and nothing had built. It fires whatever the
  schedule says and whatever `armed` says, answers when the turn has *started* rather than when
  it ends, sets `missedFirings` to zero, and leaves `lastSettledAt` alone.
- Five IPC handlers plus `seenRoutineRuns`, and `routine-rows.ts` composing the row where the
  database is, so the renderer still holds no database handle.
- `--screen=routines` and `--screen=new-routine` for a screenshot, beside `--screen=agents` and
  `--screen=hire`.

Core 561 green, desktop 344, both typecheck, the app builds. **This closes `.scratch/routines/`:
all eleven tickets are resolved and all eleven are built.**

**Issue 05 reversed, and built** (see that ticket's `## Amendment`). `propose_routine` writes
`armed: true`. The author was shown the argument against it and issue 10's measured 72 turns, and
reaffirmed; the ticket carries both, because the reasons did not stop being true, they were
outweighed. What was built with it, and none of it is decoration:

- **A block in the transcript**, in the turn that created it: `Bob scheduled a routine`, the
  name, `every day at 09:00 · 1 firing a day`, and `disarm`. A new `routine` item kind and a
  `.scheduled` block borrowing the permission block's grammar at the system voice's weight. **No
  `keep` on it** — keeping it is what happens if you do nothing, and a button for the status quo
  would read as the agent asking permission, which it was not. Once answered it stays and says
  `disarmed` rather than vanishing.
- **Restored from the rows, not from the event.** `scheduledRoutines(store, agentIds, since)`
  reads Routines with `proposedBy` set inside the transcript window, so the block survives a
  relaunch and a team switch. A disclosure you could miss by being on another team when it
  happened would not be one. `armed` is read live, so the block and the screen cannot disagree.
- **The screen's ink-edge section changed meaning, not shape.** It was *waiting for permission*
  and is now *you have not looked at this*, which is what `reviewed_at` already recorded. Verbs
  are `keep` and `disarm` rather than `arm` and `discard`, and `disarm` is the loud one now,
  because the loud control is the one that changes authority and the authority was already taken.
- **The standing cap re-based on spend.** `ROUTINE_PROPOSALS_STANDING` counted *unreviewed*
  proposals, which would have gone dead at the exact moment it started to matter. It counts
  **armed Routines this agent proposed** now. Disarming frees a slot; being looked at does not,
  and the refusal says `waiting will not clear it` rather than implying a queue.
- **The tool description, the persona line and the ack all inverted.** The hazard they were
  written for has not gone away, it changed direction: an agent that believes its Routine is
  inert will not mention arming one, and the user finds out from a turn at 03:00. The ack now
  hands the model the frequency too, since an agent choosing `every hour` is choosing
  twenty-four times what `every day` costs and now arms it itself.
- **`ItemView`'s memo was nearly lost and a test caught it.** The first version passed the whole
  `routineArmed` map to every row; a fresh object per render re-rendered the entire history on
  every streaming delta. `armed` goes through `Cast` as a boolean instead.

## Decided while building, that no ticket covers

**`lastSettledAt`, not `lastFiredAt`.** Issue 09 wrote *last fired*. That is wrong and the tests
found it: a missed firing does not run, so it would never advance a fired-mark, and the scheduler
would report the same missed firing on every tick for the rest of the Routine's life — writing
another `routine_runs` row each time. The column is *the last moment this Routine was accounted
for*, ran or missed, and the caller writes `Due.settledThrough` back to it. *When did it last run*
is a different question and `routine_runs` answers it, which is also where issue 06's sort, issue
08's disarm-after-three and issue 11's unread mark all read from.

**The tolerance is how issue 02 is enforced, and it is the whole of it.** The scheduler cannot ask
whether the app was open at 03:00. It asks whether the firing was *noticed promptly*. A moment
nobody noticed within `FIRING_TOLERANCE_MS` is a moment nobody was there for, so a machine
resuming from six hours' sleep and a machine that was shut produce the same answer — which is what
issue 02 demanded, and the reason there is no clock-jump detection anywhere in the file.

**`occurrencesBetween` caps at 500.** A Routine armed a year ago on a machine that was shut has an
unbounded count, and nobody needs the figure: `missed 4 firings` says *this is not running*, and
past a couple of dozen the sentence means the same thing however it ends.

**`routine_runs.seen_at`** carries issue 11's unread mark, on the run rather than on the message.
The run is the thing the user did not ask for.

**The origin is a link, not a flag.** `messages.routine_run_id` points at the firing rather than
saying *this was a Routine*. Both questions get asked, by different screens — issue 07's `system`
line wants *which Routine*, issue 11's unread mark wants *has that run been seen* — and a boolean
answers neither without a second lookup.

**One budget counter, and a ceiling that moves.** `#turnsThisPrompt` was always per-prompt and
shared; the addition is `#budgetCeiling`, set to the team's ten by a user prompt and to three by a
firing. **Known gap:** a firing that lands while a user's prompt is still ping-ponging resets the
count and lowers the ceiling under it. It is bounded and it is not silent — the budget event says
which ceiling it hit — but it is the wrong number for the user's prompt. The alternative is a
counter per origin, which is a second budget nobody can see. Worth a ticket if it is ever observed;
not worth pre-empting.

**A missed firing writes no run, and is not a failure.** Issue 08's table gives the no-window
case the record `skipped · blobot was not open`, and issue 07 says one `routine_runs` row per
firing. Built literally, that disarms a Routine after three nights of a shut laptop — which
contradicts issue 02 (*a laptop that was shut is the ordinary condition, not a fault*) and issue
06, whose screen draws `missed 4 firings` plain, a sentence that could never appear because the
Routine would have disarmed at three.

So the tick does **nothing at all without a window**: it settles nothing, and the firings it
slept through come back as *missed* when a window returns. That is one code path for a macOS
process that outlived its last window and a Linux app that was shut, which is the parity issue 02
bought, reached the same way it made sleep indistinguishable from shutdown. The count lives in a
new `routines.missed_firings` column (migration 0014) rather than in rows, because it has to
survive the settling that stops a moment being reported twice, and it goes to zero the next time
blobot is there for a firing. **Issue 08's table is amended on that one row**: the record is
`missed`, not a skipped run.

**A busy agent is waited for, not queued in the mailbox.** Issue 08 says a firing that lands
mid-turn should use the mailbox and add nothing. It cannot: `promptFromRoutine` does not go
through the mailbox, and the wake path that does would run the Routine's turn under the *team's*
ten with **no permission expiry** — losing both protections issues 03 and 04 exist for, in
precisely the unattended case they were written for. So `promptFromRoutine` refuses to start on a
busy agent (`{ outcome: 'busy' }`, nothing committed), and the tick holds the firing, asking again
every five seconds until `ROUTINE_BUSY_CEILING_MS`. The behaviour issue 08 specified is
unchanged — not stacked, runs when free, the next firing coalesces — only the mechanism is. **Its
table is amended on that row too.**

**A run reports how it ended, and the run is the turn plus what it set off.** `promptFromRoutine`
returns `RoutineTurn` rather than `void`: the two ways a Routine run dies are both its own doing,
and a caller correlating a budget event with a cancelled permission would be reconstructing what
was known inside. Two things this caught. A permission that *expired* is marked on the run when
the timer fires, because the user pressing **Reject** settles as cancelled too and a run somebody
answered is not a run that died of nobody being there. And the budget is marked at the moment of
the halt, not read afterwards: the routing-turn refund can put the count back under the ceiling,
so a run that stopped at three turns would otherwise report `ran`. That in turn means the run
waits for `settled()` — a Routine's turns are agents waking each other, and the halt lands two
turns after the firing's own turn ends.

**The run's row is written when it starts, carrying `stopped · the run did not finish`.** Not a
placeholder: that is the crash-consistent answer, since a run interrupted by a quit *is* a turn
that did not finish. `settleRoutineRun` replaces it when the turn is over. Written at the end
instead, a firing killed by a quit would leave no row and look as though it never happened.

**Two tests were red in the tree before this and are fixed here**, neither of them Routines':
`store.test.ts`'s two column lists had not been told about the compaction work's `compaction`
column, and `firing.test.ts` asserted exactly 24 budget announcements for a night of 24 firings
when the real number is 55. Every one of them is at `ROUTINE_TURN_BUDGET` and there is at least
one per firing; the extras are peers still writing to a team the budget has already stopped, each
being told so rather than dropped. The assertion says that now.

**Scenario 7's number moved, and the scenario is unchanged in what it is for.** Issue 10 wrote
*four proposals in one turn, the fourth refused* before issue 05 settled on **one** per turn. So
the first lands and the next three are refused. Both caps are exercised: three refusals inside one
turn, and a fourth standing proposal refused across four turns. What the scenario exists to prove
is untouched — the refusal reaches the model as an answer it has to account for.

**A standing proposal a person disarmed rather than discarded still counts against the cap.**
There is no `reviewed_at`, so *answered* is read as *armed or gone*. The direction is deliberate:
an agent is told plainly why it cannot propose again, and the way out is a person looking at what
is already waiting. **Issue 06 has to decide this properly** — a proposal the user armed and later
disarmed must not reappear above the list as unanswered, and that needs a column this did not add.

**Nothing arms a Routine yet.** An agent can propose one and the tick will fire an armed one, but
no surface creates, arms or discards one, so `propose_routine` currently writes rows only issue
06's screen will show. That is the build order — the screens go last, against a scheduler that
already works — and it is worth saying out loud rather than being discovered.

**`routines.reviewed_at`, and issue 06's flagged gap is closed rather than noted.** *Answered*
was read as *armed or gone*, which the previous session recorded as something issue 06 still had
to decide properly. It is a column now (migration `0016_flashy_madripoor.sql`), written by
arming, disarming and editing — **never by the tick's own disarm-after-three**, which is blobot
noticing rather than a person deciding, so `setRoutineArmed` and `reviewRoutine` stay two calls.
It fixes two things at once: a proposal the user armed and later disarmed no longer comes back to
the top of the screen as unanswered, and it no longer counts against issue 05's standing cap, so
the agent is no longer told to wait for a decision that was made twice.

**A `Run now` run is seen at birth.** Issue 11 says the mark is never earned by a turn the user
started, and `Run now` is one: the person is looking at the screen they pressed it on. So the
run's row carries `seenAt` from the moment it is written rather than being cleared afterwards,
which matters because clearing afterwards would also clear the overnight runs standing beside it.
`RoutineRun.seenAt` is on the domain type for that one case.

**`missedFirings` is answered by `Run now` and the schedule is not.** Pressing it zeroes the
count, because `missed 4 firings` beside a run that just happened is stale rather than
informative and the person who pressed it can see the state of the repository. It does **not**
settle the schedule: `lastSettledAt` is what stops a scheduled moment being reported twice, and a
run at 09:20 was not the 09:00 moment.

**A disarmed Routine has no next run, and says `not running` rather than a date.** The row could
compute one — the arithmetic is pure and the renderer has it — and it would be the screen
promising a firing that is not coming. Arming is the whole of what makes that line exist.

**`UiSnapshot.unread` and `routineOrigins` are optional.** Absent and empty say the same thing,
and a transcript with no Routine in it should cost nothing. Main populates both on every path.

**Known gap: the unread mark rides the preview line, so it needs a line to ride.** An agent whose
Routine ran but whose transcript window does not reach that turn draws its role instead, and no
mark. In practice the snapshot restores the recent end of the conversation and the run that
earned the mark is at that end, so this is reachable only by paging far enough back; it is
recorded rather than fixed, because the alternative is a mark with nothing under it.

**Reviewed by screenshot, list screen only.** `--screen=routines` against seeded rows in demo
mode, reverted afterwards. **The dialog could not be reviewed the same way and that is
pre-existing**: `--screen=hire` is equally blank under `--demo`, because demo mode has no store
behind the screens those dialogs read from. Worth a ticket of its own; the form was checked in
jsdom instead.

## Next session

The effort is finished. `DESIGN.md` has its *Routines* entry, the clause naming the second door
in the rail's group, and the two transcript rules issues 07 and 11 settled.

What is left is not this effort's:

1. **Nothing yet limits what shape an agent may give itself.** An agent can schedule itself
   hourly, which issue 10 measured at 72 turns overnight, and the only thing between that and the
   user is the three-Routine cap and a block they may not read. The options the author declined
   included *daily and weekly only for an agent*, and it stays declined — but if this bites, that
   is the smallest fix and it does not need issue 05 reopened again.
2. **A Routine has never fired against a real runtime.** Every scenario here runs under a virtual
   clock on the mock. The seam is `promptFromRoutine`, which both live suites already exercise
   through `promptFromUser`, so the risk is in the *tick*, not in the turn — but nobody has
   watched a real agent wake up at 09:00.
3. **`--screen=<a dialog>` does not work under `--demo`**, which is pre-existing and now costs a
   second screen its review. Either demo mode gets a store behind these screens, or the flags say
   they need the real database.
4. Issue 06's own note: a Routine should be **findable in the navigator** now that the screen
   exists. A small addition, and deliberately not a second home.
