Type: prototype
Status: resolved
Blocked by: 01, 03

# Reading and editing a Handbook

## Question

It lives in the **agent's pane**, beside the `WORKSPACE` line under the composer, because both are
per `<team>/<agent>` and that placement is what makes each sentence true. It is explicitly not on
*your agents*, which is the AgentProfile screen, and putting it there would re-break the boundary
ADR-0001 and ADR-0002 drew. That much is settled. What it looks like is not.

## What it has to settle

- **The empty state, which is the invitation.** An unbriefed agent's pane carries the control
  that starts the interview. This is the only place in the app that teaches anyone the feature
  exists, and the control sends nothing into the transcript — it is a *go ahead*, not a message,
  and it should not read like a send button. It **goes** once a Handbook exists.
- **The list.** Entries, in order, each removable. Where the line between reading and editing
  falls: whether an entry is editable text or only removable, and whether the user can add one by
  hand, which is the wizard sneaking back in through the side door and should be argued rather
  than assumed either way.
- **How much of it is drawn at rest.** `WORKSPACE` is a line. A Handbook is a body, and the pane
  already carries a composer, a transcript and that line. It probably folds.
- **Who says a Handbook edit takes at the next start.** ADR-0002's rule applies unchanged and the
  app already says a version of this sentence where roles are restated. It has to be said here
  too, or the user edits an entry and watches the agent ignore it.
- **The team pane.** `WORKSPACE` is drawn twice, and in the team pane it is a block in the
  activity column beside `CONTEXT`, because a single branch name would be false about the other
  members. A Handbook has the same problem and may have a different answer: N Handbooks do not
  fold into one the way N statuses fold into a `StatusWord`. It may simply not appear there.

## What is binding

`DESIGN.md`, and the governing rule: the blobatars are the only saturated thing on screen. The
list row is filled (`.listrow`) and a picker row is that same row outlined. Read it before
drawing anything.

## Deliverable

A prototype, linked from this ticket, and the decisions it settles written into the answer.

## Answer

**A notice card above the composer while unbriefed; a panel under it, behind a tray door, once
there are entries.** Resolved 2026-08-31 with the author, against
`prototypes/06-handbook/index.html`.

### What decided the structure, and it was not a preference

The tray under the composer carries its own rule, in `Workspaces.tsx`: *everything on it is a
live number or a door, and nothing on it is a description.* A Handbook is prose. So it cannot sit
**on** the tray, and the only thing that can is a **door** to it: `handbook · 4`, opening a panel
that takes the tray's shape, tucked under the composer.

That settles the briefed case. It does not settle the empty one, because a door to an empty room
is exactly what that rule is against.

### The invitation is a notice card above the composer

Two versions were prototyped and both lost. A panel with *brief her* and *not now* made declining
an act, about a feature the user has not met, when charting settled that ignoring it should cost
nothing. A one-line `.refusal` was the right register but had nowhere to put the control.

The author proposed the third: **a card sitting on top of the composer, stating a fact about the
agent, with its one action pushed to the right.**

It turned out not to be a new primitive. **`.openerror` is already this shape** — `--raised`
ground, `--line` hairline, 12px radius, a row with its control at `margin-left:auto` — and
DESIGN.md records that its ink edge was removed under the *no ink edge on a closed shape* ban. A
shape the app already owns beat both of the ones invented for this.

```
Mara has not been briefed
She knows nothing about this team's work yet. What you tell her stays with Vlue.   [ brief her ]
```

- **It persists while the agent is unbriefed**, because it is a statement of state and not a
  notification. It stops being true the moment there is an entry. Going away after the first turn
  was rejected: an agent given one task on Monday is not an agent somebody decided never to brief.
  A dismiss was rejected because it invents a third state, *unbriefed and hidden*, that nothing
  can then draw.
- **No icon.** The reference that prompted this leads with a blue check; blobot has no blue and
  every icon at rest is `--muted`. A muted glyph in that slot would have to mean something, and
  the card's presence is already the signal. `.openerror` earns an icon because an error is a kind
  of thing. Not yet briefed is the ordinary condition of a new hire.
- **The tray door is absent** while the Handbook is empty. The card is carrying the invitation, and
  the tray's own rule is against a door to nothing.
- **It takes the composer's width exactly**, with no horizontal margin of its own, because it is
  the composer's notice and any inset would say it is a separate thing on the page.

### The panel, once there are entries

Filled rows on `--ground` inside the `--raised` panel, each carrying its text, then `author · age`
in mono, then removal on hover. `you · 2d` and `mara · 4h` are the whole of an entry's metadata,
which is ticket 03's decision drawn.

- **Removal only, never editing.** An entry you edited is neither yours nor the agent's, and the
  author field exists precisely so ticket 10 can tell those apart. Removing and saying the new
  version is one turn and leaves an honest record.
- **`add one` opens the composer with the agent asked to record what you say next.** It is not a
  text field. The user gets a shortcut past explaining themselves, and `record_entry` stays the
  **single path into a Handbook** — which is what keeps ticket 08's disclosure complete, since a
  hand-written entry would be the one entry with no block behind it.
