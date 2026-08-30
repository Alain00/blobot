# ADR-0002 — Editing an agent's definition

- **Status:** accepted
- **Date:** 2026-08-29
- **Decided by:** the author, on the *your agents* screen
- **Touches:** `docs/adr/0001-agents-exist-independently-of-teams.md` (the question it left open),
  `packages/core/src/store/schema.ts`, `apps/desktop/src/main/team-store.ts`, `DESIGN.md`

## Context

ADR-0001 ended with: *"Editing a profile (rename, change role, change runtime), and what an edit
means for the teams an agent is already on. Today a profile is hired and retired, nothing in
between."*

The screen that made it urgent is *your agents*. An AgentProfile could only be seen from inside
team creation, which read as though agents were a step of making a team — the exact reading
ADR-0001 overturned — and once agents have a place of their own, hiring being the only thing you
can do to one is not a place, it is a form.

An AgentProfile holds a name, a role, a runtime, optional standing instructions and a colour.
Joining a Team copies all of them onto an Agent row. So there are two questions: what an edit
does to the profile, and what it does to the copies.

## Decision

**An edit restates the whole definition**, rather than patching fields. What is on the screen is
what this agent is; an emptied field is an answer, and it means "nothing standing".

The profile takes all of it. **A team the agent is already on takes the half it is not built out
of** — the role, the standing instructions and the face — and takes it at the team's *next
start*, because that is when a persona is composed and a runtime is spawned. The other half
stays as it was:

- **The name.** An AgentWorkspace is `blobot/<team>/<agent>`, derived from `refSlug(agentName)`,
  and the branch was created under the name the agent joined with. Renaming the Agent row would
  leave the worktree unfindable by the only code that knows how to find it. This is the same
  wall renaming a *team* is behind, and it is not a coincidence: both names are half of a ref.
- **The runtime.** A Session belongs to the provider that opened it. A membership cannot change
  providers without throwing the conversation away, and quietly throwing the conversation away
  is not what "change the runtime" means.

Nothing about an edit restarts a team. That is the difference from editing a *roster*, which
does: a persona names the roster and the mailbox resolves recipients out of it, so a live team
whose membership changed disagrees with itself. A live team whose definition changed is simply
mid-conversation under the definition it started with, which is correct.

The screen says all of this in the two places it can be acted on: before the save, naming the
teams the change will reach and the ones that keep the old name, and after it, from what the
main process actually did.

## Why the face follows the agent and the name does not

Both look like identity, and they behave differently, so the reason matters.

There is a further split inside the face itself, found by looking at the app: the **hue** is
stored on the profile and restated onto every membership, and the **silhouette** is derived from
the name the blobatar is drawn under. So after a rename the agent keeps its colour everywhere and
takes a new shape on teams formed after the rename, while the teams that kept the old name keep
the old shape. That is the same rule as everything else here, applied to the two halves of a
face, and it is why nothing stores a "face seed": one would have to be invented before the agent
exists, which is the moment the hire dialog draws its preview.

A colour is *only* identity: nothing is named after it, nothing resolves through it, and an
agent wearing two colours on two teams defeats the entire reason a hue is stored on the agent
rather than in `localStorage` — the face has to follow the agent onto every team it joins.

A name is identity **and** a ref. What keeps a transcript honest is not the `agents.name`
column, it is `sessions.persona_text`, which records what the agent was actually told at the
time and is never rewritten. So the transcript argument alone would permit a rename; the branch
is what forbids it.

## Consequences

- A rename is only fully true of teams formed *after* it. The teams the agent is already on keep
  calling it what they called it, and the screen names them rather than leaving the user to
  discover it in a rail that did not change.
- The same rename therefore leaves two names in play for one agent. Acceptable, and preferable
  to the alternative, which is a branch nobody can find. Unifying them is the work behind
  renaming a team, and if that is ever done this ADR should be revisited with it.
- A changed role or changed standing instructions do not reach a running agent mid-turn. The
  agent is inside a conversation it was given a persona for, and rewriting the standing orders
  of a process already acting on them is worse than waiting.
- Retiring stays what ADR-0001 made it: a tombstone on the profile, every team it is on left
  running. The name is *not* released, because those teams still point at it.
- Nothing here needed a migration. `updateProfile` and `restateAgent` write columns that have
  existed since ticket 13 and ADR-0001.

## Not decided here

Renaming a **team**, which is the same problem one level up and still open. Whether an agent
should be able to be given a different runtime *on one team* by rejoining it, which is
expressible today (take it off, put it back on) at the cost of that workspace.
