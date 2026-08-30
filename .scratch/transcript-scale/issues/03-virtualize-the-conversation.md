Type: prototype
Status: needs-triage
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
