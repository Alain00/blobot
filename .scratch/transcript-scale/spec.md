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

## Issues

- `01-memoize-the-transcript-item.md` — **resolved 2026-08-29**. Streaming was O(history) per
  delta: 401 markdown renders a token into a 400-message transcript, now 1. The measured
  residue at 400 is the parent's own map, which is what 03 is for.
- `02-bound-the-snapshot-query.md` — the unbounded query is what puts an unbounded transcript
  in front of the renderer at all.
- `03-virtualize-the-conversation.md` — the real fix, and the expensive one. Deliberately last.
- `04-max-tokens-is-a-visible-ending.md` — smaller, adjacent, and not about scale in the DOM.
