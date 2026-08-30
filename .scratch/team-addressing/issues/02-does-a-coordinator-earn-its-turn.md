Type: grilling
Status: resolved
Blocked by: 01

# Does a coordinator earn its turn?

## Question

Should a team always have an agent whose job is to receive the user's message, decide who does
what, and hand out the work?

The appeal is real and is stated in `spec.md`: a coordinator is the compact-context answer to
group chat. What follows is the case against, which has to be answered before it is built.

## Delivery stops being a guarantee

Ticket 05's hardest rule is **ack means committed**, written against the failure where Alice is
certain she told Bob and Bob never heard, and neither can detect the gap. A router reintroduces
that failure one layer up and one layer worse: the user is certain they told the team, the
coordinator read the message and never called `message_agent`, and no ack anywhere is false.
Today delivery is a store guarantee. With a coordinator, delivery becomes an LLM's judgment.

See issue 05: this is the trap the mock has to reproduce on purpose.

## It serializes the team

A session runs at most one Turn at a time (`CONTEXT.md`). Route everything through one agent
and two workers finishing at once both queue behind the coordinator's mailbox. That is a lock
at the coordination layer of a system whose premise is agents working simultaneously, and the
demo's own hero image is two blobatars busy together.

## The turn budget stops meaning what it means

`turnBudget` is N agent turns per user prompt, default 10, and it is the only mechanism that
bounds cost. Coordinator in, worker out, reply back through the coordinator is three to four
turns for one round trip. Three real tasks and the team halts and asks. If a coordinator lands,
the default has to be re-derived rather than inherited.

## Single point of failure, and a context ceiling

`Orchestrator.start()` deliberately leaves a runtime that cannot start as one `failed` agent
with the rest of the team working. A coordinator makes its own failure mute the whole team.
Its session also accumulates every message the team exchanges, so it reaches its context limit
first, and blobot deliberately owns no compaction.

## A workspace it never uses

One AgentWorkspace per Agent per Team. A pure coordinator gets a worktree on
`blobot/<team>/<coordinator>` that is branched, reconciled and deleted for an agent that never
opens a file.

## The alternative this effort recommends

**Coordinator as a role on an existing agent, not a dedicated extra one.** The lead from issue
01 both routes and works. No wasted workspace, and no wasted turn when the request was for them
anyway, which is the common case on a small team. The cost is one session mixing coordination
context with work context, and that is the thing to measure rather than argue about.

## What to settle

- Dedicated agent, role on the lead, or neither.
- Whether "always" is right. A two-agent team with a coordinator is three agents to do the work
  of two.
- What the coordinator does with a reply. Ticket 05 refused to auto-route Bob's final message
  back to Alice, because it reintroduces synchronous delegation. Routing replies back through a
  coordinator is the same move wearing a different hat and needs the same scrutiny.
- Whether a coordinator is visible in the transcript as a third voice or is meant to disappear.

## Done when

The answer says which shape is being built and what it costs per user prompt in turns, or says
the ergonomic in issue 01 was the whole ask and closes this.

## Answer

**No coordinator, in any shape.** Grilled with the author 2026-08-30, five rounds, and the
ticket's own question turned out to be the wrong one.

### The ask was fan-out, and a relay is the wrong instrument for it

The concrete thing missing after issue 01 is not triage — on a team you assembled yourself you
know who Bob is — it is that **one sentence puts one agent to work**, and the demo's hero image
is two blobatars busy at once.

Then issue 03's question was answered in the same session, and it decided this one:
**relayed authority is capped at peer, permanently.** The envelope's "from a teammate, not the
operator" is never lifted, the way the palette fails closed. From which:

> A coordinator can only ever deliver **weaker** work than the same words addressed by you.

So a router's whole case rests on convenience, never on capability — and it buys that
convenience for three to four turns of a budget of ten, a lock at the coordination layer of a
system whose premise is agents working at once, a session that accumulates every message the
team exchanges, one failure that mutes the team, and a worktree for an agent that never opens a
file. Against a baseline that costs none of those:

### Fan-out is multi-mention

`@alice @bob the checkout page double-charges` commits **one message row per named agent**,
each carrying the user's own words with the user's own authority, each landing in exactly one
session, waking both. No new agent, no model turn, no relay, no workspace. Ticket 05's
"a message lands in exactly one agent's session" is untouched: there are two messages.

