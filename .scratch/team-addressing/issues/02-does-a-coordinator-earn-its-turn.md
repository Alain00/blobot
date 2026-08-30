Type: grilling
Status: needs-triage
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
