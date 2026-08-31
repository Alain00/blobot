Type: task
Status: resolved

# A context gauge in the activity column

## Problem

The agent's context fills up, and nothing on screen says so.

An agent whose context is nearly full is the failure the user actually feels: it answers worse,
it costs more per turn, and when it runs out the turn stops. blobot deliberately does not manage
that context — the CLI behind the adapter owns compaction, and that rule is not in question here.
What is in question is that blobot **already receives the gauge and throws it away**.

The data is end to end already:

- `usage_update` arrives from both runtimes and is translated at
  `packages/core/src/adapters/acp/session-updates.ts:116` into `usage_updated` with `used`,
  `size` and an optional `costUsd`. Claude reports `{used: 36785, size: 1000000, cost: {amount:
  0.232279}}`; OpenCode reports `{used: 49300, size: 200000}` once, at the end of a turn.
- `UsageUpdated` is in the vocabulary at `packages/core/src/events.ts:113`, and its own doc
  comment calls it "the context gauge".
- `SqliteRecorder` persists it: it is in the durable subset, and `store.test.ts:383` asserts the
  rows land.
- `AgentStatusTracker` ignores it on purpose (`status.ts:148`) and should keep ignoring it.
  Occupancy is not a status.
- Then the renderer drops it: `apps/desktop/src/renderer/src/model.ts:461`, whose comment reads
  "usage has no gauge yet".

So the only missing piece is the last one, and its absence has already been *cited as present*.
`.scratch/first-demo/build.md:857` keeps `/compact` in the command palette with the argument:
"The context gauge is on screen; withholding the remedy while showing the problem is the worse
trade." The remedy shipped. The problem is invisible. That sentence has to become true or be
corrected, and making it true is this ticket.

## What to do

Draw occupancy, per agent, in the activity column.

**Placement, decided with the author 2026-08-30:** a `CONTEXT` block at the head of the activity
column, above the log and under the same `ACTIVITY` header, one row per agent of the team on
screen — face, name, `used/size`, percent. Not the chrome hairline row: the team pane has several
agents and would have needed this column anyway, so putting the number in two places would have
said it twice on an agent pane and not at all on the team's.

It is therefore hidden when the activity column is hidden, which is correct: the column is
`DESIGN.md`'s log, the user chose to hide it, and nothing here is urgent enough to override that.
An agent that has actually *run out* is ticket 04's problem and lands in the transcript, where it
cannot be hidden.

**What it may say.** Read `DESIGN.md` before writing a string. This is a mono value in a
monochrome column: no colour, no bar that fills with red. Uppercase for the mono label,
lowercase everywhere else, no em dashes. Both numbers and the percent, because `4%` alone hides
that one runtime's window is five times the other's, and a user comparing two agents on one team
is comparing two different windows.

**Three traps the vocabulary already knows about, and one that is new:**

1. **`used: 0` on cancel.** Both research transcripts record it and `events.ts:113` warns about
   it: a cancelled turn ends with a gauge reset that is not real. Suppress the trailing
   `usage_updated` when a turn ends `cancelled`, or the gauge drops to zero every time the user
   stops an agent. `MockAgentRuntime` already reproduces this
   (`mock-agent-runtime.test.ts:205`), so it is testable without a real CLI.
2. **OpenCode reports once, at the end of a turn.** Claude reports during it. So the gauge is
   *stale during a turn* on one runtime and live on the other, and nothing in the UI may claim
   otherwise. Do not animate it, do not call it live, and do not put it in the same visual
   channel as the hairline that sweeps while a turn is in flight.
3. **A team switch or a relaunch must not blank it.** The rows are persisted, so the last known
   usage per agent belongs in `snapshot()` (`apps/desktop/src/main/index.ts`) alongside
   `statuses`, and in the `snapshot` reducer case. An agent that has never reported reads as
   absent, not as `0%`.
4. **Cost is not occupancy.** `costUsd` rides on the same event and is a running total in USD
   from one runtime only. It is not part of this ticket. Decide it separately or leave it
   unrendered, but do not put a dollar figure next to a percentage and let the reader work out
   that only one of them is comparable between two agents.

## Not to do

No threshold, no warning, no nag, and no remedy offered from this block. `/compact` is already
in the palette and that is the whole of the remedy blobot offers. A gauge that starts telling
the user what to do about the number is blobot managing a context it has said it does not
manage.

## Done when

- Typecheck, tests and build pass.
- A model test proves the reducer keeps the last usage per agent, seeds it from a snapshot, and
  does **not** take the `used: 0` that follows a cancel.
- A component test reads the block back for two agents with different window sizes.
- `pnpm demo` and a `--screenshot` of a scenario that reports usage both show a real number.
- `.scratch/first-demo/build.md:857`'s claim that the gauge is on screen is true, and the note
  there says when it became true.

## Answer

Done, 2026-08-30. The gauge is at the head of the activity column, one row per agent, and it
survives a relaunch and a team switch.

**The shape.** `usage_updated` was the only member of the vocabulary the renderer discarded; it
now folds into `AppState.usage`, keyed by agent. The block is `Context` inside `Feed.tsx`, drawn
above the log under its own `CONTEXT` label and a hairline, with the face, the name, `used/size`
and the percent. Both numbers, as the ticket asked: the two runtimes' windows differ by five
times, so `4%` beside `74%` invites a comparison that is not true.

