Type: prototype
Status: deferred
Blocked by: 01, 02

# Virtualize the conversation

## Problem

Every message in the pane is a real DOM node (`Conversation.tsx:83`), each one carrying a
parsed markdown tree. Tickets 01 and 02 bound the *work per delta* and the *rows fetched*;
neither bounds the nodes on screen. A reader who loads earlier enough times still ends up with
the whole history mounted.

## Why this is a prototype and not a task

Virtualization fights the two things the pane already does well, and it is not obvious the
trade is worth making.

`useStickToBottom` (`Conversation.tsx:259`) works by watching the *column's* height with a
`ResizeObserver`, and the comment on it is worth reading before touching any of this: the
column grows for reasons the item list cannot predict. Markdown lays out a frame after it is
handed the text, a code block is highlighted later still, and an expanded peer message grows by
hundreds of pixels on a click. Keying on the items missed all three, and a long answer would
stream off the bottom of the screen and stay there. A windowed list has to reproduce that
correctly while also not having the offscreen items to measure.

Which is the second problem: variable-height markdown means row heights are unknowable until
render. That is measured-row virtualization, with a cache, an estimate for unmeasured rows, and
a scrollbar that lies until things settle. It is a real piece of work, and the kind that
regresses quietly.

## What to answer

Prototype it and find out:

- Whether a windowed list can keep stick-to-bottom exact during a stream, including the
  late-layout cases above.
- What the scrollbar does while unmeasured rows are estimated, and whether that is tolerable
  or merely explainable.
- Whether text selection across a scroll boundary survives. Selecting a passage that spans more
  than one screen is a thing people do to a transcript, and unmounting the top of the selection
  is a bad answer.
- Find-in-page, for the same reason.
- Whether 01 and 02 together already put this far enough away to defer. That is a legitimate
  outcome and should be recorded as one rather than treated as failure.

Rough and throwaway. React to it, do not polish it.

## Not to do

Do not reach for a library before establishing that the hand-rolled version is the problem. The
list is one column of items with a stable id, which is the case a general-purpose virtualizer
is most over-built for.

## Answer

**Deferred, 2026-08-30**, which this ticket named in advance as a legitimate outcome and not as a
failure. The measurement is `.scratch/transcript-scale/prototype/03-measurement.md`; the
instruments were throwaway and are gone.

**The derivation is not the problem, by a factor nobody needs to argue about.** The reducer,
`itemsFor` and `rowsOf` together cost **0.35ms at five thousand items**. Anything that starts by
memoizing the row fold would be optimising the cheap half.

**What the pane actually costs is nodes: about nineteen per item, flat.** 3,755 at two hundred,
93,759 at five thousand. That is the number a windowed list would reduce and the only number in
the table jsdom reports honestly — it does no layout and no paint, so its timings are wrong in
the direction that flatters this decision, and the write-up says so rather than leaning on them.

**Three reasons to defer.** The steady state is 200 items, because ticket 02 windows the
snapshot, and virtualization would change nothing about the state the app is in nearly all of the
time. Reaching a bad state takes twenty-four deliberate clicks of *load earlier* by a reader who
is not streaming a turn while they do it. And two of the four questions this ticket asked turn
out to be **capability losses rather than performance trades** — find-in-page and selection
across a scroll boundary both die when rows are unmounted, and both are exactly what a reader who
has paged back through a week is doing it for.

**The finding worth keeping is a different bug.** The unbounded thing is not the window, it is
the *accumulation*: `case 'earlier'` in `model.ts` prepends, dedupes and caps nothing, so `items`
grows for as long as somebody keeps clicking. The feed has had a ceiling of 200 since it was
written and the transcript has none. **A ceiling on `items`, dropping from the bottom as pages
arrive at the top, is the move to try before a windowed list** — a small diff in one reducer
case, it keeps find-in-page and selection over everything mounted, and it bounds nodes at a
number somebody chose. It is not built here, because nothing has complained yet and this ticket
is about not building things nothing has complained about.

**What reopens this:** a user reporting a slow pane on a transcript they can describe, with *load
earlier* in the story. Not a number in a table.
