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

## Amendment, 2026-08-30: how it answers is part of the definition

An AgentProfile now also holds **what the user chose among the options its runtime advertises**
— a model, a reasoning effort, whatever else that runtime offers — as one JSON column
(`runtime_options`) keyed by the provider's own group ids.

It behaves like the role, not like the runtime: **restated on every team the agent is on, taken
at that team's next start.** The reasoning is this ADR's own. A model is not half of a ref and
not the identity of a session — the session is the same session on the same provider, answering
differently — so none of what pins the name and the runtime applies. And a running agent is
mid-conversation under the settings it was launched with, which is exactly the case the role
already settles: rewriting how a process reasons while it is reasoning is worse than waiting.

Three things fall out of it, all of them the same instinct as the hue:

- **Choosing the runtime's own default stores nothing.** An absent key means "whatever this
  runtime does". Writing today's default down would silently pin an agent to it after the
  provider moved on, and the user who picked the default picked the *behaviour*, not the value.
- **The choices are copied onto the Agent at team creation**, like the name and the face, so a
  transcript can be read against what that agent was actually set to at the time.
- **Blobot never enumerates the options itself.** The runtime is started and asked, because both
  providers volunteer `configOptions` on `session/new` and neither answers the question any
  other way. A list of model names in blobot's source would be stale on somebody else's release
  cadence — the same argument the command palette settled in ADR-0003.

This one *did* need a migration (`0006`), which is the only line above that this amendment
contradicts.

## Amendment, 2026-08-30: what it may do without asking is part of the definition too

The permission posture is now a per-agent choice — `careful`, `normal` or `trusting` — and it
lands in exactly the same place as the amendment above, by exactly the same argument.

**The teams an agent is already on take the new level at their next start.** It could not work
any other way even if this ADR wanted it to: on Claude the vouched list is an `allowedTools`
parameter of `session/new`, and on OpenCode the posture is a config in the child process's
environment. Neither can change under a live process, so *"restated on the profile, taken at the
next start"* is not a policy decision here, it is the only thing the mechanism allows. The
policy decision is that this is fine, and that is the role's reasoning unchanged: an agent
mid-turn is working under the posture it was launched with, and a permission model that shifted
under a running tool call is worse than one that waits.

The rest follows the model and the effort:

- **`normal` is stored as nothing**, so an agent hired before the selector existed is already
  what it always was. Unlike a model default, though, the *form* always sends a word: an agent
  lowered from `trusting` back to `normal` has to be able to say `normal`, not merely stop
  saying `trusting`.
- **The level is copied onto the Agent at team creation**, so a transcript is readable against
  what that agent was actually allowed to do at the time.
- **It is per agent and never per team.** An AgentWorkspace is per agent, so trusting Alice has
  never said anything about Bob, and a team-wide control would imply otherwise.

Where it differs from everything else in this ADR: **the three words are blobot's own.** Every
other choice here is either the provider's vocabulary passed through opaquely or a label the
runtime handed us to print. These three mean the same thing on both runtimes precisely because
each adapter translates them into something different — an allowlist that grows on Claude, a
rule list that loosens on OpenCode. That is the provider rule doing its job in the direction it
usually is not asked to: the UI names the decision, and no component knows what either runtime
makes of it.

Migration `0008`, one nullable column on each of the two tables.

## Amendment, 2026-09-04: the silhouette is choosable, and then it is stored like the hue

The split above — the hue stored on the profile and restated onto every membership, the
silhouette derived from the name — was true, and it was reported as a property of a face rather
than as a decision. It was neither. It was a fact about which half of a face had a picker.

The hire and edit dialogs now offer both, so the sentence resolves the way the rest of this ADR
already does: **a chosen silhouette is stored beside the hue and restated onto every membership;
an unchosen one is still the name's.** After a rename, an agent nobody reshaped still takes a new
shape on teams formed under the new name and keeps the old one where the old name lives, exactly
as before. An agent somebody reshaped keeps that shape everywhere, because it is now a stated
fact about the agent rather than a consequence of the string its face was drawn under.

Nothing about *why* is new. A silhouette is only identity, in the same sense a colour is:
nothing is named after it and nothing resolves through it, so an agent wearing two silhouettes
on two teams defeats the reason the face follows the agent at all. What changes is that the
argument now has something to apply to.

Two details the shape does not share with the hue, both in `blobatar-shapes.ts`:

- **A name is stored, never the number.** The renderer feeds the library a position inside a
  band, and those bands are the library's to retune inside a minor. Persisting a position would
  mean every face somebody chose quietly moving under a dependency bump; `round` keeps meaning
  round.
- **An unknown name is the same as none.** A row written by a later version naming a silhouette
  this one does not have falls back to all nine and lets the agent's name decide, because the
  face a name gives is a real face, while a silhouette blobot substituted is this app deciding
  what somebody's agent looks like.

Migration `0021`, one nullable column on each of the two tables.

**And the face lands at once, where the rest waits.** Found the moment the silhouette had a
picker: the rail draws its rows out of the membership rows, which an edit restates immediately,
while the open team's pane was drawn from the Agent the running team was launched with. So the
same agent wore the new face on the rail and the old one in the transcript beside it, inside one
window. The snapshot reads every face from the store now.

This is not a new rule, it is the old one read properly. A role and standing instructions wait
for the next start because they are composed into a persona and the session in flight was
composed from the old one. A face is drawn. There is no session for it to disagree with, and
nothing to restart in order to apply it. The dialog says so in the sentence about where an edit
lands.
