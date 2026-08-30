Type: task
Status: resolved
Blocked by: 01

# The lead leads

## Problem

Raised by the author, 2026-08-30, working with a team: *"messaging the lead of a team, today,
means nothing. I'm doing work right now and he delegates no work, and does not operate as a
lead."*

That is accurate, and it is the shape issues 01 and 02 left behind between them. Issue 01 built
`teams.lead_agent_id` as **pure addressing** — the implicit recipient of the team pane. Issue 02
then refused a coordinator in every shape and stripped the role to the bone on the way out:
*"The lead stays pure addressing. No persona line, no envelope change, never CC'd onto a
fan-out."* So the agent is never told it leads, nothing routes through it, and fan-out goes
around it. The only behaviour behind the word is that it saves four keystrokes.

The word claims a rank the app does not implement. This repo removed `to Alice ▾` from the
composer because a control implied a surface that did not exist; `WHO LEADS` and `led by Alice`
are the same failure in words.

**The author's answer is that the lead should be real**, and should do two jobs: **report on the
team** and **delegate work**.

## What this reopens, and on what grounds

**Issue 02, on its central answer**, and **issue 04, on its whole premise.** Both are reopened
by this ticket rather than contradicted by it. Neither reversal is free and the grounds are
below.

### 02 was decided against the inbound arrow only

Every objection issue 02 raised is about work flowing *user → lead → team*: delivery becomes an
LLM's judgment, the team serialises behind one mailbox, three to four turns of a budget of ten
per round trip, one failure mutes the team, one session accumulates every message the team
exchanges, and a dedicated coordinator holds a worktree it never opens.

The **outbound** arrow — a lead you ask *about* the team — was never weighed. It relays nobody's
authority, delivers nothing, spends the one turn you asked for, mutes nothing when it fails, and
accumulates only what you sent it. The dedicated-agent objection never applied to the lead at
all, since the lead is a working agent with a workspace it uses.

### 04's premise was "nobody needs to see"

Issue 04 closed with *"There is no router. Nobody's job is to decide who should do a thing, so
nobody needs to see what everybody is doing"*, and ended: *"If a coordinator ever returns, this
ticket returns with it and the ack is where it starts."* This is that return. Its actual finding
— **a router that cannot see status will hand work to a busy agent** — was never disproved and
is now load-bearing.

### The two jobs are one build

The reporting half is the delegating half's eyes. A lead that can answer *"where are we"* is
reading exactly the facts a lead needs in order to decide *"who should do this"*. There is one
mechanism here, not two features.

## What is being built

### 1. The lead can see the team, and it is blobot's own record

Not another agent's session and not another agent's worktree. The roster, each teammate's role,
and each teammate's status from the fold — facts blobot already holds in the orchestrator
process, in the same class as the roster line that has travelled in the envelope since ticket 06.
No worktree reading, no session reading, no new persisted state.

**In the envelope, not the persona**, and issue 02 wrote the reason itself: a persona is composed
at session start, so a persona fact would mean *changing who leads restarts a team* — "a strange
price for a designation flipped while reading the rail". The envelope is where what varies lives,
and status varies by definition. So 02's stated objection to a persona line is honoured rather
than overridden.

It replaces the wake prompt's roster line for the lead rather than sitting beside it, because it
is that line with status on it.

### 2. The lead is opt-in, never a pipe

The lead gets the message when the user names nobody. `@bob` still lands on Bob and `@alice @bob`
still fans out, both untouched. This is what disarms most of 02 **by construction**: the team
cannot serialise behind the lead because work still goes direct, a failed lead mutes nothing, and
the lead's session accumulates only what was actually sent to it.

### 3. Relayed authority stays capped at peer

Issue 03 is **not** reopened. A relayed message carries peer authority, always; the envelope's
"from a teammate, not the operator" is never lifted, because the alternative grants operator
authority to every prompt injection that reaches the lead's context, and blobot fails closed
here the way the palette does.

Followed rather than swallowed: 02 concluded from this that a relay is *strictly weaker* than the
same words typed at the agent. True, and smaller than it sounded. Peer authority is a sentence in
the envelope plus a persona line asking agents to refuse a peer's destructive or out-of-role
requests. For ordinary work — *review the retry loop* — it costs nothing. It bites where the lead
asks for something large or strange, which is where it should bite. **The lead is told this
about itself**, so it phrases work as a colleague's request rather than issuing orders that will
be refused.

Reply routing also stays refused (ticket 05). Answers land in the transcript.

### 4. The silent handoff detector has to widen, and it is load-bearing

`onSilentHandoff` already exists and is the instrument for 02's hardest objection: the user is
certain they told the team, the lead read it and never called `message_agent`, and no ack
anywhere is false. But its narrowing rule is *"the prompt named that teammate"* — and a lead
breaks that by definition, because the whole premise of a lead is that the user named nobody.

