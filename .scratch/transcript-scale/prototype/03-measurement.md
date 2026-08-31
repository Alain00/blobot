# Ticket 03's prototype: what the transcript actually costs

Run 2026-08-30, against the pane as it stands after tickets 01 and 02. Throwaway instruments,
written, read and deleted; the numbers and the reasoning are the artifact.

## The instruments, and what they could not see

Two probes, both under `jsdom`, mounting the real `Conversation` with the real `Markdown`:

1. **A DOM probe** — mount a transcript of N items, count the nodes, time the mount, then push
   one delta into a live message at the bottom and time the re-render.
2. **A derivation probe** — no DOM at all, timing `rowsOf`, `itemsFor` and the reducer on the
   same N, to separate the work above React from the work inside it.

**jsdom is the limitation and it is a large one.** It performs no layout and no paint, and its
DOM is JavaScript objects rather than native ones, so absolute timings for anything that touches
the document are wrong by an unknown factor — and wrong in the direction that makes this look
worse than it is. What jsdom does report faithfully is **node count** and the **shape** of the
curve. Read the numbers that way. A real-browser instrument would have meant a probe flag on the
app, which is more machinery than a throwaway prototype should leave behind.

## What came back

```
items=  200  nodes=  3755  mount=  384ms  delta=  34.8ms
items=  400  nodes=  7506  mount=  484ms  delta=  19.5ms
items= 1000  nodes= 18756  mount=  931ms  delta= 117.7ms
items= 2000  nodes= 37507  mount= 1810ms  delta= 166.7ms
items= 5000  nodes= 93759  mount= 4569ms  delta= 263.3ms
```

```
rowsOf(200)               0.020ms     rowsOf(1000)    0.038ms     rowsOf(5000)    0.230ms
itemsFor(200, team)       0.007ms     itemsFor(1000)  0.014ms     itemsFor(5000)  0.092ms
reduce(delta) over 200    0.003ms     reduce(1000)    0.004ms     reduce(5000)    0.021ms
```

## What that says

**The derivation is not the problem, and it is not close.** Everything above React — the reducer
building a fresh `items` array, `itemsFor` filtering it for the pane, `rowsOf` folding runs of
settled work — costs **0.35ms at five thousand items, all three together**. That is a third of a
frame for a transcript nobody will ever accumulate by accident. Nothing here needs an incremental
data structure, and a plan that starts by memoizing `rowsOf` would be optimising the cheap half.

**Roughly nineteen DOM nodes per transcript item**, dead flat across the range: 3,755 at 200 and
93,759 at 5,000. This is the real number in the table, because it is the one jsdom reports
honestly, and it is what a windowed list would actually reduce.

**The per-delta cost is linear in transcript length, and the constant is the open question.**
Ticket 01 fixed the expensive half — one markdown parse per token instead of N — and the residue
it recorded is exactly what shows here: React still walks the list and calls a memo comparator
per row, and jsdom still diffs a document of ninety thousand objects. In a real browser both are
far cheaper than these numbers, but neither is free, and both grow with N.

## The four questions the ticket asked, answered without building it

Answered against the design rather than against a prototype, because the measurement above says
the prototype is not the next thing to build. Each of these is a reason virtualization is
expensive here, not a reason it is impossible.

- **Stick-to-bottom during a stream.** `useStickToBottom` watches the *column's* height with a
  `ResizeObserver`, and its comment is the whole argument: the column grows for reasons the item
  list cannot predict — markdown lays out a frame after it is handed its text, a code block is
  highlighted later still, a fold opens by hundreds of pixels on a click. A windowed list has to
  reproduce that while *not having the offscreen rows to measure*, so the observer's input
  becomes an estimate for everything above the viewport. This is the hard one, and it is the one
  that regresses quietly: the failure mode is a long answer streaming off the bottom of the
  screen and staying there, which is precisely the bug that observer exists to have fixed.
- **The scrollbar while rows are unmeasured.** It lies until things settle, by construction.
  Tolerable in a list of uniform rows; this list has a one-line tool call and a forty-line code
  block in it, so the estimate is wrong by an order of magnitude per row and the thumb jumps as
  the reader scrolls. Explainable, not good.
- **Selection across a scroll boundary.** Selecting a passage that spans more than one screen is
  a thing people do to a transcript — it is how you quote an agent to a colleague. Unmounting the
  top of a live selection destroys it. There is no cheap fix: the browser owns the selection and
  it cannot survive its anchor being removed from the document.
- **Find-in-page.** Same mechanism, same answer: Chromium searches the document, and a windowed
  list has most of the document unmounted. Electron's `findInPage` cannot see rows that are not
  there.

Two of those four are **capability losses** rather than performance trades, and they are
capabilities of a transcript specifically. That matters for the recommendation.

## Recommendation: defer, and the ticket says this is a legitimate outcome

**Defer.** Not "not worth doing" — *not the next thing*, on three grounds:

1. **The steady state is 200 items.** Ticket 02 windows the snapshot, so the pane a user opens
   holds `TRANSCRIPT_WINDOW` items and 3,755 nodes whatever the team's history is. That is the
   state the app is in essentially all of the time, and virtualization would change nothing about
   it.
2. **Reaching a bad state takes deliberate, repeated action.** 5,000 items is twenty-four clicks
   of *load earlier*, one at a time, by a reader who has decided to page back through a week.
   That reader is not streaming a turn at the same time, so the linear per-delta cost — the thing
   that would actually be felt — is not being paid while they do it.
3. **The costs are qualitative and land on exactly this surface.** Losing find-in-page and
   cross-screen selection in a *transcript* is a worse trade than in a log viewer or a feed. A
   reader who has paged back through a week is doing so to find something, which is the one task
   the two lost capabilities exist for.

## The cheaper fix, if this is ever reopened

The unbounded thing is not the window — it is the **accumulation**. `case 'earlier'` in
`model.ts` prepends and dedupes and caps nothing, so `items` grows without limit for as long as a
reader keeps clicking. The feed has had a ceiling of 200 since it was written; the transcript has
none.

So the first move against a real complaint is a **ceiling on `items`**, dropping from the bottom
as pages arrive at the top, with the same *load later* control mirrored downward. It is a small
diff in one reducer case, it preserves find-in-page and selection over everything mounted, and it
bounds nodes at a number chosen rather than discovered. It should be tried before a windowed
list, and it makes the windowed list unnecessary unless somebody wants a genuinely unbroken
five-thousand-item scroll — which is a feature request nobody has made.

## What would reopen this

A real one, not a number in a table: a user reporting that the pane is slow, on a transcript they
can describe, with *load earlier* in the story. Failing that, an agent's own pane crossing a
thousand items in ordinary use without anybody paging — which would mean `TRANSCRIPT_WINDOW` or
the reducer's accumulation had changed, and would be the diff to look at rather than this ticket.
