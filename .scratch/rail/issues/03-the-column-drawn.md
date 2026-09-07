Type: prototype
Status: resolved

# The column, drawn: one list, two kinds, and a pin

## Question

One mixed list ordered by recency, teams and agents as peers, pinned rows in a block at the top.
Draw it, because the argument that mattered in the grilling was refused on a drawing and not on
a principle: a mixed list has rows whose press means *open a team* beside rows whose press means
*open a person*, on the same left edge, and nothing yet says which is which.

What the prototype has to answer:

- **An agent row and a team row are now different objects at the same size**, since one is a
  44px face and the other is a 20px stack of them. Draw them adjacent, which is what a mixed list
  guarantees.

- **The two row shapes.** An agent row today is two lines: a 44px face, the name, `LEAD`, when it
  last spoke, and either its role or the last thing it said. A team row is one line and 20px of
  folder mark, deliberately shorter so the column does not read as two lists stacked. That
  reason is now inverted — they are one list — so the sizes are open again.
- **The mark is the roster, stacked.** Superseding the faces-on-the-right sketch this ticket was
  written with: `08` decided the team **mark** is the members' faces — one face alone, two side by
  side, three as a pyramid, and so on — with the detected project icon as a **sticker** on the
  stack. So the right of the row keeps `StatusWord` uncontested and the left says who. Draw the
  geometry, and decide what happens at six and at twelve: a stack that keeps subdividing turns
  into noise at mark size, and `+3` is a count where the whole point was faces.
- **The pin.** A block at the top in pin order, no glyph at rest, set from the row's own menu.
  Draw the boundary between the block and the list: a hairline is a new element in a column that
  had one left, and a gap may be enough.
- **Sorting.** Hire time is a never-talked agent's activity, so the order is total. Confirm on
  screen that a fresh hire landing near the top reads as correct rather than as noise.
- **The rest state.** Twenty agents and four teams, most of them silent. The column DESIGN.md
  asks to keep quiet is now roughly five times longer than it was.
- **What the twisty leaves behind.** The chevron was an indicator of a roster that no longer
  opens. The gutter it stands in is what puts every mark on one left edge.

Prototype in `/prototype`, screenshot through `electron-vite build` plus `--screenshot`, and link
the captures from the answer.

## Answer

Drawn in [prototype.html](../prototype.html), rendered with headless Chrome; the three captures
are [prototype.png](../prototype.png) (the first pass: 20px marks, the stack from one to twelve,
the same-roster collision, two-line against one-line agent rows), [prototype-revised.png](../prototype-revised.png)
(34px marks) and [prototype-3.png](../prototype-3.png) (the shipped shape). Decided with the
author against those, 2026-09-06. The faces are approximate — the shipped blobatar is generated
from a shape band and these are five hand-cut SVG roundnesses — which is close enough for layout
and no closer.

**One row shape for both kinds**, from the author's own reference: a 34px mark, the name and the
time on the first line, the last thing said on the second. So a team and an agent are peers in the
literal sense, sharing a left edge and a height, and neither reads as a heading over the other.
The 20px team row is gone with the reason for it: it was drawn small because it *headed* a roster,
and there is no roster under it now.

**The mark is a cluster, capped at three.** Not the pyramid this ticket was written with: at 20px
a pyramid of three is confetti, and the first capture is the argument — six is texture, twelve is
a pattern. Overlapping, one face filling the box alone, two and three smaller and offset. Past
three the count goes on the second line in mono (`+6`), because a stack capped at three would
otherwise say *three people* about a team of nine, which is the one thing a face stack must not
do. **Status wins that slot**: while a row is saying something, `+N` is dropped, which is the
*one thing at a time* rule the right edge already had.

**The project icon is a sticker on the cluster**, greyed, as `08` decided.

**No speaker prefix on the second line**, on either kind. Drawn both ways; the author took the
words alone, which is what the reference does.

**The pinned block is a hairline and no heading.** The block's position is the state; a mono
`PINNED` is signage for something already visible. Without any separator the order looks arbitrary
the first time a pinned row outranks something more recent, which is what the hairline is for.

**Two teams with the same roster and no icon draw the same mark**, and that is accepted.
`TeamMark.tsx` reverted faces twice for exactly this, and the third capture puts the case on
screen: the names and the last lines are what a reader actually uses, and the mark is no longer
identifying alone. Falling back to a folder when a team has no icon was refused — it would trade a
rare ambiguity for a column holding two unrelated kinds of mark, chosen by whether a PNG was found
four levels down.
