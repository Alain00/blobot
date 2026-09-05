Label: wayfinder:map

# Live steps: what a turn looks like while it is still a turn

## Destination

A locked set of decisions for the **part of the transcript that has not finished becoming a
record**: how many steps can be in flight at once, whose they are, where they sit relative to the
agent's face and to the fold above them, what moves when one arrives and when one leaves, and
which of the two in-flight devices currently on screen stands down.

The map is done when nothing is left to *decide* before someone writes that code. It plans; it
does not build.

Raised by the author, 2026-09-05, reviewing `--demo-scenario=many-steps` after the scenario was
lengthened to twenty-two calls: *"I see the agent thinking loader (three dots) and I see the
current step (also with a loader running) isn't that redundant?"*, then *"in the demo I only see
one step at the time cuz there is no concurrency in the steps, but when multiple bots messaging,
there will be concurrency, I want to see that"*, then an order for the block:

```
[steps folded]
[blobatar]
[outgoing transitioning step (displaced by finished or capacity)]
[current step 2]
[current step 3]
[incoming transitioning step]
```

## What this actually is

Three observations that look like one request and are not.

**The redundancy is real and is one line of code.** During a running tool the transcript draws
`.tool now` with three dots at the end of it, and forty pixels below it draws the pending bubble,
which is a live blobatar and three more dots. The same glyph, the same keyframes, twice, forty
pixels apart. `isPending` excludes `responding` — the state where a live message is already
streaming — and does not exclude a running call, which is the same argument unapplied.
`DESIGN.md` has ruled on this shape twice already, in its own words: *WORKING beside three dots
that are already saying so is the same claim twice*, and *an icon beside the word it denotes is
the same claim twice in the narrowest place in the app*. Ticket 01.

**The missing concurrency is the mock, not the renderer.** `MockAgentRuntime` plays
`for (const step of scenario.steps)` and awaits each one, so no scenario can ever have two calls
in flight; the demo is structurally incapable of the thing the author wants to look at. The
renderer is not: items are keyed by `toolCallId`, there is no "current tool" anywhere in the
model, and N running calls would draw as N `.tool now` rows today. This is ticket 08's argument
arriving somewhere new — a kind mock produces a UI that shatters on first contact — except here
the mock is not kind, it is *serial*, which is a shape a real runtime does not have. Ticket 02.

**The layout is not about density, it is about attribution.** The author's stated reason for the
order is concurrency, and the strongest case for it is one they did not make: in the team pane
two agents run at once *today*, and their running steps land in one shared column with no face on
any of them. Two agents' `.tool now` rows interleaved anonymously is a transcript that cannot be
read. Putting the blobatar above its own live steps makes each running agent one attributed
block, which is the only version of this that survives concurrency. Tickets 03 to 05.

## The rules this touches

`DESIGN.md`, Motion, both budgets, and the arrive/shut entry in particular — a call **arrives**
(8px, `.97`, dim frame, 4px blur, 200ms) only while `running`, and **shuts** (`1fr` to `0fr`,
260ms) as the fold takes it, **capped at two in the air**, in flow and never out of it. Most of
what the author's order asks for is therefore already built and already argued. What is new is
the blobatar's position, a second kind of exit, and how many steps may be on screen at once.

Binding, per `CLAUDE.md`. Contradicting any of it is a reopen and a note in the relevant
`build.md`, not a quiet edit.

## Notes

**Domain.** See `CLAUDE.md` for the permanent architectural rules and `CONTEXT.md` for the
glossary. `DESIGN.md` is binding for anything a user perceives.

**Where the code is.** `apps/desktop/src/renderer/src/model.ts` (`isPending`, `rowsOf`,
`itemsFor`, the `tool` item), `components/Conversation.tsx` (the pending bubble at the foot of
the rows, `ToolLine`), `styles.css` (`.tool.now`, `.inflight`, `.dots`), and
`packages/core/src/mock/scenario.ts` plus `mock/mock-agent-runtime.ts` for the serial player.

**What is already true and needs no ticket.** The model holds N concurrent running calls. The
arrive and shut transitions exist. The team pane already draws one pending bubble per running
agent. The fold already counts and names what it swallowed.

**Reached, 2026-09-05.** All five tickets are resolved, the frontier is empty, and the code is
built. Do not run `/wayfinder` on this map: there is no next ticket. Decisions are binding; if one
is wrong, reopen its ticket and say so on it rather than quietly contradicting it. What was
decided *while* building, and what is left over, is on `build.md`.

## Decisions so far

- **01 — the dots stand down, the face stays.** `isPending` is now only asked about the case
  where there is nothing else to see: `starting` or `thinking` with no call open. Under a running
  call the line's own three dots are the only in-flight device. The face was never the duplicate.
  *And 01 could not land alone* — both narrow versions of it are worse than what they replace,
  which is why this session took 03 with it.
- **02 — `.parallel([...])` and `tool(...)`.** The player forks with `Promise.all`, every call is
  open before any of them sleeps, and `works-through-a-list` carries two batches whose durations
  disagree with their order on purpose. Completion order is not call order, and no serial
  scenario could ever have said so.
- **03 — the live tail, one block per agent.** `liveTailOf` splits the rows; the tail is bounded
  by `isInFlight` rather than by whether a call returned, so a batch stays together and a lone
  finished call does not hold a face over it forever. The swallow is hoisted, because it diffs a
  list the tail had emptied. Verified in the team pane: Bob's running call under Bob's own face.
- **04 — no cap, and no overflow line.** The author's, and it settles the hole: a step leaves the
  block for exactly one reason, it finished. `DESIGN.md`'s two-in-the-air is a cap on motion and
  is untouched.
- **05 — one face, by construction.** `responding` is out of `isInFlight`, so a block and a live
  message are never mounted together. The real two-faces case was a *settled* caption above the
  block, and `continuesAgent` groups the first block under it.

## Fog

- Whether the activity column should show concurrency at all, or stays a flat chronological feed.
  Out of scope until the transcript's answer is settled.
- Whether a step should ever say how long it has been running. Nobody has asked; a duration on a
  live line is a second moving thing.
