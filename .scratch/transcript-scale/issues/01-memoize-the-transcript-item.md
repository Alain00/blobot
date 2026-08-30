Type: task
Status: resolved

# Memoize the transcript item

## Problem

Streaming one token re-renders and re-parses the entire conversation.

`applyEvent` returns a new `items` array on every `agent_message_delta`
(`apps/desktop/src/renderer/src/model.ts:196`), which is correct — the reducer is immutable and
should stay that way. But `Conversation.tsx:85` maps that array into `ItemView`, and `ItemView`
is a plain function component. A new array means every child re-renders, and every child
mounts a `Streamdown` that parses markdown and lays it out.

So the per-delta cost is proportional to the length of the history, not to the message being
written. A long answer into a long transcript is the worst case, and it is also the normal
case for a team that has been working a while.

## What to do

Wrap `ItemView` in `React.memo`. The items are already immutable values with stable `id`s, so
reference equality on the item is the right comparison and the default comparator should be
enough — but check the other props: `byId` is rebuilt every render (`Conversation.tsx:32`) and
`statuses` is replaced on every status action, so both will defeat the memo unless they are
stabilized or narrowed.

Narrowing is better than stabilizing. An `ItemView` needs the speaker, not the roster, and it
needs that speaker's status only for the pending row — which is rendered separately anyway
(`Conversation.tsx:105`). Pass what the item actually draws with, and the memo holds without
anyone having to remember to `useMemo` a map.

The `live` flag on the streaming item keeps changing, which is fine: that is the one item that
*should* re-render.

## Done when

- Typecheck, tests and build pass.
- A `model.test.ts`-level test is not the right instrument here; verify by measurement instead.
  Run `--demo` with a scenario that streams into a seeded transcript and confirm the work per
  delta no longer grows with history. `--screenshot` is not enough — this is a performance
  claim, so measure it, and record the numbers in the answer.
- No behaviour change. Grouping (`continuesSpeaker`), the time rules and the stick-to-bottom
  all still work, including when an expanded peer message grows the column.

## Answer

Done, 2026-08-29. `ItemView` is `React.memo`'d and its props are narrowed to plain values, so a
streamed token costs the message being written and nothing else.

**The measurement.** The instrument is how many times `Markdown` renders while one agent writes
one message, counted in jsdom with `Markdown` mocked to a bare element, so the number is renders
rather than layout and is therefore exact. It lives at
`apps/desktop/src/renderer/src/components/Conversation.test.tsx`.

| history behind the stream | markdown renders per token, before | after |
| --- | --- | --- |
| 20 messages | 21 | 1 |
| 400 messages | 401 | 1 |

Wall clock with the real `Streamdown`, same harness, ten tokens each, two runs agreeing to a
tenth of a millisecond:

| history | ms per token, before | after |
| --- | --- | --- |
| 20 messages | 5.0 | 2.3 |
| 400 messages | 24.1 | 10.2 |

The count is flat and the clock is not, which is the honest shape of this fix. What is left at
400 is the *parent*: `Conversation` still maps every item, resolves its cast and hands React 400
elements to compare, and comparing them is cheap but not free. That residue is exactly what
ticket 03 removes, and these numbers are the argument for how urgent 03 is: 24 ms a token was
under 42 fps for a stream, 10 ms is not, and the demo-sized case is 2.3.

**Narrowing, not stabilizing**, as the ticket asked. `byId` and `statuses` no longer cross into
an item at all. `castOf(item, pane, byId, statuses)` resolves what the item actually draws —
`fromName`, `fromHue`, `toName`, `toHue`, `role`, `received`, `status` — into a flat object that
is spread into the props, because `React.memo`'s default comparator is shallow: a fresh object
each render is fine as long as every value in it is a primitive. Nobody upstream has to remember
a `useMemo`.

Two things the ticket did not name:

- **`onAnswerPermission` was written inline in `App.tsx`**, so it was a new function every render
  and would have defeated the memo for the whole transcript on its own. It is stabilized inside
  the pane (`useLatest`), rather than by asking `App` for a `useCallback`, so the memo is a
  property of this component instead of an obligation on whoever renders it next.
- **A settled message's blobatar no longer carries live status.** It is passed only while
  `item.live`, which is the one message actually being written. This is the ticket's "it needs
  that speaker's status only for the pending row", and it is a small visible change: twenty of
  Alice's old messages used to bob in unison the moment Alice started working. `DESIGN.md`
  spends the team mark's single animation to avoid exactly that fidget. Status is not lost
  anywhere: the header, the status word, the rail row and the pending dots all still carry it.

**Behaviour is covered rather than asserted to be unchanged.** Rewriting six voices to read from
narrowed props is a rewrite of all six, so six tests in the same file render each one and read
the column back: the `to Bob` tag in the team pane only, a turn labelled once with the
continuation grouped, a peer message that reads as mail in the pane that received it and as a
copy elsewhere, the permission block asking and answered, an attributed system line, and the
pending dots. The `--demo` transcript was also read on screen.

**jsdom** is a new root devDependency, which is what makes any of this measurable: rendering with
`react-dom/client` is the only way to observe a memo, since `react-dom/server` re-renders
everything by definition. It is at the root rather than in `apps/desktop` because two other
sessions were editing that package's manifest at the time.

Two notes for whoever is next:

- The screenshot harness blanked three times running before rendering, at `--screenshot-at=6000`;
  a longer delay got a real frame on the fourth try. That is `build.md`'s known one-in-three
  capture flake, and it is worse than one in three today.
- `Blob`'s `status` is now `AgentStatus | undefined` under `exactOptionalPropertyTypes`, the same
  treatment `hue` already had, and absent means `b-still`.
