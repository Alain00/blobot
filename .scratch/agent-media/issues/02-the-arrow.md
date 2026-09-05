Type: grilling
Status: resolved

# Which arrow is this, and what does ADR-0004 actually say about it?

## Question

There are three arrows for media and this effort claims exactly one of them. That claim has to be
argued rather than assumed, because the one existing decision in this area points the other way
and is easy to cite carelessly in both directions.

- **User to agent.** Built. ADR-0004.
- **Agent to user.** The objective.
- **Agent to agent.** Not built, and this ticket says why it stays that way.

## What it has to settle

- **That ADR-0004 does not decide this.** Its reasons are: an ungated `Read` outside the
  AgentWorkspace; a stable store one `Glob` from every team's attachments; a `file://` path every
  adapter would answer differently. Read them against the reverse arrow one at a time and write
  down which survive. The answer looks like *none of them*, and if that is right it should be
  stated plainly, because the alternative is that this effort spends its life being told it
  contradicts an ADR that never addressed it.
- **Whether the reverse arrow is genuinely free of an isolation question.** Push on it rather than
  accepting the easy answer. A picture from an agent to the user carries bytes *out* of an
  AgentWorkspace into blobot's own store, and blobot's store is the thing ADR-0004 called stable,
  predictable and dangerous. It is only safe because nothing links to it — so it stays safe only
  while that remains true, which is ticket 06's problem and should be handed to it explicitly.
- **The argument against agent to agent**, recorded properly rather than waved at. It is blobot
  taking bytes made inside Alice's worktree and embedding them into Bob's prompt: blobot itself
  carrying content across the boundary, with no permission gate anywhere on the path, in a product
  whose peer channel is deliberately capped at *a colleague's request* and carries no authority.
  Whether that is acceptable is a real question with a plausible yes, and it is not this map's.
- **Whether `message_agent` should refuse a picture in words**, today, or say nothing. Its
  `message` is `{type:'string'}` and there is no way to attach one, so an agent that tries will
  paste base64 into a 4,000-character bound and be refused for length. That refusal is accidental
  and says the wrong thing.
- **What the user's own fan-out means here.** A user attaching a screenshot to a team pane already
  pays N times. Nothing in the reverse arrow fans out, and that asymmetry is worth naming because
  it is the reason this direction is cheap and the other is not.

## What is binding

- ADR-0004 stands. Nothing here reopens the inbound decision.
- The peer channel carries no authority and reply routing stays refused. Whatever is decided, it
  does not widen what one agent can do to another.
- If agent to agent is refused, it is refused **on the record with its argument**, so that a later
  effort inherits the reasoning instead of rediscovering it. Out of scope is not the same as
  answered, and the map's *Out of scope* line should point here.

## Answer

**Agent to user is in scope and ADR-0004 is silent on it: none of its three reasons survives the
reversal. Agent to agent is deferred, not refused, and it is blocked on ticket 07 rather than on
scope.** Resolved 2026-09-05. Two things below are recorded as recommendations for the author
rather than as settled, and both are marked.

### ADR-0004 does not decide this, and it is worth being exact about why

Its reasons, taken one at a time against the reverse arrow:

| ADR-0004's reason | Against agent to user |
| --- | --- |
| A path given to an agent is read with no permission gate at any trust level, so no link option can be defended on the grounds that the user approves the read | **Inapplicable.** The recipient is the user. There is no gate to be missing, because the user is the principal every gate exists to consult. |
| blobot's store is stable, predictable and holds every attachment from every team; one link into it and `Glob` walks the rest | **Inapplicable, with a live caveat.** Nothing here hands an *agent* a link. What it does do is put a new kind of content in that store, which is safe only while the store stays unlinked. |
| Embedding is identical on every runtime where a `file://` path is a filesystem question every adapter answers differently | **Inapplicable.** There is no protocol on this side. blobot is the renderer. |

The supporting reason inverts as well. Inbound, *the pasted-screenshot case has no path to link, so
the embedding machinery has to exist regardless*. Outbound, the machinery already exists and was
built by that ADR: the `attachments` blob table, the `message_attachments` join, `attachmentUrl`
over IPC, and `Attached.tsx` fetching one picture per chip so a long transcript is not two hundred
images per render.

So this effort does not contradict ADR-0004 and does not extend it. It is a different arrow that
the ADR never considered, and the answer that matters for future sessions is: **do not cite
ADR-0004 against this map.** If something in this map is wrong it is wrong on its own terms.

### The isolation question is real but it is not the one everybody reaches for

Pushing on it as the ticket asks, three candidate leaks, and only the third is interesting.