- **`1,240 of 8,000 characters` on the panel's foot**, and it is not a duplicate of the gauge. The
  gauge answers *what is blobot spending on this turn*; this answers *how much room is left in the
  thing I am editing*, standing next to the entries a person would remove. Ticket 03 made the
  whole-Handbook refusal's fix belong to somebody who is not in the room. This is that room.
- **One sentence saying a change takes at the team's next start**, because ADR-0002's rule applies
  unchanged and without it a user edits an entry and watches the agent ignore them.

### The team pane

**A figure under the `CONTEXT` gauge, beside the peer-message and attachment lines. Never a body.**

`WORKSPACE` is drawn twice and becomes a block in the activity column there, because one branch
name would be false about the other members. A Handbook has the same problem and takes a different
answer: four Handbooks do not fold into one the way four statuses fold into a `StatusWord`, and
four agents' entries in a 232px column is a wall.

The team pane says what a Handbook **costs**. The agent's pane is the only place it says what a
Handbook **is**.

### A finding from building the prototype

The action slot was first named `.act`, which is the activity column's class in the same file. It
inherited `--recessed` and 18px of padding and drew a box around the button. That is DESIGN.md's
`.preview` story reproduced within an hour of reading it, and it is worth carrying into the
implementation: **every class this feature adds is prefixed for the thing it belongs to** —
`.hbnotice`, `.hbnact`, `.hbentry`. A generic name in a new screen is a live grenade.

## Amendment, 2026-08-31: what is behind the door is a dialog

**The panel is not under the composer. It is `.modal`.** Corrected by the author from the first
real Handbook, against a live team rather than the prototype's mock.

The answer above chose "a panel that takes the tray's shape, tucked under the composer" and the
argument for it still holds at the *door*: the tray's rule is that everything on it is a live
number or a door and nothing on it is a description, so `handbook · 4` is the only thing a
Handbook may put there. That part is unchanged.

What it got wrong is what the door opens onto, and the reason is a number this ticket never
looked at. **The prototype was drawn against four short entries.** A real one is prose: two
entries from one live account audit ran to **774 characters** and took two thirds of the pane,
and the bound is **8,000**. A body with no ceiling cannot live in the composer's footing, which
is a strip of chrome under a field. Every fix that keeps it there is worse than moving it: a
fixed height makes the composer's own footing a scroll container, and no height at all lets one
agent's notes push the transcript off screen.

**A dialog and not a screen over the working surface**, which is where *your agents* went. That
distinction is DESIGN.md's and it holds here: *your agents* is a **place**, reached from the rail,
about every AgentProfile the user has. This is one agent's Handbook, reached from that agent's own
tray, and what you do in it changes what that agent believes at the team's next start. It is a
decision, so it takes the shape this app gives decisions.

Three things fall out of it and all three are improvements rather than costs:

- **The height ceiling and the internal scroll come for free.** `.modal` already caps at
  `100vh - 48px` and scrolls inside itself. This was the whole problem.
- **Not `.roomy`.** That variant exists for the agent form, which is eight fields wanting two or
  three to a row. Entries are paragraphs, and the stylesheet's own note applies: a paragraph set
  to 760px is a paragraph nobody reads to the end of.
- **`.hbentry` moved from `--ground` to `--raised`**, which is `.listrow`'s fill. It was on
  `--ground` because the panel sat on the tray's glass; `.modal`'s own ground *is* `--ground`, so
  the rows arrived in the dialog with no fill at all. Caught on screen, not reasoned.

**And an entry is folded to its first line**, on the same evidence and in the same pass. The
answer above said "each carrying its text", which was written against four short entries. One
real entry is a paragraph of ids and campaign names, and three of those are a wall wherever you
put them: the dialog fixed the *container*, not the row. The question the list answers first is
*what does my agent believe*, which is a **scan**, and a scan cannot happen over three paragraphs.

What folds is the **tail**, never the row. The first line stays, so the list still reads as a list
of somethings rather than a stack of chevrons, and the whole text is in the DOM either way — the
fold is the stylesheet clamping it, not the component withholding it, so nothing is absent from
the accessibility tree. Rows open independently, because the reason to open two is to compare
them. The gesture is `.route`'s chevron, by the rule the transcript wrote for it: *a chevron
promises the thing is already here and folded*, which is true here and false of `load earlier`.
The **text** is the button and the row is not, because the row also carries removal and a button
inside a button is not a thing.

**Open, an entry takes the whole row and its byline drops under it.** `COMPAIGN AUDITOR · 14M`
is 22 characters of mono, and while it sat beside a paragraph it was setting the measure that
paragraph was read at: a 500-character entry wrapped into a column two thirds of the dialog wide
with a gutter beside it. The metadata's width must not decide the width of the thing it is about.
Shut they share a line, which is what a one-liner and its byline want.

`writesItDown` in the mock scenarios gained a 500-character entry with this, and that is ticket
08's argument applied to itself: every entry in it was a tidy one-liner, against which both the
panel and the dialog looked fine. A kind mock produces a UI that shatters on first contact.

Unchanged: removal only and never editing; `add one` opening the composer rather than being a
text field, so `record_entry` stays the single path into a Handbook; the foot's `1,240 of 8,000`
and why it is not the gauge's row said twice; the notice card above the composer; and the team
pane taking a figure and never a body.
