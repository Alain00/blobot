Type: grilling
Status: resolved
Blocked by: 01

# May an agent schedule itself?

## Problem

The author's ask was specific: *"make that agents can make them."* This is the ticket that says
yes, no, or yes-with-a-gate, and it is a question about authority rather than about plumbing. The
plumbing is easy: one more tool beside `message_agent` on the loopback MCP server, whose bearer
token already *is* the caller's identity.

## What is binding, and it points one way

- **A peer carries no operator authority.** `envelope.ts`, said in the envelope rather than the
  persona so it survives a message trying to override it.
- **`.scratch/team-addressing/issues/03` refused relayed authority permanently**, and issue 02
  there killed the coordinator on exactly these grounds: *a router can only ever deliver weaker
  work than the same words addressed by the user.*
- **ADR-0003**: the palette is an allowlist built from *what a person authored*, never from a
  vendor's surface, and that is what makes it fail closed.

A stored, recurring, unattended turn is **more** authority than a peer message: it fires when
nobody can see it, it fires repeatedly, and it outlives the conversation that created it. A
channel that cannot grant peer authority cannot grant this.

That is the argument, and it is strong enough that the burden is on the other side.

## The other side, fairly put

The author is right that agent-authored automation is where the leverage is. A person who has to
compose every Routine by hand will write two. An agent that notices *"I do this every time"* and
offers to keep doing it is the actual feature, and refusing it outright leaves the ask unbuilt.

Also worth weighing: an agent already schedules *itself* in a weaker sense every time it calls
`message_agent`, and blobot permits that. The difference is the clock and the repetition, not the
initiative.

## The proposal

**An agent may propose; only a person arms.**

- A `propose_routine` tool on the loopback server, beside `message_agent`, bounded in
  `bounds.ts` like everything else there: a name, a prompt under a stated ceiling, one recipient
  which **must be the caller** (an agent proposing work for a teammate is fan-out with a delay on
  it, and that is a different ticket than this one), and a schedule.
- The proposal lands **disarmed**, and disarmed means it does not fire. Ever, until a person
  reads it.
- It surfaces where the user will see it, not as a notification they dismiss: issue 06 owns where.
- Arming is the only place authority enters, and it is a person's click, which is exactly how
  ADR-0003 keeps the palette closed.

This satisfies the author's ask — the agent makes the Routine — without granting an agent a
recurring unattended turn on its own say-so.

## Grill list

- Is a proposal a Routine row with `armed = false`, or a different thing? One table is simpler;
  two states in one table is how a disarmed Routine and an unreviewed proposal end up drawn the
  same, which they must not be.
- May an agent **disarm** or **delete** its own Routine? Disarming is strictly a reduction in
  authority and should probably be allowed. Deleting destroys a record the user armed.
- May an agent edit an armed Routine's prompt? Obviously not: that is arming by the back door.
  Worth writing down anyway, because it is exactly the shape a bug takes.
- What stops an agent proposing forty Routines? A per-turn and per-day cap in `bounds.ts`, the
  same way the wake batch caps at five.

## Answer

**Resolved 2026-08-30. An agent may propose a Routine. Only a person may arm one. A proposal
never fires.** *Reversed the same day by the amendment at the foot of this ticket, which is the
answer that is built. Everything below stands as the argument it was, and the amendment says what
outweighed it and what that costs.*

The argument from the binding rules stands and nothing in the grilling weakened it: a stored,
recurring, unattended turn is more authority than a peer message, and a channel that carries no
operator authority cannot grant more than it carries. The author's ask is satisfied all the same,
because the ask was *agents can make them* and an agent makes it. What an agent cannot do is give
it a clock.

### The tool

`propose_routine`, on the loopback MCP server beside `message_agent`, identified the same way —
the bearer token **is** the caller, so there is no `from` field to forge. Bounded in
`orchestrator/bounds.ts`, in that file's posture: **refused at the tool boundary, never
truncated**, the way a peer message over 4,000 characters already is.

- **The recipient must be the caller.** An agent proposing work for a teammate is fan-out with a
  delay on it, and that is a different ticket than this one. Refused by id comparison, not by
  prose.
- **One proposal per turn**, and **at most three unreviewed proposals standing per agent**. Both
  refused rather than trimmed, both for the reason the wake batch caps at five: the number nobody
  estimates correctly is the number of times a model will do a thing it can do.
- **The prompt is under the same ceiling as a peer message.** A Routine's prompt is text blobot
  itself injects on a schedule, which is the exact category `bounds.ts` exists to bound.

### The four questions from the grill list

