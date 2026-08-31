Type: grilling
Status: resolved
Blocked by: 01

# How does an agent record an entry?

## Question

The agent adds to its own Handbook. This ticket decides the mechanism and its bounds.

The plumbing is easy and already exists: one more tool on the loopback MCP server, whose
per-agent bearer token *is* the caller's identity, beside `message_agent` and `propose_routine`.
Everything difficult is about what the tool will and will not accept.

## What it has to settle

- **The signature.** One entry per call, or a batch? `propose_routine` allows one per turn, on
  the grounds that an agent proposing three things at once is an agent nobody read. The same
  argument may or may not apply to something that produces no turns.
- **How many per turn.** The charting settled there is **no numeric cap on entries held**, since
  the cost is context and context is tokens. A cap on entries written *per turn* is a different
  question and is still open.
- **The character bound, and where it is enforced.** `bounds.ts` refuses a peer message over
  4,000 characters **at the tool boundary rather than truncating**, and that is the shape here.
  Two numbers are needed: per entry, and the whole Handbook. The second is the one that matters,
  because it is what lands in the persona on every session.
- **What the agent is told when it is refused.** A refusal an agent cannot act on is a silent
  failure. `bounds.ts` has the precedent.
- **Whether an entry carries anything besides its text.** When it was recorded, and by whom —
  the agent or the user — is probably needed by the screen and by ticket 10. A topic or a tag is
  probably not, and is the road to a taxonomy nobody asked for.
- **Whether the tool exists at all when the Handbook is unbounded by a Workspace** — that is,
  on every team, or only where an interview happened. Recommendation: always, since the whole
  second half of the ask is the agent learning after day one.

## What is binding

- The tool is disclosed: an entry **opens inline in the transcript in the turn that created it**,
  carrying removal. That is settled; ticket 08 draws it.
- A peer carries no operator authority, so an entry recorded because a *teammate* said so is
  still the agent's own act and is recorded as such. There is no channel by which Bob writes into
  Mara's Handbook, and this tool must not become one — the bearer token already prevents it, and
  this ticket should say so out loud.

## Recommendation

One entry per call, at most one call per turn to start with, refused at the boundary in
`bounds.ts` beside the peer-message rule, with the entry carrying its text, its timestamp and its
author and nothing else.

## Answer

**`record_entry`, taking a list of entries, one call per turn, refused at the boundary against
two bounds.** Resolved 2026-08-31 with the author.

### A list, not one entry — and this reverses the charting recommendation

Charting proposed porting `propose_routine`'s **one per turn**. That is wrong here, and the
interview is why. An agent that has just been told the positioning, the ICP, the tone and who
signs off on copy would be able to record **one of them**, and briefing would become five turns of
an agent asking permission to keep listening. The cap that makes a Routine safe makes a Handbook
useless, because a Routine proposal is a *commitment* and an entry is a *note*.

So `record_entry` takes a **list**, and the per-turn cap is one **call** rather than one entry. It
bounds interruptions, which is what the Routine cap was really about, and it leaves knowledge
unbounded except by characters, which is where a context cost honestly belongs.

It also matches how briefing actually ends. Ticket 07's charting settled that the agent judges
when it has enough and writes it down; that is one act, and it should be one call and **one
disclosure block listing what was recorded**. Five separate blocks in one turn is the noise ticket
08 would then have to design around.

### The name

`record_entry`, published as `blobot` / `record_entry` — never `blobot_record_entry`, because
OpenCode prefixes the tool with the server name and would publish it twice.

It is **not `remember`**. Ticket 01 banned that word in blobot's mouth, and a tool description is
blobot's mouth. `write_handbook` implies replacing the thing. `add_to_handbook` is defensible and
was rejected on length: the definition is sent to every agent on every turn, so its characters
are paid forever, by every team, briefed or not.

### Two bounds, structure here and numbers later

Per **entry**, and per **whole Handbook**. The second is the one that matters, because it is what
lands in the persona on every session — and on fx, which has no persona channel and rides the
prompt, on every single turn.

- Both **refused at the tool boundary, never truncated**, in `bounds.ts` beside `tooLongToSend`.
  Half an entry with no marker is exactly the failure that function was written against.
