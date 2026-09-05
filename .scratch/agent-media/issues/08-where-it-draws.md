Type: grilling
Status: resolved
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

## From the author, 2026-09-05

Asked for ticket 03's naming call, the author answered this ticket instead: **the thumbnail must be
shown in the UI.** Binding, and it settles the *how big* question one notch before this ticket opens
it: a Picture is not a chip, not a filename with a disclosure behind it, and not something a reader
has to open before there is anything to see. The picture itself is on screen in the transcript.

It also removes the softest of this ticket's options — the one where a Picture inside a folded run
is a line saying a picture exists — and pushes the fold question to its real form: what does the
fold do when the thing inside it must be visible. Ticket 07's *the measurements may not live only
behind a click* was the same instinct arriving from the provenance side; both are now on record.

## Answer

**The picture, then one mono line, and nothing else.** Resolved 2026-09-05, downstream of the
author's two instructions on this ticket: the thumbnail must be shown, and nothing may explain or
expose what the thumbnail already shows. Prototype at `../prototypes/08-picture.html`.

### Colour, and the second time it is spent

**The picture is drawn in colour**, and the yield is written narrowly again rather than inherited.

`DESIGN.md`'s existing yield turns on whose content it is: *an attachment is a person's own file
quoted back to them, not a signal blobot is emitting*. A shown Picture is a photograph of the
user's own app, taken inside a checkout of the user's own repository. It is a step further from
their hand than an attachment and it is still not blobot emitting a signal, which is the half of
the sentence the rule actually rests on.

The functional half is decisive on its own: the objective is *how does my app look*, and a grey
screenshot of a UI cannot answer it. Desaturating it does not make the rule stronger, it deletes
the feature.

**An observed Picture is in colour too**, and the reason is a rule rather than a shrug: colour must
not carry provenance. Drawing one source saturated and the other grey would put a fact on the
colour channel, in an app where status is never colour and the two frames already carry the
difference in words.

It stops at the picture's edge. No coloured frame, no coloured chevron, no coloured face ring, no
tint behind it. `RuntimeMark` stays greyed and the team icon stays as it was.

### Size, and no chip

Not a chip. A chip is right for a thing you are being reminded you sent and wrong for a thing you
are being shown, and the author has already ruled the thumbnail visible.

It draws at the conversation column's full width, natural aspect, scaled down to fit and **never
cropped** — a crop is the same defect as a resize, a wrong answer with no visible cause. A tall
page screenshot is bounded by height and scales rather than clipping, so what is on screen is
always the whole picture.

Clicking it opens the picture at natural size over the surface, and that is the whole of the
control: no toolbar, no zoom UI, no next and previous. Escape and a click outside close it. This is
not a gallery, which is out of scope; it is the same picture, larger, because a column-width draw
of a 1280 wide screenshot cannot be read for detail and detail is what the reader is judging.

### One line, and the rule that produced it

Ticket 07's amendment settles what it says. Restating the test here because this is the ticket that
will be tempted: **if the reader can see it in the picture, blobot does not say it.**

- shown: `login-page.png · written during this turn`
- observed: `from playwright_screenshot`

No dimensions, no byte size, no kind, no `1 picture`, and no sentence introducing it. A Picture is
never announced. `Attached.tsx`'s chip says a name and a size because a chip is a stand-in for a
file you cannot see; this is not a stand-in for anything.

Mono, `--muted`, under the picture rather than over it, because it is a footnote to the thing and
not a title on it.

### The fold, answered by the fold's own rule

A Picture is **outside** the block, always, and the block goes on counting its call.

No new rule is needed. The fold already holds one: *what the principal said to you is never in the
block*, and everything the turn had to arrange is demoted together. A Picture is the turn speaking
to the reader, which is the exact category the fold already lifts out. A picture that only exists
behind a disclosure is a feature nobody finds, and the author's floor forbids it anyway.

So the shut line stays `ran 4 tools · 2 notes`, unchanged, and the picture is drawn under it in the
agent's own column. The count does not mention pictures: the number of tools is what the reader
uses to decide whether to open the block, and a picture they can already see is not in that
decision.

### Voice, altitude, and the team pane

The agent's voice, at the agent's altitude, under the agent's prose in the same turn. No fourth
voice, no `system` line, and blobot writes no caption — ticket 07 settled that and this ticket does
not reopen it. The agent's own description of its screenshot is ordinary prose above the picture.

**The team pane draws it identically**, and that is a decision rather than a default. `WORKSPACE`
became a body per pane and a block per team because one branch name is false about four agents;
a Handbook became a figure because four Handbooks do not fold into one. A Picture folds into
nothing and is false about nobody: it is one event by one agent, and the attribution block
`.scratch/live-steps/` built already puts the right face over it. Four agents showing four
pictures is four pictures, and that is not *the same thing four times*, it is four different
things.

