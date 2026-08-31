Type: grilling
Status: resolved
Blocked by: 03

# An entry that is no longer true

## Question

A Handbook is a list that only grows, written partly by an agent, and read on every session. Six
months in, Vlue has repositioned. The entry recorded in week one is still in the persona and is
now wrong, and the entry recorded last week contradicts it. Both are present, both carry the same
weight, and the agent has no way to tell which is current beyond a timestamp it may not be shown.

Nothing in the design so far addresses this, and it is the failure mode that arrives with time
rather than with a bug, which is the kind that ships.

## Why the obvious answers are each blocked by something already decided

- **The agent edits or removes the stale entry.** Blocked: an agent rewriting its own Handbook is
  out of scope, ruled so in charting, because a persona that edits itself off screen is
  unreviewable. Adding is disclosed by the inline block in the creating turn; removal has no such
  moment.
- **The agent supersedes it** — a new entry that names the old one as no longer true. This is
  additive, so the disclosure story is unchanged and nothing is destroyed. But it grows the
  Handbook to say something is *not* the case, which costs context permanently, and two
  supersessions of the same entry is a chain nobody can read.
- **blobot notices the contradiction.** Out. blobot provides no inference.
- **Only the user removes entries**, from the pane, having read them. Honest, and it is where the
  design currently sits by default. The cost is that it only works if someone goes and looks, and
  nothing in the app ever asks them to.

## What it has to settle

- Which of those, and whether *supersede* is a distinct act with its own word in the glossary.
- Whether an entry's **age is shown to the agent** in the persona. A timestamp per entry is cheap
  in characters and lets the model weigh recency itself, which is the least machinery for the
  most benefit. It also invites an agent to discount something old that is still true.
- Whether anything ever **prompts a review**. The ink-edge question is ticket 08's for a fresh
  entry; this is the same question for a stale one, and the answers may not be the same.
- What happens at the **bound** when it is reached and every entry looks necessary. Ticket 03
  refuses the write; this ticket owns what the user is meant to do about it, and *delete
  something* is only an answer if they can tell what.

## Recommendation

Supersession by a new entry that names the old one, plus timestamps shown in the persona, plus
removal staying the user's alone. It keeps every write additive and disclosed, which is the
property the whole design is built on.

## Answer

**An agent may withdraw its own `noticed` entries, disclosed, and correct one atomically with
`replaces`. Nothing else changes, and nothing goes stale on a clock.** Resolved 2026-08-31 with the
author.

### The narrowing, and it is a narrowing rather than a contradiction

Charting ruled *an agent rewriting its own Handbook* out of scope. The load-bearing words in that
ruling are **freely** and **off screen**: "a persona that edits itself off screen is unreviewable,
and it is one step from an agent widening what the next agent may do."

Ticket 03's amendment made an asymmetry available that did not exist when that line was drawn.
Entries now carry **told** or **noticed**:

- A **told** entry is the user's words. An agent removing it is an agent editing the user, and that
  stays forbidden with no exception.
- A **noticed** entry is the agent's own conclusion. An agent that concluded something in March and
  has since learned it was wrong is not rewriting the user's Handbook by withdrawing it. It is
  retracting itself, and a colleague who could not do that would be worse rather than safer.

And a withdrawal that opens in ticket 08's block, in the turn it happens, is **not off screen**. It
is exactly as visible as the write was, by the same mechanism, with the same removal beside it.

So: **an agent may withdraw entries it authored as `noticed`.** It may not touch a `told` entry, may
not edit any entry's text, and may not withdraw silently. A later session reading the out-of-scope
line should read this as the seam where it was narrowed, not as a decision that ignored it.

### Corrections are one act: `replaces`

`record_entry` gains an optional **`replaces`** per entry. A repositioned Vlue produces one call,
one block, one line in the transcript: *that one is wrong, this is right.*

Rejected, and one of them was this ticket's own recommendation:

- **Two independent acts**, a withdrawal and a write. They can drift apart, and a Handbook that
  briefly says both or neither is worse than either.
- **Supersession, where the old entry stays and is marked no longer true.** This ticket recommended
  it on the grounds that it is additive and destroys nothing. That is the wrong trade: it pays
  context **forever**, on every session, to record what is *not* the case, and two supersessions of
  the same entry is a chain nobody can read. Paying permanent context to avoid deleting something
  is the failure the whole-Handbook bound exists to prevent.

**The price, stated rather than absorbed:** the agent has to be able to name an entry, so the
persona numbers them. Two or three characters per entry, on every session, and on fx on every turn.
That is the honest cost of being able to correct anything at all.

### Dates are shown to the agent, absolute and never relative

An entry draws its `createdAt` in the persona as a short absolute date, `2026-03-11`.

It is the least machinery for the most benefit: the model weighs recency itself, and it can notice
that what it is being told now contradicts something from eight months ago.

**Absolute for a cache reason, and this must not be "improved" later.** The persona is pinned as a
**cached system prefix** — OpenCode's config says so in as many words. A relative age changes on
every composition, so *4 months ago* invalidates the cache on every session for a fact nobody
needed to the day.

### Nothing goes stale on a clock

No timer, no nag, no *stale* state, and no periodic turn asking an agent whether its Handbook is
still right.

- A **periodic check** is a turn nobody asked for, fired by a clock, which is exactly what
  `.scratch/transcript-scale/10` refused when it chose occupancy over time: a timer firing on an
  idle team is background spend nobody asked for.
- **Drawing old entries differently** invents *stale* as a state when age is not evidence. *We
  deploy on Fridays* is not less true for being a year old, and dimming it would be blobot
  asserting something it cannot know.

The panel shows each entry's age and author and lets a person decide. That is where this design has
put every other judgement blobot cannot make.

### What the user does when the Handbook is full

Nothing new is built for it. The panel is a list with ages and authors and a character figure at its
foot, which is the whole of what anyone needs to choose what to remove, and ticket 08 puts the
refusal in front of them when it happens.