This required amending `spec.md`'s *Out of scope: broadcast*. What that line forbids is one
message going to **the team** implicitly, which is the surface ticket 12 removed. Naming two
agents is neither implicit nor the team, and the boundary is now written there.

### The rules that came out of it

- **Recipients are the leading run of mentions.** Mentions before the first ordinary word
  address the message; a mention later in the sentence is a reference. This **replaces "last
  valid mention wins"**, which is a decision of ticket 12 and therefore its second reopen.
  `ship it @bob` stops working, knowingly: two rules to keep one hours-old behaviour is worse
  than one rule.
- **The whole message goes to each recipient**, mention tokens and all. Splitting
  `@alice do the UI, @bob do the API` into clauses is us deciding which half is whose, which is
  inference; and Bob seeing what Alice was asked is what stops him doing it twice.
- **No reply routing.** Ticket 05's refusal stands: answers land in the transcript.
- **The lead stays pure addressing.** No persona line, no envelope change, never CC'd onto a
  fan-out. A persona is composed at session start, so making the lead a persona fact would mean
  changing who leads restarts a team — a strange price for a designation flipped while reading
  the rail.
- **The budget is unchanged.** Three agents named is three of your ten, and a team that halts
  after three tasks is the mechanism working.

### Decided and deliberately unbuilt

**A turn that only routes should not count against `turnBudget`** — defined by what it did (it
messaged and said nothing else), never by who did it, or an agent gets an unmetered budget for
real work by virtue of a title. With no coordinator the only turn that qualifies is a peer's,
and nothing in this answer spends it. Recorded here so the next person finds the decision rather
than the question.

### What it costs per user prompt, in turns

One per agent you named, and nothing else. That was the number this ticket asked for.

### Built, same day

`promptFromUser` takes a list. One read of the clock for the whole fan-out, every row committed
before any turn starts — a turn can message a teammate mid-flight, and a recipient not yet
written to would take that wake *before* the user's own words. The budget resets once.

The composer resolves the leading run (`addressedBy` in the renderer's `model.ts`), the field
draws three states rather than two — addressing, naming, unresolved, because an underline that
means "this is going to them" must not sit over a name only being talked about — and the send
control carries `Alice, Bob +1`.

The team pane draws the rows as the one bubble that was typed (`oneBubblePerThingTyped`), which
is the **view** grouping what the store rightly keeps apart. An agent's own pane is filtered
first, so it still sees one message addressed to one agent, which is what it is from there.

Covered: six cases on `addressedBy` including the trailing-mention loss, four on the grouping,
two in the orchestrator (a row each with one timestamp and both agents running; two of the ten
turns rather than a reset each), and six on the composer. Seen on screen: the demo prompting
both agents, drawn as one bubble tagged `TO ALICE, BOB`.

Not built, by decision: the free routing turn, and issue 05's detection.

## Reopened, 2026-08-30: the lead delegates after all

Raised by the author, working with a team: the lead this effort left behind *"means nothing — he
delegates no work, and does not operate as a lead."* Charted at issue 06.

**The grounds are the arrow, not the argument.** Every objection above is about work flowing
*user → lead → team*. The outbound direction — a lead you ask *about* the team — was never
weighed here, and it relays nobody's authority, delivers nothing, spends one turn, mutes nothing
when it fails, and accumulates only what was sent to it.

What survives untouched, and constrains issue 06 rather than blocking it:

- **Peer authority is permanent.** Issue 03 is not reopened. The lead is told this about itself
  so it asks rather than orders.
- **No reply routing**, no dedicated coordinator agent, no change to fan-out.
- **The lead is never a pipe.** `@bob` still lands on Bob. That is what keeps the serialisation,
  the single point of failure and the context ceiling from being real here.
- **The routing-turn exemption this ticket decided and left unbuilt** is what issue 06 builds,
  to the literal definition recorded above.

What does change: *"The lead stays pure addressing. No persona line, no envelope change"* is now
false in its second half. The lead fact travels in the **envelope**, which is what this ticket's
own reason asked for — a persona fact would mean changing who leads restarts a team.
