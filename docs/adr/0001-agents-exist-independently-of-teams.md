# ADR-0001 — Agents exist independently of Teams

- **Status:** accepted
- **Date:** 2026-08-29
- **Decided by:** the author, during the desktop-product milestone
- **Touches:** `CONTEXT.md` (Aggregates), `packages/core/src/store/schema.ts`, ticket 13's schema,
  ticket 06's persona

## Context

The first version of team creation read the glossary literally: *"an Agent is a named member of
a Team"*. Creating a team created its agents, `agents.team_id` was `NOT NULL`, and no agent
could exist outside a team. Hiring the same specialist for a second team meant typing them in
again, and nothing in the app knew the two were the same person.

The author's model is the opposite way round: **agents exist, and they form teams**. A
marketing specialist is one agent who is on several teams at once.

## Decision

Introduce **AgentProfile**: an agent that exists on its own, with a name, a role, a runtime and
optional standing instructions, belonging to no team. Joining a Team **instantiates** an Agent
from a profile — a new row, with `profile_id` pointing back at it — and the same profile can be
instantiated on any number of teams simultaneously.

`agents.profile_id` is nullable, and name, role and instructions are **copied onto the Agent**
rather than read through the profile.

## Why not simply let one Agent belong to many Teams

Because almost nothing about a working agent is shareable. A Team gives an Agent an
AgentWorkspace (a worktree of *that team's* Workspace, on `blobot/<team>/<agent>`), and a
Session is bound to that workspace, a Status is derived from that Session's event stream, and a
mailbox is scoped by the Team. An agent on two teams is two workspaces, two sessions, two
mailboxes and two statuses **under either model** — the runtime process cannot be shared without
merging two repositories' contexts into one head, which is exactly what the permanent rule
"never a full context copy between agents — always compact context" exists to prevent.

So what a second team reuses is the *definition*, not the instance. Making that explicit costs
one table and keeps every downstream aggregate exactly as ticket 13 shaped it.

## Why the Agent copies its name and role

A transcript is a record of what happened. If the pane read the name through the profile,
renaming an agent would silently rewrite six weeks of conversation, and ticket 06's persona —
which we store precisely so a strange turn is explicable — would stop matching what the agent
was actually told. The profile is the current definition; the Agent row is what was true when
the team was formed.

## Consequences

- Retiring an agent tombstones the profile and leaves every team it is on running. Ending a team
  is a separate decision, and a cascade would tear holes in transcripts that have nothing to do
  with the retirement.
- Profile names are unique across the app, not per team: two agents called Alice are two
  identities the user cannot tell apart in a rail, an `@mention`, or a transcript.
- Standing instructions are folded into the persona, in the cached static prefix ticket 06
  reserved for exactly this kind of fact — with a line saying they apply on every team, because
  that is what makes them different from the team's own framing.
- The creation flow reads in the model's order: *your agents*, then the team formed out of them.
  Hiring from inside that flow is a convenience, not how agents come into being.

## Not decided here

Editing a profile (rename, change role, change runtime), and what an edit means for the teams an
agent is already on. Today a profile is hired and retired, nothing in between.

**Answered 2026-08-29 by `docs/adr/0002-editing-an-agents-definition.md`**, which came out of the
*your agents* screen: an edit restates the whole definition, a team the agent is on takes the
role, the standing instructions and the face at its next start, and the name and the runtime stay
as they were because a branch is under the one and a session belongs to the other.

## Amendment, 2026-09-03: kept, and extended — agents work independently of teams too

`docs/adr/0006-the-agent-is-the-unit.md` keeps this decision and takes it one step further. The
grain was right: the reusable half of an agent is its definition, and what a group gives it (a
workspace copy, a session, a mailbox, a status) cannot be shared. What changes is *which half the
folder is in*. The Workspace moves from the Team onto the Agent as its **anchor**, so an agent
exists *and works* on its own, before any group and without one; the Team is retired for the
**Chat**, and the row this ADR called an *Agent* — the instance — is a **Member**.

Two consequences here are reversed by that ADR, and it says why: a Member no longer copies the
name and the role (the Session records what it was told, and a rename is now allowed on a slug
that never changes), and the AgentProfile is no longer a word — the definition is simply the
Agent.
