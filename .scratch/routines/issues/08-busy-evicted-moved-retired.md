Type: task
Status: resolved
Blocked by: 02, 03

# Busy, evicted, moved, retired

## Problem

A firing is a moment in the future meeting a world that changed. Every case below has a right
answer that is cheap once decided and a wrong answer that is a support thread, and none of them
are guessable from the others.

## The cases

**The agent is mid-turn.** Already answered, and by existing machinery: the mailbox. A prompt
arriving while an agent is busy is queued and delivered as one prompt when it is next free
(`orchestrator.ts:576`). A Routine firing should use that and add nothing. The only new decision
is whether a firing that is *still* queued when the next firing comes due coalesces (yes: one
instruction repeated is one instruction) or stacks (no).

**The team is not in the pool.** `team-pool.ts` keeps three live, LRU by selection, and never
evicts one mid-turn. A Routine on the fourth team requires starting it, which evicts a team the
user chose to have open. Options: start it anyway (a Routine is a reason, and eviction is
recoverable now that `session/load` exists); raise the limit while a Routine runs (a limit that
moves is not a limit); or skip the firing and record it (safe, and quietly makes Routines work
only on the three teams you happen to be using, which is a bad feature). The lean is **start it,
and let the pool's own rule protect the working team** — the pool already refuses to evict a team
mid-turn, so the user's open work is safe by construction. A Routine's own run then becomes the
thing that pins a slot, which is why issue 03's parking expiry matters here too.

**The Workspace moved or was deleted.** The launch reconcile already repairs a missing directory
and reports a missing branch, and a moved or deleted Workspace already *says so instead of being
called "not a git repository"*. A firing meets that path with nobody to read the message. The
answer: the firing is skipped, the reason is the reconcile's own words, and **a Routine that has
failed this way N times in a row is disarmed** rather than retrying forever against a folder that
is gone.

**The agent was retired, or taken off the roster.** A Routine names one Agent. An Agent removed
from a team is gone with its AgentWorkspace, and its Routines have no recipient. They are not
silently reassigned — blobot never decides who a message is for. They are disarmed and kept,
saying who they used to belong to, the way team deletion *keeps the transcript*.

**The team was deleted.** Cascades. A team's Routines go with its rows, which is the one case
where keeping the record would be keeping a pointer to nothing.

**The branch drifted.** An AgentWorkspace on `blobot/<team>/<agent>` a fortnight after the
Routine was written is not the tree the user had in mind. Nothing to build: the `WORKSPACE` line
already says what the worktree is holding and how far ahead it is. Worth stating in the answer
that this is **the user's problem and visible**, so nobody later invents an auto-rebase.

**The runtime is `not_installed` or needs sign-in.** A launch is already refused by name rather
than surfacing as `spawn opencode ENOENT`. The firing is skipped with that reason, and this is
the case most likely to hit a real user, because a CLI updates itself and logs itself out.

## Resolving this

A table in the `## Answer`: case, what happens, what is recorded. Then the disarm-after-N rule
written once and shared by every case that has one.

## Answer

**Resolved 2026-08-30.** The table, and the one shared rule.

| Case | What happens | Recorded |
| --- | --- | --- |
| No live window | Firing skipped. Issue 02, every platform. | `skipped · blobot was not open` |
| Agent is mid-turn | Delivered to the mailbox, as any prompt is. `orchestrator.ts:576` delivers the batch as one prompt when it is free. | `ran`, when it runs |
| Still queued at the next firing | **Coalesced.** One instruction repeated is one instruction. The second firing is not stacked. | `skipped · the previous run had not started` |
| Team is not in the pool | **Started.** The pool's own rule protects what matters: it never evicts a working team, so the user's open work is safe by construction. | `ran` |
| Workspace moved or deleted | Firing skipped, in the reconcile's own words. | `skipped · <reconcile's message>` |
| Agent retired or off the roster | Routine **disarmed**, kept, saying who it belonged to. Never reassigned: blobot does not decide who a message is for. | `skipped · alice is no longer on this team` |
| Team deleted | Cascades with the team's rows. The only case where the record is not kept, because it would point at nothing. | — |
| Runtime not installed or needs sign-in | Firing skipped, by name, the way a launch is already refused rather than surfacing `spawn opencode ENOENT`. | `skipped · claude is not installed` |
| Branch drifted | Nothing. The `WORKSPACE` line already says what the worktree holds and how far ahead it is. | — |

### The shared rule

**Three consecutive runs ending in anything other than `ran` disarm the Routine**, and the screen
says which reason it was. One rule, written in `bounds.ts` beside the ceilings, referenced by
issues 03 and 04 rather than restated. It covers the permission expiry, the exhausted budget, the
vanished folder and the missing runtime with one sentence, and it is what stops a Routine
retrying nightly against a world that is not coming back.

### Two notes worth keeping

- **Starting an out-of-pool team is safe, and the reason is not obvious.** It reads like a Routine
  evicting a team the user chose. It cannot evict a *working* one, and an idle backgrounded team
  resumes with `session/load` knowing the conversation. The eviction is cheap precisely because
  the pool stopped being a restart.
- **Branch drift is the user's problem and it is visible.** Stated here so that nobody later
  invents an auto-rebase before a Routine run. A Routine does not touch git.

## Amendment, 2026-08-30, from building the tick

Two rows of the table above are amended by what building `routine-runner.ts` found. Nothing else
changes, and the disarm rule is untouched.

### `No live window` records **missed**, not a skipped run

The row said `skipped · blobot was not open`. Built literally — a `routine_runs` row like any
other — three nights of a shut laptop feed the disarm rule and turn the Routine off. That
contradicts issue 02, whose whole answer is that a laptop that was shut is the ordinary condition
of a laptop, and it makes issue 06's `missed 4 firings` a sentence that can never be drawn,
because the Routine would have disarmed at three.

**So the tick does nothing at all without a window.** It settles nothing, and the firings it slept
through are reported as *missed* the moment a window comes back. One code path covers a macOS
process that outlived its last window and a Linux app that was shut, which is exactly the parity
this ticket and issue 02 were after, reached the way issue 02 made sleep indistinguishable from
shutdown. A missed firing writes no run, because no firing happened: blobot neither ran the
Routine nor decided not to. The count lives in `routines.missed_firings`, so it survives the
settling.

### A busy agent is **waited for**, not put in the mailbox

The row said the mailbox already answers this and a firing should add nothing. It cannot, and the
reason is specific: `promptFromRoutine` does not go through the mailbox, and the wake path that
does would run the Routine's turn under the **team's** budget with **no permission expiry** —
losing both of the protections issues 03 and 04 exist for, in precisely the unattended case they
were written for.

So `promptFromRoutine` refuses to start on a busy agent, committing nothing, and the tick holds
the firing and asks again until `ROUTINE_BUSY_CEILING_MS`. Every behaviour this table specified is
unchanged: the firing is not stacked on a live session, it runs when the agent is free, and a
second firing that meets it still coalesces. Only the mechanism is different, and it is different
in order to keep the budget and the expiry that a Routine run must have.
