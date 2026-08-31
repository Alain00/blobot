Type: grilling
Status: resolved

# What is this thing called, and what is it not?

## Question

The glossary's rule is *use these words; don't drift to synonyms*, so the name is decided once,
here, before ten files spell it three ways. **Briefing** is the proposal, and this ticket either
takes it or replaces it, and then writes the `CONTEXT.md` entry that fixes its boundaries.

The word has to survive standing next to three terms that already exist and are close enough to
be confused with it every single time:

- **Standing instructions** — on the AgentProfile, true on *every* team, folded into the Persona
  and said as such so it is never mistaken for this team's framing. That last clause was written
  before there was any such thing as this team's framing. There is now.
- **Role** — on the Agent, copied at team formation, restated by a profile edit. *Marketing.*
  A line, not a body of knowledge.
- **Persona** — the agent's whole system prompt, adapter-owned, into which all of the above are
  composed. The Briefing is a *part* of a Persona, never a synonym for one.

## What the word has to carry

That it is **about the work, not about the person.** Mara's standing instructions say how Mara
writes; her Briefing says what Vlue sells. The first travels with her; the second dies with the
team. If the chosen word does not make that split obvious on sight, it is the wrong word, because
the whole failure mode this effort closes is knowledge landing in the scope one level up.

## What else this ticket settles

- The name of a single **entry** in it, since the charting settled that a Briefing is a list.
  *Entry* is flat and available; *fact* overclaims (an agent recording something it inferred is
  not recording a fact); *note* is too weak for something that enters a persona.
- Whether **unbriefed** is a term (an Agent with an empty Briefing) or just a description. It
  appears in the persona's empty state, on a control in the pane, and probably in a status line,
  which is three places — that usually means it is a term.
- The `CONTEXT.md` entry, written in this ticket rather than deferred, and an addition to the
  **Avoid** list if any near-synonym needs killing.

## Recommendation

**Briefing**, and **entry**. It is what you do to a new hire, it is about the work rather than
the person, and it is a noun in the same register as Envelope, Mailbox and Routine.

## Answer

**Handbook**, made of **entries**. The verb is **to brief**, and the state is **unbriefed**.

Resolved 2026-08-31, with the author, who took Handbook over the recommendation.

### Why not Briefing, which was the proposal

*Briefing* was right on every axis but one, and the exception was fatal in exactly the place this
effort came from: **a brief is a term of art in marketing**, and the motivating example is a
marketing expert on team Vlue. Mara would hold a Briefing that is not a brief, while being asked
to write briefs that are not her Briefing. A word that is ambiguous in the user's own domain is a
word that will be explained in a tooltip forever.

*Background* was rejected for a worse collision, an internal one: blobot already speaks of a
backgrounded team and of a pool keeping teams alive in the background. An outside collision can
be disambiguated by context; ours is the vocabulary we have to keep straight.

*Context* is dead three times over — the context window, `CONTEXT.md`, and the `CONTEXT` block on
screen. *Dossier* is about a person, and this is about the work.

### Why Handbook is better rather than merely different

It carries the split the word had to carry: **standing instructions are about the person and
travel with them; a Handbook is about the work and stays with the team.** *Handbook* names a
thing that belongs to a place of work, which is precisely the scope, and nobody has ever taken a
handbook with them to a new job.

The objection raised while charting — that *handbook* implies something authored and maintained
rather than elicited — turned out to be the weaker half of the trade. A handbook that grew out of
being told things, one entry at a time, is a perfectly ordinary handbook. A Briefing that a
marketing agent confuses with a creative brief is not a perfectly ordinary anything.

### The verb, which is what makes the choice pay

Taking Handbook orphaned *unbriefed*, and the resolution is not to drop it but to split the root
deliberately: **Handbook is the artifact, *to brief* is the act, *unbriefed* is the state.**

This is a net gain. The effort had no verb — charting kept reaching for *the interview* and
*onboarding*, neither of which is domain vocabulary — and now it has one. And the marketing
collision that killed the noun does not touch the verb: nobody writes *a brief* by briefing
somebody.

So: *Mara is unbriefed. Brief her. Her Handbook has four entries.*

### entry

Chosen over *fact*, *note* and *point*.

*Fact* overclaims. An agent recording something it inferred from a conversation is not recording
a fact, and ticket 10 — an entry that is no longer true — is much harder to even phrase if the
word asserts truth. *Note* is too weak for something that enters a persona on every session.
*Point* reads well in prose (*a briefing point*) but is two words everywhere in code, and it was
partly load-bearing on the noun being Briefing.

### unbriefed is not a Status

Written into the glossary explicitly, because it is the first thing a later session will get
wrong. **Status** is the fold over the event stream — `idle`, `working`, `waiting` — derived in
memory and never persisted. A Handbook is persisted, and being unbriefed is not an activity.
An `unbriefed` word appearing where a `StatusWord` does would break the one rule that makes the
status fold trustworthy.

### The Avoid list

Two additions, and the second carries a qualification that must survive.

- **"Context"** for a Handbook. It will otherwise happen within a week.
- **"Memory"**, and everything near it: *remembers*, *learns*, *knows about you*, *training*.
  Wrong in two directions at once. It promises persistence blobot does not give, since a Handbook
  dies with the team and travels to no other. And it borrows a vendor's word for what is a
  persona block, inviting the assumption that the agent itself is being changed rather than
  being told something.

  **The qualification:** *remember* is fine in **the user's** mouth. Ticket 09 wants *"remember
  that"* to work as a plain instruction, because a user telling an agent to record something is
  the strongest signal there is. It is wrong only in **blobot's** mouth, on screen or in a
  persona. A later session flattening this into a banned word would break the instruction the
  feature depends on.

### Written into CONTEXT.md

`Handbook`, `Entry` and `Unbriefed` under Messaging, beside Standing instructions and Persona so
the contrast is legible at the point of confusion, plus the two Avoid entries.
