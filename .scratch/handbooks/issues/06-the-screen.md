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
