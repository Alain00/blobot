Type: grilling
Status: resolved

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

## Answer

**The axis is adopted. One sentence in the proposal is struck and one word in it is changed.**

### Struck: *"they exist, are tested, and are simply not consulted anywhere in the live path"*

They cannot be consulted. `runFrom` terminates on the first unsettled item belonging to anybody
in the run — `settledWork` for the principal, `partnerWork` for a teammate, and both of them
return false for `running` and `asking`. The run boundary the settled path computes is *defined*
to end exactly where the live region begins. There is no reading of it that reaches into a turn
still happening.

So 08 is not "make the live path read `addressed`". It is **compute the run boundary once, over
settled and unsettled items together**, and let the two halves render the same run at two
altitudes. That is a larger change than 07 implied and the map should say so.

**And this is the deeper cause of 06,** which blames `liveTailOf`'s trailing-run heuristic alone.
06's own screenshot carries the evidence nobody read back off it: there are **two folds** around
the stranded line, `RAN 16 TOOLS · 1 FAILED 🔵 Bob` above it and `RAN 5 TOOLS · 1 NOTE` below.
That second fold is not the live tail's doing — it is `rowsOf` breaking Alice's run at Bob's open
call and opening a fresh run after it. Lift the stranded line out of the settled rows and that
half is still wrong: one turn drawn as two records with a hole where the live work was.

06's *done when* is therefore necessary and not sufficient. 08 has to fix the settled side in the
same change, and its test is not only "no call outside a face's block" but **one turn, one fold**.

### Changed: *who it was addressed to* → *who can act on it*

"Internal folds" is false as a universal, and 10's list is not a set of exceptions bolted onto
the rule — it is the rule's second clause, and writing the rule without it makes 10 look like
patching.

Take 10's three hardest entries against the addressing reading:

- A teammate's **permission request** was addressed to nobody. Under "who it was addressed to" it
  has no answer at all, and the safe default for an unaddressed thing in a partner's stretch of
  the run is *fold*, which is the exact failure the whole ticket exists to prevent.
- A **refusal** is addressed to the agent that mailed it. Strictly internal, and strictly
  something the person has to see.
- A **fatal error** is addressed to no one. The agent is dead; `ran 3 tools` over it is a false
  summary.

All three are public, and all three for one reason: **the only party who can act is the person.**
For ordinary prose the two readings coincide — an answer to you is a thing only you can act on,
a reply to Alice is a thing Alice acts on — which is why the addressed set stays the thing the
code actually reads. It is the cheap and correct proxy in the case that occurs a thousand times
to the other's once. It is not the rule.

The rule, one sentence:

> **A line is public when the person is the only one who can act on it** — which for prose means
> it was addressed to them, and otherwise means nobody else in the run can answer it. Everything
> else the turn had to arrange is internal, and folds.

### Upheld, and cheaper than the proposal claimed

**Clause 3, *internal is relative to the pane*, costs nothing and is already true.** `itemsFor`
filters before `rowsOf`, so in Bob's own pane the user's `@alice` bubble is filtered out entirely,
`addressed` never gets set, and `runFrom`'s *nothing addressed means every speaker is a principal
candidate* branch already makes Bob his own principal there. The proposal presents this as a
requirement to design; it is a property the existing filter order gives away. Verified by reading
rather than by test, so 08 should pin it with one.

**Clause 2, the fan-out, is upheld.** `runFrom` breaks on `principal !== speaker`, and both
members of an `@alice @bob` are in `addressed`, so neither can become the other's machinery
whichever of them mails the other first.

### What this closes

The map's fog item *"whether a lead's turn is a third case"* is closed by the axis, in the
classification half at least. A lead is who the prompt addressed, `composeLeadBrief` already says
a lead is not a pipe, and the teammates it woke are partners. It is an ordinary principal and
nothing about it is a third kind. What remains unchecked is the *shape* the fold takes when a
lead wakes four agents at once, which is 09's problem and not a classification one.

### Found on the way, and not 07's to fix

`addressed` is reset by **every** `user` item, and a Routine firing draws in the user's voice. So
a Routine that fires for Bob while Alice is mid-turn on a prompt the person actually typed
silently reclassifies Alice as Bob's partner and merges two causally unrelated turns into one
fold. This is in the settled path today and is not introduced by anything here. Recorded on the
map.

### A note for 10

10 lists a Routine proposal and a Handbook write under *what must come out*. `CLAUDE.md` says
both **open inline in the turn that created them**, in `Compaction`'s collapsed shape — which is
disclosed *inside* the run, not lifted to the top level beside the principal's answer. They are a
third category: **visible without being public.** 10 should say which of its five entries are
lifted out of the block and which are merely never collapsed inside it, because those are two
different mechanisms and only the first of them has a place to go.

### Done

`DESIGN.md`'s transcript section carries the sentence, under a new **The live half of a run**
paragraph that also writes down ticket 03's block, which was built and never recorded there.
