# Transcript scale

The conversation pane renders every message it has ever been given, into real DOM, with no
windowing and no memoization, from a snapshot query that has no `LIMIT`. That is the right
shape for a demo team that has said forty things. It is the wrong shape for a team that has
been running for a week, and every part of it degrades at once.

Found by reading the code on 2026-08-29, not by hitting a wall in the app. Nothing here is
broken today; all three are load-bearing before a team's history is allowed to grow.

## What is actually there

- `apps/desktop/src/renderer/src/components/Conversation.tsx:83` is a plain scroll container
  with `items.map(...)` inside it. The only scroll machinery is `useStickToBottom`
  (`Conversation.tsx:259`), which watches the column's height with a `ResizeObserver` and pins
  to the bottom when the reader is within 40px of it.
- `SqliteStore.forTeam` (`packages/core/src/store/sqlite-store.ts:290`) and `answersOfTeam`
  (`:307`) both `.all()`, unbounded and uncursored. `snapshot()`
  (`apps/desktop/src/main/index.ts:188`) sends the result over IPC at launch and on every team
  switch, and `model.ts:139` merge-sorts it into `items`.
- Every item renders markdown through `Streamdown` (`Markdown.tsx`), which parses and lays
  out per node.
- `ItemView` is not memoized, and `applyEvent` builds a fresh `items` array on every delta
  (`model.ts:196`). Streaming one token therefore re-renders and re-parses the whole
  transcript.

The feed is the one bounded thing: `model.ts:329` keeps 200 entries. The conversation has no
equivalent.

## Not in scope

The agent's own LLM context. `turnBudget` (`orchestrator.ts:341`) bounds turns per user
prompt, which is a cost guard against ping-pong, not a token guard, and blobot deliberately
does not compact or truncate what an agent carries: the CLI behind the adapter owns that, per
the rule that provider quirks live in the adapter. The one thing that must stay true is that a
context-exhausted turn ends *visibly* — `max_tokens` is already translated through rather than
swallowed (`adapters/claude/translate.ts:139`). See `04-max-tokens-is-a-visible-ending.md` for
the part of that which is ours.

### Amendment, 2026-08-30: managing it is out of scope, watching it is not

Raised by the author, who asked what stops a session growing until the agent hallucinates and
costs more. Everything above stands — blobot does not compact and does not truncate. What the
paragraph above got wrong is the implication that the agent's context is therefore *nothing to
do with us*. Two things about it are ours, and neither manages anything:

- **Occupancy is observable and is already being received.** `usage_update` reaches the
  vocabulary as `usage_updated` (`events.ts:113`, "the context gauge") and is persisted, and the
  renderer drops it at `model.ts:461` with the comment "usage has no gauge yet". That is
  `05-a-context-gauge-in-the-activity-column.md`. It is also load-bearing for a decision that has
  already shipped: `.scratch/first-demo/build.md:857` keeps `/compact` in the palette on the
  argument that "the context gauge is on screen", which is not true yet.
- **The ending has to be visible**, which is what `04` already said. Promoted out of triage by
  the same conversation, because a turn that stops for want of room and renders as a turn that
  finished is the exact shape of "the agent got dumb and I could not tell why".

The remedy stays one thing and stays the user's: `/compact` is offered in the composer's palette,
nothing fires it automatically, and nothing on the gauge suggests it.

## Issues

- `01-memoize-the-transcript-item.md` — **resolved 2026-08-29**. Streaming was O(history) per
  delta: 401 markdown renders a token into a 400-message transcript, now 1. The measured
  residue at 400 is the parent's own map, which is what 03 is for.
- `02-bound-the-snapshot-query.md` — the unbounded query is what puts an unbounded transcript
  in front of the renderer at all.
- `03-virtualize-the-conversation.md` — the real fix, and the expensive one. Deliberately last.
- `04-max-tokens-is-a-visible-ending.md` — **resolved 2026-08-30**. The ending was visible and
  said `turn stopped · max tokens`, which names a mechanism. It now names a consequence, for the
  three endings that arrive down that path, and offers no remedy.
- `05-a-context-gauge-in-the-activity-column.md` — **resolved 2026-08-30**. The agent's context,
  drawn and not managed. Independent of 01 to 03: it touches the activity column, not the
  transcript.
- `08-the-mcp-surface-nobody-counted.md` — **open, needs triage**. The question 07 leads to:
  blobot's own tool is 956 characters, and the servers an agent inherits are unmeasured,
  unfiltered and potentially larger than the window. ADR-0003 territory, not this effort's to
  decide.
- `07-bound-what-blobot-injects.md` — **resolved 2026-08-30**. The other half of 05: the
  permanent "always compact context" rule was unenforced, and is now a refusal at the tool
  boundary plus a bounded wake batch, with the breakdown under the gauge.
- `06-the-activity-column-does-not-survive-a-switch.md` — **resolved 2026-08-30**. Found while
  building 05, by the author switching teams. The column and the `turn stopped` line were both
  live-only, so a snapshot wiped what the database was already holding.