- **A proposal is a Routine row with `armed = false` and `proposed_by` set**, not a second table.
  But it **must not draw like a disarmed Routine**: a Routine the user disarmed is a decision they
  made, and a proposal is a decision they have not made yet. Issue 06 already gives proposals an
  ink edge, two verbs and the top of the list, and that separation is now load-bearing rather than
  cosmetic — it is the whole of what keeps ADR-0003's fail-closed property here.
- **An agent may disarm its own Routine.** Strictly a reduction in authority, and the agent is
  often the first to know the instruction has gone stale.
- **An agent may not delete one**, armed or not. Deleting destroys a record a person acted on.
- **An agent may not edit an armed Routine**, and this is refused at the tool boundary rather than
  discouraged in prose, because arming by the back door is precisely the shape the bug takes. It
  may propose a **replacement**, which lands disarmed like any other proposal.

### The persona has to say it

The Codex adapter already tells its runtime, in words, that it has no subagents, because a
capability the model believes in and does not have produces confident lies about work that never
happened. This is the same hazard: an agent that proposes a Routine and is not told what happened
next will report to the user that the work is scheduled. The persona says that a proposal does not
run until a person arms it, and says it where the envelope says a peer carries no operator
authority — in the framing that survives contact with a message trying to talk it out of it.

### What this decides downstream

- Issue 06's proposal row is required, not optional.
- Issue 09 stores `proposed_by` as an agent id and never as free text.
- Issue 10 gains a scenario: an agent that proposes four Routines in one turn, and the fourth
  refusal reaching the model as an answer it has to account for.

## Amendment, 2026-08-30: an agent's Routine is armed when it is proposed

**The author reversed the answer above, having been shown the argument against it and the measured
cost, and reaffirmed.** *Reopened and rewritten* rather than worked around, per the repo rule that
a decision is contradicted on its own ticket or not at all.

**What is now true:** `propose_routine` writes a Routine with `armed = true`. It fires. The agent
may say it is scheduled, because it is. `Status: resolved` above now refers to this section.

### What was argued against it, kept because the reasons did not stop being true

The reasoning in the original answer is not withdrawn and is not wrong. It is **outweighed**, by
the author, on the grounds the *other side, fairly put* section already stated: agent-authored
automation is where the leverage is, and a proposal a person must go to another screen to arm is
one nobody arms. What has to be said plainly is what that costs:

- **A stored, recurring, unattended turn is still more authority than a peer message.** That has
  not changed; what changed is who is willing to grant it.
- **Issue 10's scenario 5 measured 72 turns overnight** for an hourly shape. An agent that arms an
  hourly Routine mid-conversation now spends that with nobody watching.
- **The proposal path is reachable from anything the model reads** — a file in the workspace, a
  page it fetched, a teammate's message. Under the old answer that produced an inert row. It now
  produces a running schedule. This is the real cost of the reversal and it is written here rather
  than discovered later.

### The four compensating controls, which are the price of the reversal

None of these are optional and none are prose. Each one is at the tool boundary or on screen.

1. **A person is told, where it happened.** An armed Routine opens **inline in the transcript**,
   in the turn that created it, saying what it is, what shape it has, what that shape costs, and
   carrying `disarm`. blobot has never interrupted the user and does not start; what it does is
   refuse to let this happen off screen. **An agent arming something silently is the version of
   this feature that must not exist.**
2. **The user has not looked at it until they have.** An agent-armed Routine keeps its ink edge
   and its place at the top of the Routines screen until a person has answered it, which is what
   `reviewed_at` now means. It is armed the whole time — the mark is *you have not seen this*,
   not *this is waiting for you*.
3. **The standing cap is re-based on what costs.** `ROUTINE_PROPOSALS_STANDING` counted
   *unreviewed* proposals, and under this amendment nothing is ever unreviewed in that sense, so
   the cap would have become dead at the exact moment it started to matter. It now counts
   **armed Routines this agent proposed for itself**, still three. Disarming one frees a slot,
   because a disarmed Routine spends nothing; discarding one frees it too.
4. **Everything an agent still may not do is unchanged.** It may not propose for a teammate, may
   not delete a Routine, may not edit an armed one, and may not exceed one proposal per turn. The
   per-run turn budget of three, the permission expiry, and the closed set of three shapes are
   untouched: this amendment moves *who arms it*, and nothing else.

### The persona and the tool description invert

Both said a proposal does not run and that only a person may arm one. Both now say the opposite,
for the same reason they said it before: **a capability the model is wrong about produces
confident lies about work that did or did not happen.** The hazard has not gone away, it has
changed direction — an agent that believes its Routine is inert will not mention that it armed
one, and the user will find out from a turn at 03:00.
