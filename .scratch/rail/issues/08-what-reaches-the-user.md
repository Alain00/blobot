Type: grilling
Status: resolved

# What reaches the user when a member of a backgrounded team is waiting

## Question

The one regression risk this redesign carries, and the direct consequence of the author's *"a dm
should share nothing regarding status"*.

Today a backgrounded team's `waiting` reaches the user twice: the team's own row inverts
`StatusWord`, and — if that team is the open one — the member's row does too. After this, an
agent's row is about its thread and says nothing about its seats, so the **team row is the only
carrier**, and pressing it lands on the team pane where the user then has to find which member is
blocked.

With nobody listening a permission request is **cancelled, never allowed**, so this is work
silently lost rather than a cosmetic miss. Sound already bought exactly one notification for this
case and no other.

Decide:

- **Whether the team row says who.** It folds N statuses into one word today. A `waiting` fold
  could name the member, or draw its face, or stay a word.
- **What the team pane does when you arrive.** Scroll to the block, select the member's pane,
  or nothing.
- **Whether an agent row may break the rule for this one status.** The author's sentence is about
  a thread not inheriting a team's state, and `waiting` is the one status whose cost is
  measurable. Argue it both ways and let the author decide; do not quietly widen it.
- **Two teams waiting at once**, which the rail can say and a sound cannot.

## Answer

Decided with the author, 2026-09-06. The team row carries `waiting` alone, and it gained a way to
say who.

**The team mark becomes the members' faces, stacked.** The author's own answer to *does the row
say who is waiting*: one member is one face, two are a stacked pair, three a pyramid, and so on.
So *who* is carried at the left, on the mark, rather than on the right edge where it would have
fought the status word. `03` draws the geometry, including what happens past four.

**The face says who, the word says what, and both stay.** At mark size a face is a shape and a
hue: it can say *which of these four* and cannot say *what is happening*. The inverted `waiting`
is the app's one inversion and the only thing readable down a column at a glance. They sit at the
two ends of the row each already owns.

**The icon becomes a sticker on the stack.** `DESIGN.md`'s rule — the faces say who is on the
team, the icon says which project — survives intact in the same box. Dropping the icon would throw
away the one thing that separates a column of similarly-named teams, and showing faces *or* an
icon depending on whether a PNG was found four levels down would make two unrelated marks for one
kind of row.

**Pressing a waiting team row lands on the team pane, like every other press.** The request is
already on screen there: an unanswered permission is one of the three things that never fold. A
row that lands somewhere else because of what is happening inside it is a row you cannot predict.

**An agent row still says nothing about its seats, `waiting` included.** Argued both ways as the
ticket asked. For: the cost is measurable, since with nobody listening a request is cancelled
rather than delayed. Against, and decisive: pressing that row opens the agent's thread, which is
not where the request is, so the row would report a problem it cannot lead you to. A signal you
cannot act on from the place it appears is worse than no signal, and the team row carrying it is
both correct and pressable.

**A waiting team cannot fall below the fold in practice.** Recency is last activity and an agent
blocked on a permission is active now, so the ordering already puts it where the user is looking.
Floating waiting rows to the top was refused: it would break *a team keeps its place*, which
exists so rows do not move under a pointer, and it buys nothing the sort is not already doing.