- Each refusal names the number, the limit and **what to do instead**, because a refusal that
  does not carry the fix is a wall. That is the file's own posture and it is not restated here to
  be softened.
- **The whole-Handbook refusal is a new kind and should be written knowingly.** Every refusal in
  `bounds.ts` today has a fix the caller can perform: send the short version, pick a smaller file,
  disarm a Routine. This one does not. The Handbook is full, and the remedy is a **person**
  removing an entry from the pane. It is the first refusal in the app whose fix belongs to
  somebody who is not in the room, and its wording has to be honest about that rather than
  implying the agent can try again.

Provisional numbers, explicitly provisional so that *What a Handbook costs, under the gauge* is
choosing rather than ratifying: **1,000 characters per entry, 8,000 for the Handbook**, to be set
against a real Handbook from a real interview.

### What an entry carries

`text`, `createdAt`, and `author` — the user or the agent. Nothing else.

The author field is not bookkeeping. Ticket 10 needs to know whether a stale entry is something
the user said or something the agent concluded, because those do not deserve the same treatment.
Ticket 08's disclosure block only exists for the ones the agent wrote. A topic or tag was
rejected: it is a taxonomy nobody asked for, and a free-text tag is a field a model fills with a
word it invented.

### Advertised to every agent, always, with no switch

The tool definition is context, spent on every turn whether or not it is used, and this accepts
that cost deliberately.

A per-agent switch, on the model of `compaction` on the profile, was rejected. `compaction` earns
its toggle because it spends **money**, in a turn nobody started. `record_entry` spends
**context**, which is drawn in the gauge and removable in the pane. A switch whose off position is
already the resting state of every unbriefed agent is a knob for nothing.

Advertising it only *after* briefing was rejected as backwards: the interview is the tool's single
largest use.

### What is binding and needed no mechanism

**The bearer token is the identity**, so an agent can only write to its own Handbook. There is no
argument by which Bob could name Mara's, and no check needs to be built for it. This is the same
property that makes `message_agent`'s sender unforgeable, and it is why Q8's privacy decision in
charting costs nothing to enforce.

### Surfaced for ticket 08

A **refused** write reaches the agent and nobody else. The user never learns that their agent
tried to record something and could not, which matters most in the case the whole-Handbook bound
exists for. Added to ticket 08's body, since it is the same surface.

## Amendment, 2026-08-31, from ticket 09

**`record_entry` takes a source per entry: told, or noticed.** The answer above said an entry
carries `text`, `createdAt` and `author`, and left the author to be filled in. It cannot be.

The agent calls the tool in **every** case, including the one that looks like the user's: ticket 06
settled that *add one* in the panel opens the composer rather than a text field, precisely so that
`record_entry` stays the single path into a Handbook. So there is no call blobot makes itself, and
nothing from which an author could be derived. Inferring it from whether the user's message
contained an instruction is inference blobot does not provide.

So the field is the agent's to fill, described in plain words on the schema: *did someone tell you
this, or did you work it out?* An agent may answer wrongly. That is not this design's threat model
and does not need a mechanism: the block is on screen in the turn it happened, and a mislabelled
entry is visible and removable like any other.

A teammate telling an agent something records as **noticed**, never as told, because a peer carries
no operator authority. Ticket 09's persona clause says so.

This matters beyond the label. Ticket 10 has to decide what happens to an entry that is no longer
true, and *the user said this* and *the agent concluded this* do not deserve the same treatment.

## Amendment, 2026-08-31, from ticket 10

**`record_entry` gains an optional `replaces` per entry**, naming an entry this one corrects, so a
withdrawal and a write are one atomic call, one block and one line in the transcript. Two separate
acts could drift apart and leave a Handbook briefly saying both things or neither.

It applies only where ticket 10 allows a withdrawal at all: an entry the calling agent authored as
`noticed`. A `told` entry cannot be replaced by an agent.

**Consequence for the persona, which is ticket 04's block:** the entries have to be **numbered**, or
the agent cannot name the one it is correcting. Two or three characters per entry, on every session,
and on fx on every turn. That is the price of being able to correct anything, and it is paid
knowingly.

**And their dates are drawn**, short and absolute (`2026-03-11`), never relative. The persona is a
pinned cached prefix, and a relative age would invalidate that cache on every composition.
