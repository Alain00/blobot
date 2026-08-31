Type: grilling
Status: resolved
Blocked by: 03, 06

# How an entry is disclosed, and where "you have not seen this" lives

## Question

Entries the agent recorded **open inline in the transcript in the turn that created them,
carrying removal.** Ticket 03 settled that `record_entry` takes a **list** and may be called once
per turn, so this is **one block listing what was recorded**, not one block per entry. That is settled and it is the price of the whole second half of the ask: an
agent changing its own persona off screen is the version that must not exist. This ticket draws
that block and answers the harder half, which is what happens after the user scrolls past it.

## The precedent, and where it stops applying

`propose_routine` charged four things and three of them port cleanly: the inline block, the
removal control on it, and the closed list of what an agent still may not do. The fourth does
not port, and that is this ticket's real question.

A Routine an agent armed keeps an **ink edge at the top of the Routines screen** until a person
answers it, meaning *you have not seen this* and never *this is waiting for you*. That works
because Routines have a screen of their own, at the rail's foot, which is the natural home for a
mark that has to persist beyond one turn's scrollback.

A Handbook has no screen. It lives in the agent's pane, beside `WORKSPACE`, under a composer and
a transcript. So an unreviewed entry has nowhere obvious to put its edge, and the candidates are
all worse than the Routines one:

- **The pane's Handbook block.** Correct scope, invisible if the block folds and the user does not
  open it.
- **The rail row.** Already carries an unread mark as ink weight for a Routine run the user has
  not looked at, earned by origin rather than by a turn they started. An entry the agent wrote
  during a turn the user *did* start does not obviously qualify, and stretching that rule is how
  the mark stops meaning anything.
- **Nothing at all.** The inline block was on screen when it happened, in a turn the user was
  watching by construction, and that is the whole disclosure. Defensible, and it is the honest
  reading of *never this is waiting for you* — but it means an entry written in the twentieth
  minute of a long turn can enter a persona unseen.

## What it has to settle

- Which of those, and the reasoning, in the register the Routines answer used.
- Whether **reviewed** is a state on an entry at all, or whether that concept simply does not
  exist here. It is a real term in `CONTEXT.md` already, defined for Routines; extending it or
  refusing to is a glossary act.
- Whether **removal** from the inline block and removal from the pane are the same act with the
  same consequence, and what the transcript says afterwards — a block whose entry has been
  removed is a record of something that is no longer true, which is exactly what a transcript is
  for and should not be rewritten.

## Added by ticket 03: a write that was refused

`record_entry` is refused at the tool boundary against two bounds, and the refusal is addressed
**to the agent**. Nobody else learns of it. That is fine for an entry that ran long, which the
agent can rewrite in the same turn. It is not obviously fine for the **whole-Handbook** bound,
whose fix is not the agent's to perform: the Handbook is full, and the only remedy is a person
removing an entry from the pane.

So: does a refused write reach the user, and where? (a) Never, which is the current posture for
every other refusal in `bounds.ts` and the cheapest. (b) In the gauge, which already draws what a
Handbook costs and is where a full one is visible anyway. (c) Inline, as a block, the way a
successful one is.

Against (a): this is the one refusal whose remedy belongs to somebody who is not in the room, and
an agent paraphrasing a limit it hit is exactly what users read as the agent being confused.

## Answer

**A collapsed system line in `Compaction`'s shape, no mark anywhere else, and a second line only
when the Handbook is full.** Resolved 2026-08-31 with the author.

### The premise this ticket was written on is gone

It was written to port the Routine proposal's four compensating controls, of which the ink edge
was one. DESIGN.md's **no ink edge on a closed shape** ban, added 2026-08-31, records that edge as
having been wrong: *"it survived on the Routine proposal and on `.openerror` and was wrong there
too."* There is nothing to port. What replaces it is a shape that was already in the transcript
and that nobody had connected to this.

### The block is `Compaction`'s shape, not a card

One system line, shut by default, expanding to the entries and their removal.

```
mara · wrote down 3 things                                    [ shut ]
```

`Compaction`'s own comment is the argument, and it is about this exactly: *"this is a thing that
happened, not a thing to read, until the reader asks why their agent stopped remembering
yesterday. Then it is the whole answer."* An entry recorded is a thing that happened. A card would
put several sentences of an agent's notes into the middle of a conversation every time it learns
something, which is how the disclosure that makes agent-written entries safe becomes the noise
that makes the conversation unreadable.

It is also a gesture the transcript already has, rather than a third one invented for this. Ticket
03's decision that `record_entry` takes a **list** is what makes one line enough: the turn produced
one act, so it draws as one line, whether it recorded one thing or four.

### Nothing marks the rail, and the rule composes for free

The rail's unread mark is **full ink on the preview line**, earned by **origin**: the last thing
the agent said came from a Routine run, a turn the user never started. Not a dot and not a count,
by its own comment.

Applied unchanged, it answers this ticket's hardest question by itself:

- An entry written in a turn **you** started is not unread. You were there.
- An entry written during a **Routine run** is already marked, because the run marks the row and
  the entry rides along. No new rule, no new state, no second reason a row can be inked.

So there is **no new mark anywhere**, and the charting note about keeping an ink edge for
unreviewed entries is dropped rather than relocated: there is no unreviewed state to draw.

Stretching *unread* to cover a turn the user was watching is precisely how that mark stops meaning
anything, and it is the failure the Routines ticket named when it chose origin over turn count.

### *Reviewed* is not extended to entries

It stays a Routines word. It exists there because an armed Routine an agent made **fires
unattended**, so it matters that a person has seen it. An entry does nothing on its own: it sits in
a persona until somebody removes it. Extending the term would give it two meanings, the second of
which is only "was on screen once", and that is not a decision anybody made.

### The block carries removal

Charting settled this and it survives the re-examination. The objection is fair — two removal
paths, and a transcript is a record rather than a control surface — and the permission card is the
answer to it: that block carries **Allow once** and **Reject** in the transcript, because the
decision belongs at that moment.

Same here. The whole justification for letting an agent write into its own persona is that you see
it happen and can undo it **there**. Sending the user to the pane's panel to act turns a disclosure
into a notification, which is the weaker thing this design refused when it made the write disclosed
in the first place.

The line stays in the transcript after a removal. A transcript is a record of what happened and is
never rewritten, which is the same reason a Routine that was later disarmed still shows the turn
that armed it.

### A refused write: two refusals, two answers

Ticket 03 handed this over as one question. It is two, and that is what the original framing
missed.

- **An entry that ran long** is the agent's own problem, and it can rewrite it in the same turn.
  Nothing reaches the user. Surfacing it would be narrating a tool failure, which blobot does not
  do anywhere else.
- **A full Handbook** is not the agent's problem. The fix is a person removing an entry, and the
  agent will hit the same wall on every turn until somebody does. It gets **one system line**, in
  the same voice as the block above it:

  ```
  mara · handbook is full, nothing was recorded
  ```

It is the only refusal in the app whose remedy belongs to somebody who is not in the room, which
is the only reason it is the only one that leaves the room.