The one real cost is the column: four full-width pictures in a shared column is a lot of scroll.
That is what the turn contained, and shrinking a Picture in the team pane would make the same
picture mean two different things depending on which pane you opened.

### It does not animate

Motion carries status in this app and a picture arriving is not a status. It arrives the way the
prose around it arrives, with the transcript's own scroll and nothing of its own. The `@mention`
list was refused an open animation on frequency alone, and an agent in a screenshot loop is a
worse frequency case than a menu.

### The one case that is text alone

`a picture from alice · not drawn · its bytes did not arrive whole`. It is text alone because there
is nothing to look at, which is the exception that proves the author's rule rather than a
contradiction of it. Ticket 10 owns the catalogue and the wording.

### `DESIGN.md`

Two amendments to write, under **Colour**:

1. The yield extends a second time, to a picture an Agent shows, with the argument above: the
   content is the user's own work, blobot is not emitting a signal, and grey defeats the only
   question the picture was produced to answer. It licenses the picture's own pixels and nothing
   else, and **colour never carries which source a Picture came from.**
2. A standing rule, from the author, 2026-09-05, wider than this feature: **blobot does not caption
   what the reader can see.** A visible thing is not introduced, labelled, counted or described.
   What blobot says beside it is only what looking cannot answer.

## Amendment, 2026-09-05: a turn's Pictures are one row

From the author, against the first live run: a turn that took two screenshots drew two
column-width pictures with a face and a caption between them, and the answer they were taken for
ended up a screen and a half below the question. **Where there is more than one, they share a
row.**

It does not contradict *not a chip, full column width*. That rule is about a Picture being the
thing you are being shown rather than a reminder of one, and it holds for **one** Picture, which
is what the ticket had in front of it. Several is a different object: the reader is comparing
them, and a comparison that does not fit on screen is not one. A single Picture keeps the column
unchanged, because halving one buys no scroll at all and costs exactly the detail the picture
exists to carry.

The gathering is in `rowsOf` and not in the item list, because the two Pictures the author was
looking at were **not adjacent**: each came off its own run, with a shut fold between them. The
window is the runs and the Pictures between them and it closes on anything else -- prose, a user
message, a system line, a block still in flight -- so Pictures are only ever gathered across the
turn's own **demoted** work. That is the same editorial call the fold already makes, applied to
what the calls produced rather than to the calls. It is the one place in this column that moves a
row past another, and what it moves past is a shut fold.

Three refusals came with it, each a test: never across two agents, because a row under one face
has to be that face's work; never a Picture that was **not** drawn, because that is a sentence
that already counts rather than repeating and a row of them would be a row of nothing; and never
at one, which is the rule the author actually stated.

## Amendment, 2026-09-05: one height, and the width is the picture's own

Also the author's, from the same run, and it arrived in two steps worth keeping both of.

It was first written as **one box**: identical cells at a fixed aspect ratio, so a row of ragged
tiles stopped reading as three unrelated things and only the contents differed. That is the right
goal and the wrong instrument. A fixed box buys its uniformity with **letterboxing**, and the
first picture in the real transcript was a portrait screenshot sitting in a landscape cell with a
band of dead ground down either side -- the same waste of space in the other axis as the scroll
this row was created to save. The author asked for that space back, correctly.

So the constant is the **height**. Every tile carries the same weight, the row keeps its edge, and
a portrait picture is simply narrow. Nothing is cropped and nothing is padded, because neither is
needed once the box stops being fixed: the pictures are bounded by height, and by width only
where one is wide enough to leave the column, which is the one case where a shorter tile is the
honest answer.

*Never cropped* was never at risk under either version, and is now not even reached.

See ticket 07's amendment of the same date for the caption that went with it.

## Amendment, 2026-09-05: a tile, and the full size is the click

Third from the author on the same run. On a shared row a Picture draws **as a tile** -- around
200px, not half a column -- and the full-size view is the whole of what it costs to see it
properly.

Two pictures at half width still take most of a screen, which is the scroll the row was created
to save, so the row was only half doing its job. What a tile has to do is say **which picture this
is**; judging it is what the click is for, and this ticket already put the full-size view there
with no toolbar and no gallery around it. So the cells do not grow to fill the column when there
happen to be only two of them.

The single Picture is unchanged and keeps the column, for the reason the first amendment gave.

Escape closing that view is now wired **on the document** rather than on the overlay, which is a
fix and not a decision: a `keydown` handler on a div only fires while that div holds focus, and
this one opens under the pointer. It has a test, because it is exactly the wiring a look at the
screen would not catch.
