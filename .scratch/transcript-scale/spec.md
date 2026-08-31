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

### Amendment, 2026-08-30: blobot may choose the moment

Raised by the author, proposing automatic compaction after reading TanStack's compaction
middleware. The paragraph above says the remedy "stays one thing and stays the user's", and
"nothing fires it automatically". That is reversed, narrowly, by `10-compaction-by-handoff.md`.

**What still stands.** blobot does not compact. It provides no inference, it writes no summary of
its own, and it never rewrites an agent's history — which it could not do in any case, because
`session/prompt` carries a session id and this turn's blocks and nothing else, so the transcript
we would rewrite is inside the CLI and was never ours. TanStack's middleware shape is therefore
unavailable to us on the merits, not merely declined.

**What changes.** blobot may choose the *moment*: fire the runtime's own compaction against a
threshold, and where that is unavailable or insufficient, have the agent write a handoff and
resume in a fresh session. The boundary is one blobot already owns, and the reason it is survivable
here is that an agent's real state is a git worktree rather than a conversation.

**What the threshold is measured against is its own problem**, because the advertised window is the
wrong denominator for it and for the gauge alike. That is `09-a-working-ceiling-per-model.md`.

## Issues

- `01-memoize-the-transcript-item.md` — **resolved 2026-08-29**. Streaming was O(history) per
  delta: 401 markdown renders a token into a 400-message transcript, now 1. The measured
  residue at 400 is the parent's own map, which is what 03 is for.
- `02-bound-the-snapshot-query.md` — **resolved 2026-08-30**. `transcriptOfTeam` windows both
  halves against one time cutoff, so no answer arrives without its question, and `load earlier`
  pages upward holding the reader's distance from the bottom rather than their scroll position.
- `03-virtualize-the-conversation.md` — **deferred 2026-08-30**, measured first. The derivation
  costs 0.35ms at five thousand items and is not the problem; the cost is about nineteen DOM
  nodes per item, and 02's window means the steady state is two hundred of them. Two of the four
  questions turned out to be capability losses rather than performance trades — find-in-page and
  cross-screen selection both die when rows unmount. The real unbounded thing is the
  *accumulation* in `case 'earlier'`, which caps nothing, and a ceiling there is the cheaper move
  if anybody ever complains. `prototype/03-measurement.md`.
- `04-max-tokens-is-a-visible-ending.md` — **resolved 2026-08-30**. The ending was visible and
  said `turn stopped · max tokens`, which names a mechanism. It now names a consequence, for the
  three endings that arrive down that path, and offers no remedy.
- `05-a-context-gauge-in-the-activity-column.md` — **resolved 2026-08-30**. The agent's context,
  drawn and not managed. Independent of 01 to 03: it touches the activity column, not the
  transcript.
- `08-the-mcp-surface-nobody-counted.md` — **answered 2026-08-30, awaiting the author's
  decision**. Measured against real agents: 198 inherited tools in an empty directory, of which
  **90 come from a plugin and a connector that `settingSources` cannot reach**; `strictMcpConfig`
  works through blobot's own adapter and leaves `mcp__blobot__message_agent` standing alone; and
  `OPENCODE_CONFIG_CONTENT` **merges**, so both adapters inherit. Nothing was changed. The
  decision is ADR-0003's, and `prototype/08-mcp-surface.md` states what each option costs without
  recommending one.
- `07-bound-what-blobot-injects.md` — **resolved 2026-08-30**. The other half of 05: the
  permanent "always compact context" rule was unenforced, and is now a refusal at the tool
  boundary plus a bounded wake batch, with the breakdown under the gauge.
- `06-the-activity-column-does-not-survive-a-switch.md` — **resolved 2026-08-30**. Found while
  building 05, by the author switching teams. The column and the `turn stopped` line were both
  live-only, so a snapshot wiped what the database was already holding.
- `09-a-working-ceiling-per-model.md` — **resolved 2026-08-30**. The gauge divided by the
  advertised window, so Opus 5 at 36k of a usable 300k drew 3%. The lookup is the adapter's and
  the arithmetic is core's, so the pane draws a ceiling without learning a provider; the fallback
  is capped, because a bare fraction of a million window fails open.
- `10-compaction-by-handoff.md` — **resolved 2026-08-30**. Compaction blobot can actually do: a
  handoff and a fresh session, always. It shipped with the runtime's own command tried first and
  the author reversed that the same day, from a live run — it loses too much. Occupancy triggered
  and never time triggered, because cache expiry is what compaction *causes*, not what it saves.
  Per agent and on by default; the handoff opens inline in the transcript. **Run live against a
  real `claude`, 2026-08-30**, which was the one piece left: `orchestrator/live-compaction.test.ts`
  injects a small `contextCeilings` entry rather than editing the trigger, and a real agent writes
  a 1,473-character first-person handoff that a fresh session picks the work up from. The ticket
  keeps the specimen.
