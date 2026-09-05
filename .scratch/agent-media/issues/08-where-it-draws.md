Type: grilling
Status: open
Blocked by: 03, 04, 07

# Where it draws, and saturation spent a second time

## Question

`DESIGN.md`'s governing rule is that the blobatars are the only saturated thing on screen. It has
yielded exactly once, and the yield was written narrowly on purpose, in `components/Attached.tsx`:

> a file the *user* attached is their own content quoted back to them, not a signal blobot is
> emitting.

An agent's screenshot is not the user's content. It is output from the thing blobot is supervising,
which is the exact category the governing rule was written to keep monochrome. So the existing
yield does not reach it by inheritance, and this ticket either extends the rule with its own
argument or draws the picture grey.

The likely answer is that it extends, because a screenshot of the user's app is a picture of the
user's own work rather than blobot chrome, and a grey screenshot of a UI is worse than useless for
judging a UI. But that is the second time saturation is spent, the argument is different from the
first, and `DESIGN.md` has to carry it.

## What it has to settle

- **Colour or not**, with the argument, and the amendment to `DESIGN.md` written either way.
- **What it does to the fold.** `Conversation.tsx` folds a turn's tool calls into one run, and a
  screenshot arriving as a tool result is inside that fold. A picture that only exists behind a
  disclosure is a feature nobody will find; a picture that breaks the fold open undoes the work
  that made a busy turn readable. Neither is obviously right. The `mail` precedent is relevant:
  what the principal said to *you* is never in the block.
- **How big.** A full-page screenshot in a conversation column is most of the column. The inbound
  answer is a chip, which is the right size for a thing you are being reminded you sent and the
  wrong size for a thing you are being shown.
- **Where it sits in the three voices.** It is the agent speaking, so it is the agent's voice, and
  the question is whether it draws inside a message or beside one — which is ticket 06's shape
  arriving on screen.
- **What ticket 07's facts look like as a frame**, at whatever size is chosen.
- **The team pane.** Four agents, four screenshots, one column. `WORKSPACE` became a body per pane
  and a block per team; a Handbook became a figure and never a body. This needs its own answer,
  and *the same thing four times* is not it.
- **Whether it animates.** Motion carries status in this app and a picture appearing is not a
  status. The `@mention` list was refused its open animation on frequency alone.

## What is binding

- `DESIGN.md` is binding and contradicting it is a reopen, not a workaround. Extending it is
  ordinary work and this ticket is expected to do exactly that, in writing.
- Status stays monochrome, carried by motion, a mono word and a hairline. Nothing here makes a
  picture carry status.
- No coloured chrome, no coloured icons, no vendor logo un-greyed, whatever this ticket decides
  about the picture itself.
- Prototype it. `/prototype`, and the prototype stays in `prototypes/` the way ticket 06 of
  `.scratch/handbooks/` did.