`SqliteStore.lastUsageOfTeam` puts it in `snapshot()` beside `statuses`, so the gauge is drawn
while a team is still opening and after a switch. An agent that has never reported is absent
from the map, not zero.

**The `used: 0` trap is suppressed twice, not once.** The renderer refuses a zero that would
overwrite a reading, and the store skips stored zeros when it reads the last one back, because
the reset a cancelled turn leaves behind is persisted like any other reading. A zero is taken in
exactly one case: an agent that has reported nothing yet, where it is true.

**Nothing here moves and nothing here advises.** No bar, no colour, no threshold, no suggestion
to compact. `/compact` was already in the palette and remains the whole of the remedy.

**Measured on screen**, `--demo` on mock runtimes: `Alice 4k/200k 2%` and `Bob 4k/200k 2%` on the
default run, `Alice 200k/200k 100%` on the new `out-of-room` run, which is the frame ticket 04
needed as well.

**Cost was left unrendered.** `costUsd` rides the same event, only one runtime sends it, and it
is a running total rather than an occupancy. It is carried through `UiUsage` and drawn nowhere.
Deciding it is a product question about billing, which this ticket is not.

**Two notes for whoever is next:**

- `.scratch/first-demo/build.md`'s claim that the gauge was on screen is now true, and dated
  there.
- **The screenshot harness's blank captures are not a flake.** Every capture on this machine
  came back a blank 7.7 KB frame until `--disable-gpu` was added to the electron command line,
  and every capture since has been a real frame on the first try. That flag belongs in the
  review recipe.

## Amendment, 2026-08-30: the gauge still does not advise, but something else may act

Raised by the author, proposing that blobot compact automatically rather than waiting for a user
who has to know to type `/compact` at a moment nothing tells them about. That is a direct
contradiction of this ticket's *Not to do*, which reads "no threshold, no warning, no nag, and no
remedy offered from this block", and of the answer's "nothing here moves and nothing here
advises". Recorded here rather than worked around.

**What is reversed.** Only this: *"`/compact` is already in the palette and that is the whole of
the remedy blobot offers."* It is not, from now on. `10-compaction-by-handoff.md` gives blobot a
threshold of its own and lets it act on one, and the argument that carried this ticket — that a
gauge which tells the user what to do is blobot managing a context it says it does not manage —
does not survive the case where the agent is degrading and the only person who could act is not
looking at the screen.

**What is not reversed, and is now load-bearing rather than merely still true.** The block itself
advises nothing. No warning, no nag, no colour, no remedy offered from the activity column. The
separation is the point: a *fact* is drawn in the log, and an *action* is taken on a surface that
was consented to. Collapsing the two would give the user a gauge that nags and an app that acts,
which is twice the intervention for one decision.

Ticket 09's mark lands in this block and is inside the line: a ceiling is a fact about the model,
drawn next to a fact about the agent, not a suggestion.

**And the compaction is still not blobot's.** The agent writes its own handoff in its own session,
or the runtime's own command runs. blobot chooses the moment and nothing else, which is a
narrower claim than the one this ticket refused and the reason the second permanent rule holds.

## Amendment, 2026-08-30: the head of the column is pinned

Raised by the author, from the layout rather than from a measurement: the activity column *"is
also very big"*. It is, and the reason is this block plus `WORKSPACE` — both one row per agent,
both inside the column's single `overflow:auto` container, and both above the log. Three
consequences, none of which are performance (the log is capped at 200 entries in both directions,
`model.ts:1026` and `:1031`, and always was):

- On a four-agent team the log begins below the fold, before a single tool call has landed.
- Expanding a row's `sent` panel adds five to nine more rows and pushes it further.
- Scrolling the log scrolled **the gauge** away — the one figure on this column that a person
  watches *while* reading what the agents are doing, which is the whole reason this ticket drew
  it at the head rather than at the foot.

`.feedtop` wraps the `ACTIVITY` label, `CONTEXT` and `WORKSPACE`, `position:sticky` at `top:0`,
and the log scrolls under it. It carries `max-height:min(60%,420px)` and scrolls inside itself
past that, because a large roster with a panel open would otherwise pin the whole column.

**The rule it appears to break, and why it does not.** DESIGN.md rejects a pinned group in the
rail on the grounds that *nothing in this column covers anything else in it*. That rejection is
about **peers in one list**: a team stuck to the scrollport's edge floats over the teams above and
below it, and the overlap reads as rank. This head is not a peer of the log — it is two labelled
blocks that were already above it with a rule between — and it draws as chrome rather than as a
card: opaque on `--recessed`, no radius, no shadow, no translucency. The note is in DESIGN.md
beside the `CONTEXT` paragraph, stating the distinction rather than leaving the two to be read as
a contradiction.

**Nothing here advises**, which is what the amendment above makes load-bearing. Pinning changes
where the block is, not what it says: no warning, no colour, no threshold, no remedy.

**Not verified on screen.** `--screenshot` renders a blank frame on this machine right now, for
the baseline as much as for the change — checked by stashing both files, rebuilding and capturing
again, which came back equally black. So the structure is pinned by a test instead
(`Feed.test.tsx`, *the head of the column*): both blocks inside the wrapper, every log line
outside it. jsdom performs no layout, so `position:sticky` itself is not testable there and the
sticky behaviour is the one claim still resting on reading the stylesheet.
