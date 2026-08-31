Type: grilling
Status: resolved
Blocked by: 01

# Where does a Handbook sit in the persona, and what does an empty one say?

## Question

The Handbook rides the Persona and takes at the team's next start. This ticket writes the
composition: where the block goes relative to what is already there, how it is framed, and the
sentence an **unbriefed** agent reads instead.

## What is already in a persona, and why the order matters

`composePersona` folds in the role, the Workspace and AgentWorkspace paths, the roster, the rules,
and the AgentProfile's standing instructions — the last of which is *said as such*, so it is never
mistaken for this team's framing. A Handbook is the first thing that ever *is* this team's
framing, which means that sentence now has a counterpart and the two have to be legible side by
side. An agent that cannot tell which of two blocks travels with it will eventually say Vlue's
positioning to a different client.

## What it has to settle

- **Order and framing.** One block, headed and introduced in blobot's own words, saying what a
  Handbook *is* — knowledge about this team's work, given to you here, which does not follow you
  elsewhere.
- **The empty state.** Settled in charting as: it says the Handbook is empty and that the agent
  should ask. Explicitly **not**: silence, which makes ticket 02's wordless turn produce nothing;
  and explicitly not *ask before doing substantial work*, which interrogates someone who just
  wanted a task done. The exact wording is this ticket's, and it is the sentence that makes the
  whole interview happen.
- **How it reads on each of the four adapters**, without any of them knowing it is special.
  Claude and OpenCode take it on `session/new`. Codex stores it on the session, so an edit does
  not take on a resume, which is codex issue 06 and is *accepted*, not worked around. fx has no
  persona channel and rides the prompt every turn, so the block is paid for per turn there — that
  is fx's own cost and it belongs to fx's adapter.
- **The handoff.** Compaction opens a fresh session and composes a fresh persona, so the Handbook
  arrives there by itself. The handoff prompt should therefore say **not** to restate it, since
  paying twice for the same knowledge in the most expensive turn available is exactly the kind of
  waste the 6,000-character handoff limit exists to catch.

## Recommendation

Its own block, after the role and before the rules, introduced by one sentence that names the
scope and contrasts it with standing instructions by name.

## Answer

**Immediately before standing instructions, as one block composed by `composePersona`, with a
conditional empty state that is the whole trigger for briefing.** Resolved 2026-08-31 with the
author.

### Where, and why it is a question about rank

`composePersona` ends with standing instructions, and the comment there is explicit that this is
deliberate: putting them last is *what makes them the user's last word*, so that somebody who
writes "explain your reasoning in full" beats blobot's own prose defaults rather than silently
losing to a sentence they never wrote.

So the Handbook could not simply be appended. It goes **immediately before** that block, which
does two things at once:

- The two sit adjacent, and the layout states the contrast the word was chosen for: *what is true
  of this work*, then *what is true of you, and you win.*
- **An entry the agent wrote never outranks a sentence the user wrote.** That is a rank worth
  having on its own, and here it falls out of the placement instead of needing a rule.

Rejected: high up beside the role (separates the pair and buries the contrast), and after standing
instructions (demotes the user's last word to second-last, which is the one thing that comment
forbids).

### The empty state, which is the entire mechanism

One sentence in a cached prefix has to produce two opposite behaviours. Pressing the pane's
control wakes the agent with no words, and it must open the conversation. Typing *"draft the
launch email"* must produce a launch email and not an interview. The resolution is to name the
trigger explicitly rather than to describe a mood:

```
Your Handbook for this team is empty. Nobody has told you about the work here yet.
If you are started with nothing to do, introduce yourself and ask about the work: what it
is, who it is for, and what you would need to know that is not in the files. If you are
given work, do the work.
```

Unconditional wording was rejected: it interrogates someone who wanted a task done, which is the
failure this design has steered around since charting. Silence was rejected because it reopens the
decision that no blobot words enter the conversation, by forcing the control to send a real prompt.

**This also gives ticket 02 its fallback.** The conditional is what does the work, not the
emptiness of the prompt. If a runtime turns out to refuse a genuinely wordless turn, a minimal
filler prompt still lands against a sentence that already knows what to do with it, and the
research ticket is choosing a mechanism rather than rescuing a design.

The non-empty block is the same shape, naming the scope in its first clause:

```
Your Handbook for this team, which is what you have been told about the work here. It does
not follow you to any other team you are on.
- <entry>
- <entry>
```

### `record_entry` is described inside the Handbook block

Not as a fifth bullet in the teammate-rules list. That list is titled *how working with them
actually works* and is about teammates; `propose_routine` sitting in it is arguably already a
stray, and adding a second unrelated tool would make the heading a lie. One subject per block,
at the same character cost.

**What that sentence says is ticket 09's**, which owns the test an agent applies. This settles only
that the slot is there and where it is.

### One string, from `composePersona`, with no adapter changes

The entries become a parameter on `composePersona`, which stays pure and reads no store. Every
adapter is untouched and all four runtimes carry the Handbook by whatever mechanism they already
use for a persona.

A separate string that adapters position themselves was rejected. Its only argument is that fx,
whose persona has no channel and rides the prompt on every turn, pays for the Handbook per turn
rather than per session. That is fx's own cost, exactly as its persona already is, and letting an
adapter treat the Handbook specially is provider-specific behaviour above the adapter in
everything but name.

The known consequences are accepted rather than worked around, and they are the ones the runtimes
already have: Codex stores `developer_instructions` on the session, so an edited Handbook does not
take on a resume (codex issue 06); Claude and OpenCode re-supply on a fresh session; ADR-0002's
rule that a change takes at the team's next start is what the app already says.

### The handoff does not restate it

One clause in the compaction handoff prompt telling the agent not to repeat its Handbook.

An agent writing a handoff under a 6,000-character limit that spends 1,500 of them repeating
entries has burned the most expensive turn in the app on knowledge that was never at risk. It is
safe to promise because **the fresh session's persona is composed by the same function from the
same entries**: nothing is being dropped in the hope it is recoverable, it is simply already
there.
