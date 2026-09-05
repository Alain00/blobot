Type: task
Status: resolved

# The mock cannot run two calls at once, so the demo cannot show concurrency

## Problem

The author, looking at `many-steps`: *"I think in the demo I only see one step at the time cuz
there is no concurrency in the steps."*

Exactly right, and the cause is not the renderer.

`MockAgentRuntime` plays a scenario as:

```ts
for (const step of scenario.steps) {
  …
  case 'tool': await this.#runTool(queue, step.tool, abort.signal);
}
```

Serial by construction. No scenario in `mock/scenarios/` can put two calls in flight, and none
ever will while the player is a `for…await`.

The renderer has no such limit. `Item` holds tools keyed by `toolCallId`, there is no "current
tool" anywhere in `model.ts`, and two `tool_call` events with different ids would produce two
`.tool now` rows today, both with their own dots, both arriving with the arrive transition.

So this is a **mock gap wearing a UI gap's clothes**, and it is ticket 08's argument in a new
place. The usual failure is a mock that is too kind. This one is too *tidy*: it has a shape real
runtimes do not have, and every review of the live transcript so far has been conducted against
that shape.

Real parallelism is not hypothetical. Claude batches tool calls and the ACP stream carries them
as interleaved `session/update`s with distinct ids; the same is true of every runtime that
batches. A turn that reads four files at once is the ordinary case, not the exotic one.

## Two concurrencies, and they are not the same feature

- **Within one agent's turn.** Parallel calls in one batch. This is what the mock cannot produce
  and what this ticket is about.
- **Across agents.** Two agents running at once in the team pane. This *already happens* and
  already draws two pending bubbles — but the running step lines land in one shared column with
  no face on them, so whose call is whose is not recoverable. That is ticket 03's problem, not
  this one's, and it is the stronger argument for the layout.

## What to decide

The builder shape. Two candidates:

- `.callTool(...)` gains an option that starts it without awaiting it, and a later step joins.
  Cheap, and makes the interleaving explicit and readable in the scenario file.
- A `.parallel([...])` step that takes a list of `ToolStep`s and plays them concurrently with
  their own `durationMs`, which is what a batch actually is.

The second reads better and matches the wire shape. Whichever wins, the durations have to differ,
because the case that matters is calls **finishing out of order** — a fold that assumes tool
completion order is call order would pass every existing test.

## Done when

A checked-in scenario runs at least three calls concurrently, they finish out of order, and it is
what `many-steps` (or a sibling) plays, so the layout in tickets 03 to 05 is reviewed against a
real interleaving rather than against a queue.

## Answer

**`.parallel([...])`, taking a list of `ToolStep`s**, with `tool(title, kind, options)` exported
beside `scenario()` as the way to build one. The second candidate won for the reason the ticket
gave: it matches the wire shape, and a batch reads as a batch in the scenario file rather than as
a start and a join a reader has to pair up.

The player forks with `Promise.all` over `#runTool`. Every call emits its `tool_call_started` and
its `in_progress` before its first await, so all of them are open before any of them sleeps —
which is what a real batch looks like on the wire — and then each returns on its own
`durationMs`. Cancellation is unchanged: any member reporting a cancel ends the turn.

`works-through-a-list` carries two batches now. The opening three reads have durations that
**disagree with their order** (380, 140, 260), so they return `Desk`, `objects`, `ls` — the trap
the ticket named, and one no serial scenario in this repo could ever have sprung. The second is
two writes rather than reads, because a turn's parallelism is not a reading-only phenomenon.

`packages/core/src/mock/parallel.test.ts` asserts all three properties: every call open before
the first terminal update, completion order not equal to call order, and one member failing
without ending the turn.

**What it found immediately.** With three calls open, three `.tool.now` arrive animations fire in
the same frame. That is one visual event — the batch appeared — rather than the three competing
ones `DESIGN.md` caps the *swallow* at two for, so it is left alone. Worth a second look on a
slower machine.