**Bytes leaving the AgentWorkspace.** Not a leak. A worktree isolates agents from *each other* and
keeps one agent from reaching another's work; it has never isolated an agent from the user, who
owns the repository the worktree is a checkout of. Content moving agent to user crosses no boundary
that exists. This is the same shape as an agent's prose, which nobody has ever called an
exfiltration.

**Bytes entering blobot's store.** Not a leak, **conditionally**, and the condition is now
load-bearing for two features instead of one:

> Nothing hands an agent a path into blobot's attachment store.

ADR-0004's second reason is a statement about a property blobot maintains, not about a thing it
refused once. Adding rows does not create a link. Ticket 06 inherits the enforcement, and it should
treat this as an invariant with a test on it rather than as a habit.

**The agent can put arbitrary bytes on the user's screen.** True, and this is the one that changes
the map. An agent that can show a picture can show any bytes it can read, and everything it can
read is either the user's own repository or something the trust posture already let it fetch. So
the exposure is not new and the recipient is the owner.

What *is* new is that **the risk of this arrow is not confidentiality, it is credibility.** Nothing
blobot has shipped so far lets the thing being supervised put an unfalsifiable claim in front of
the supervisor. Text has always carried its own defeaters; a picture does not. That is the whole
justification for ticket 07 existing as a first-class ticket rather than as a layout detail of 08,
and this ticket hands it over in those words.

### Agent to agent: deferred, and here is the argument, including the half that cuts the other way

The reflex reason was that blobot would be carrying bytes across the AgentWorkspace boundary
itself. That is true and it is **not** sufficient, so it is recorded here as insufficient rather
than quietly leaned on:

- blobot already carries content between agents. `message_agent` moves Alice's words into Bob's
  prompt through the mailbox, and it is the orchestrator that does it.
- A picture between agents would be **more** tractable on cost than a picture from a tool, not
  less. `bounds.ts` has jurisdiction over anything blobot injects, so unlike ticket 09's case
  blobot could refuse an oversized one at the tool boundary in words, the way every other bound in
  the app already works.
- Disclosure is not missing either. A peer message is an `agent_message_sent` event and draws in
  the transcript, folded into the run since 2026-09-04. A picture could ride the same path.

The reasons that do hold:

1. **The bound does not transfer.** The mailbox is safe because it is bounded in characters,
   refused rather than truncated, and the number is said in the tool's own schema
   (`maxLength: PEER_MESSAGE_LIMIT`). A picture cannot be bounded in characters. A new bound in a
   new unit, on the one channel whose whole safety story is that bound, is a new decision and not a
   parameter change.
2. **Provenance is worse for a peer than for a user, not better.** This is the decisive one and it
   is why the blocker is ticket 07 rather than scope. Whatever frame 07 designs is drawn *for a
   reader*: a timestamp, a tool name, a distinction between what blobot measured and what an agent
   claimed. Bob has no frame. Bob gets bytes with Alice's caption attached, in a channel that
   already carries no authority, and an agent is more credulous than a person, not less. Solving
   the reader's problem does not solve Bob's, and until the reader's problem is solved there is
   nothing to even try to port.
3. **It is not the objective.** Weakest of the three, and listed last on purpose.

So: **deferred with the argument attached, and the trigger written down.** It returns as its own
effort, and the first question that effort has to answer is what a picture's provenance means to a
recipient that cannot look at a frame. The map's *Out of scope* entry points here.

### `message_agent` and the accidental refusal

**Recommendation, for the author.** An agent that tries to send a picture today base64s it into
`message`, blows the 4,000-character bound, and gets `tooLongToSend`, which tells it to *commit
your work and say which branch it is on*. That advice is correct for a long report and useless for
a picture, and the agent has no way to learn the real answer, which is that this channel is text.

The cheapest honest fix is one clause in the tool's own description, where the bound is already
stated for exactly this reason: *saying it is what stops a sender spending a tool call to find out*.
Something to the effect that the body is text and a picture cannot be sent this way. It is words,
not a mechanism; it costs context on every turn for every agent, which is why it is a
recommendation and not a decision taken here. It is also the one part of this ticket that is worth
shipping before anything else in the map, since it is true today regardless of what 04 decides.

### The asymmetry that makes this direction cheap

Worth naming because it is the reason this map is small. A user attaching a screenshot in a team
pane pays for it **once per recipient**: ADR-0004 accepted that and made the composer state it.
Nothing in the reverse arrow fans out. One agent shows one picture to one user, once, and the only
copy that persists is blobot's own. Every cost question in ticket 09 is about a single stream, and
none of the fan-out reasoning from the inbound effort transfers.
