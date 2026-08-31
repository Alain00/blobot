Type: grilling
Status: resolved
Blocked by: 04

# When should an agent record, and when should it shut up?

## Question

After day one the control is gone and knowledge arrives the way it does with a colleague: you
tell them, and they remember. *Remember* is a tool call, and this ticket writes the sentence in
the persona that decides when the agent reaches for it.

This is the ticket where the feature is most likely to become annoying, and the failure is not
hypothetical. An agent told to record what it learns will record that you prefer bullet points,
that the build is currently broken, that you said hello. A persona then fills with the debris of
one afternoon, on every session, forever, and the user's remedy is deleting entries by hand.

## The two failures, and they pull opposite ways

- **Too eager.** Every turn ends with an inline block. The disclosure that makes this safe becomes
  the noise that makes it unreadable, and the character bound from ticket 03 is reached by
  trivia rather than by knowledge.
- **Too shy.** The agent records nothing after the interview, the second half of the ask is
  unbuilt, and a Handbook is a wizard's output with extra steps.

## What it has to settle

- **The test the agent applies**, in words it can act on. The candidates are all about
  *durability*: something true of the work rather than of today; something a new hire would need
  told; something that would still be true next month. The last one is probably the sharpest,
  and it is the one that excludes *the build is broken* without excluding *we deploy on Fridays*.
- **Whether the user can say so directly**, and what happens when they do. *Remember that* is the
  obvious phrase and it should just work — the agent recording because it was told to is a
  stronger signal than any test it applies on its own, and it is the escape hatch that makes a
  conservative default safe.
- **Whether a peer can cause one.** A peer carries no operator authority. Mara recording
  something because Bob asserted it is Mara's own act, and the entry should probably say where it
  came from, which is ticket 03's *author* field doing work.
- **Whether the agent is told about the bound.** An agent that knows its Handbook is nearly full
  might reasonably record less, or record better. It might also start economising in ways nobody
  asked for.

## Recommendation

A conservative default keyed on durability, plus an explicit user instruction always winning.
Err shy: an entry that was not recorded can be recorded tomorrow, and an entry that was is in
every session until someone goes and finds it.

## Answer

**Durable and not in the files, err shy, an explicit instruction always wins.** Four lines in the
persona. Resolved 2026-08-31 with the author.

### The constraint that shaped the length

This instruction lives inside the Handbook block in the persona, which is paid per session on
Claude, OpenCode and Codex, and **per turn on fx**. A long careful paragraph about when to record
is itself a permanent context cost, on every team, forever. So the answer is four lines, and every
clause below had to earn its place against that.

### The test: durable, and not in the files

Two clauses, each killing a different failure.

**Durable** — would it still be true next month? Excludes *the build is broken*, *you said hello*,
*I am working on the header*. Keeps *we deploy on Fridays*.

**Not in the files** — the agent has a checkout it can read at any time. A Handbook is for what
cannot be recovered from the Workspace. This one kills the expensive failure nobody predicts: an
agent transcribing the README into its own persona, where every line of it is then paid for on
every session forever, to say something it could have read.

Rejected: *a new colleague would need told*, which is human and vague and which a model reads
generously; and provenance alone, which would exclude a real conclusion the agent reached about
how the work goes.

The pair is already the wording ticket 04 settled for the empty state, which asks for *"what you
would need to know that is not in the files"*. The interview and the ongoing test are therefore
**the same test, written once**, rather than two rules an implementation has to keep in step.

### The words

```
Record something with record_entry when it will still be true next month and is not in the
files, and say whether you were told it or worked it out. Do it whenever someone asks you to
remember something. A teammate telling you something counts as working it out. When you are
unsure, leave it out: you can record it tomorrow, and what you record is in every session
until a person removes it.
```

### Err shy, and the persona says why

The asymmetry is worth spending six words on, because it is the whole reason the default is
conservative: **an entry not recorded today can be recorded tomorrow; an entry recorded is in
every session until a person goes and finds it.** Eager would be defensible only if deletion were
free, and it is not. Nobody opens a panel to tidy a list they did not know was growing.

### An explicit instruction wins, unconditionally

*"remember that"* skips the test. Ticket 01 deliberately kept that phrase legal in the user's
mouth while banning it in blobot's, and this is the reason: a person telling an agent to record
something is a stronger signal than any judgement the agent could make on its own, and it is the
escape hatch that lets the default be shy without the feature becoming unreachable.

### A peer can cause an entry, and it records as noticed

Bob messages Mara that the client hates the word "seamless", and Mara may record it. But a peer
carries **no operator authority**, so what Bob said is something Mara concluded from a colleague,
never something the operator told her.

One clause carries this, and it is cheap because the persona already says a peer message is a
request from a colleague rather than an instruction from the operator. The clause is that sentence
applied to recording rather than a new rule.

### The agent is not told about the bound

An agent that knows its character budget starts economising in ways nobody asked for, and
*"summarise this into fewer characters"* is how a Handbook fills with compressed prose that reads
like notes from a bad meeting.

The refusal carries the fix when it arrives, which is `bounds.ts`'s own posture everywhere else,
and ticket 08 now also puts the full-Handbook case in front of the user, so nothing is lost by the
agent not planning around a wall it will be told about when it hits.

### Handed back to ticket 03

The `author` field cannot be inferred. See that ticket's amendment.