For a **lead turn the user started without naming anyone**, the clause is dropped: the answer
names a teammate, no message reached them, the turn ended `end_turn`. Everything else about the
observation is unchanged, including that blobot surfaces it and never repairs it.

**The cost, on the record.** Issue 05 narrowed on purpose because a detector that fires on shop
talk is one nobody reads. Without the prompt clause, a lead answering *"Bob's branch is fine"*
fires. This is accepted for one scope only — a lead deciding who does what, on a prompt that
named nobody — because there the teammate named and not written to *is* the failure. If it turns
out noisy in use, the scope narrows again; it does not widen further.

### 5. What it costs per user prompt, in turns

**One extra turn.** User to lead is one, lead to Bob is one: two where naming Bob would have been
one. 02's "three to four" assumed reply routing, which stays refused. A budget of ten absorbs it.

Issue 02 also decided, and deliberately left unbuilt, that **a turn that only routes should not
count against `turnBudget` — defined by what it did (it messaged and said nothing else), never by
who did it**, so that a title never buys an unmetered budget for real work. This is what that
decision was for, and it is built here to its own literal definition. It fires rarely by
construction, since a lead that acknowledges out loud has said something; the +1 above is the
number to plan against, not this.

## Not in this ticket

- A dedicated coordinator agent. The lead works.
- Reply routing.
- `team_status` as a tool. The brief is fresh at turn start and the `started`/`queued` ack is
  still the mid-turn correction, which is where issue 04 said this would restart.
- Cross-workspace visibility. The lead sees blobot's record, never a teammate's files.
- Any change to fan-out, to `@mention` addressing, or to an agent pane.

## Done when

A team pane message that names nobody reaches a lead that knows it leads, can say what each
teammate is doing, and hands work over with `message_agent`; a teammate it named and never wrote
to says so in the transcript; and the extra turn is one rather than three.

## Answer

**Built 2026-08-30, in core.** A lead now knows it leads, can say what each teammate is doing,
and hands work over with `message_agent`. Nothing about addressing, fan-out or an agent pane
moved.

### The brief

`composeLeadBrief` in `orchestrator/envelope.ts`, composed **fresh on every turn the lead
holds**, because its whole content is the live status fold and a cached brief is a lead handing
work to somebody who stopped being free a minute ago. It says four things and no more: that the
agent leads, each teammate with their role and their current activity, that the list is the
whole of what blobot knows and anything past it means asking them, and that what it sends
arrives as a colleague's request rather than the operator's, so it should ask rather than order.

Statuses are said in plain language rather than in the fold's own words, and `idle` is **free**,
which is the word the decision turns on.

On a peer wake it **replaces** `composeWakePrompt`'s roster line rather than sitting beside it,
because it is that line with an activity on each name. On a user prompt, which has no envelope,
it is folded onto the end — and never into the `messages` row, so the transcript keeps what the
user typed. It is recorded through `#lastWake`, so the context gauge counts it: it is text
blobot put in the window, which is exactly what that gauge is for.

### The observation, widened by exactly one case

`HandoffWatch` gained `leading`: the lead, holding a prompt in which the user named nobody. In
that one case the *"the prompt named that teammate"* clause is dropped, because the user handed
the choice of recipient over and the lead's own answer is the only record of who the work was
for. Everywhere else issue 05's scoping is intact, including for the lead itself the moment the
user names it: `Alice, look at the retry loop` is an ordinary turn.

### The routing turn

`#refundRoutingTurn`, to issue 02's literal definition — it messaged and said nothing else —
and keyed on what the turn did rather than on who held it, so an agent that leads nothing gets
the same refund and a title never buys free work. `#wroteThisTurn` is now populated for every
turn rather than only a watched one, which is what that generality costs.

### What it costs per user prompt

**One extra turn**, as forecast. The refund fires only on a lead that routes in silence.

### Covered

`envelope.test.ts` — six on the brief: the roster with roles and activities, `free` rather than
`idle`, the peer-authority sentence, the bound on what it claims to know, a team of one, and
standing in place of the roster line. `orchestrator.test.ts` — five on the lead (the brief
reaches the lead, never a non-lead, stays out of the transcript, replaces the roster line on a
wake, and sees a busy teammate as busy), three on the widened observation, three on the refund.

Seen running: `pnpm demo` prints Alice's brief beside Bob's persona, which is the whole of
blobot's own injection in one place. The headless demo team was given `leadAgentId: 'alice'` to
match the app's, so the two never play different runs.

### Left for the next session

- Nothing on screen changed, and nothing needed to: the word *lead* now has duties behind it,
  which is what the report was about. If `led by Alice` on the rail should say more than it
  does, that is a DESIGN.md question and its own ticket.
- The widening has not met a real model yet. If a lead saying *"Bob's branch is fine"* turns out
  to fire often in use, the scope narrows again; it does not widen further.
