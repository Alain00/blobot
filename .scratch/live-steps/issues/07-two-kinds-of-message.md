Type: grilling
Status: open

# Two kinds of message, and what actually decides which

## Problem

Raised by the author, 2026-09-05, looking at `many-steps` with both agents working:

> *"subsequent bots that are not the main one should be part of the turns flow, not a main
> thinking state, I think there two kind of messages, internal from bot to bot, that is folded
> and part of the turns, and public for the user, this means the user must see this message."*

The observation is right and it names something the transcript already half-implements. Two
sentences into the same frame:

- **Internal** — mail between agents, and the work a teammate did *because of* that mail. It is
  the machinery of the turn. It folds.
- **Public** — what an agent has to say to the person. It does not fold, ever.

The settled transcript already does this. `runFrom` holds three things in one run — the addressed
agent's own steps, the mail either way, and the whole turn a teammate took because of it — and
lifts back out *"everything the principal said to you"*. In the current demo the fold reads
`RAN 16 TOOLS · 1 FAILED 🔵 Bob`, which is precisely Bob's entire turn classed as internal.

**The live transcript does none of it.** `liveTailOf`, built the same morning, knows nothing about
principals, partners or addressing: it takes every unsettled call of every in-flight agent and
gives each one a top-level block with its own face. So the same call is *internal, folded, in
somebody else's block* once it returns, and *top-level, faced, its own voice* while it runs. One
call, two classifications, decided by whether it happens to have finished.

## The proposal to argue with

**Adopt the split, and reject "two kinds of message" as the way to express it. The axis is who it
was addressed to, and blobot already computes it.**

A message does not carry internal-ness. Three cases kill the property reading:

1. **A teammate can address the person.** An unanswered permission request is the hardest case —
   an agent nobody addressed has no other way of reaching the user, and it is already an
   exclusion in `partnerWork` for that reason. A refusal is another. If *internal* were a
   property of "sent by a teammate", both would be folded away and the turn would stop with the
   reason invisible.
2. **A fan-out has two principals.** `@alice @bob` addresses both, and neither is the other's
   internal machinery. `runFrom` already carries `addressed` as a *set* for this.
3. **It is relative to the pane.** In Bob's own pane, Bob is not a teammate — his turn is the
   whole content, and none of it is internal to anything. The same events must draw differently
   in two places, which `itemsFor(pane)` already does.

So the rule is the one already written for settled items, stated once and applied in both halves:

> **Public is what was addressed to the person.** The prompt's `addressed` set names the
> principals; everything else in the run — mail, a partner's calls, a partner's prose — is
> internal and folds. What the principal said to the person comes back out, at any length.

That is not a new concept to design. It is `principal`, `partnerWork` and the `lifted` set, which
exist, are tested, and are simply not consulted anywhere in the live path.

## What this reopens

**Ticket 03's *one block per agent*, for the team pane only.** That decision was taken with one
agent in flight, where principal and speaker are the same thing, and this narrows it. Ticket 08
carries the narrowing; 03 has a pointer to it rather than a quiet contradiction.

It also **supersedes ticket 06's two candidates**. Both of them — lift the stranded call to the
foot of the column, or put a face back on it where it stands — assume the call is top-level and
argue about where. It is not top-level. It belongs inside the principal's block, and the question
06 was asking does not arise.

## Counter-arguments to answer

- **"Then a teammate's work is invisible while it happens."** True, and it is the real cost. It
  gets its own ticket (09) rather than being waved through here.
- **"A fold that fills while you watch is a number changing in a quiet column."** Also 09.
- **"The user asked for two kinds of message and this answers with one axis."** It answers with
  the axis that produces the two kinds, and produces them correctly in the three cases where
  naming them directly gets the wrong answer.

## Done when

One sentence in `DESIGN.md` says what makes a line public, and both `runFrom` and the live path
are described as reading it.
