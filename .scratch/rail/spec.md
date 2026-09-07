Status: ready-for-agent

# The rail: agents and teams as peers

Written from [the map](map.md) and its eight resolved tickets, 2026-09-06. Every decision below
has a ticket behind it; where this spec and a ticket disagree, the ticket is right and this file
is stale.

## Problem Statement

The rail is a list of teams. An agent appears on it only as an indented row under the one team
that is open, so a person the user hired exists on screen as a child of a project — and only while
that project is the one being read. There is no way to say something to an agent as a colleague:
`talk` on the *your agents* screen leads to a folder-picking form, and the individual Team it makes
then presents as a team, with a roster of one, a lead who leads nobody, and a mailbox with nowhere
to send.

Three costs fall out of that. Switching to another team hides every agent on the one you left.
Twenty hired agents are invisible until they are put on something. And the model the app is built
on — agents exist independently of teams, ADR-0001 — is contradicted by the first column the user
looks at.

## Solution

The rail becomes one list of two kinds of thing, ordered by recency, with a pin.

**Every hired agent is a row**, from the moment they are hired. Pressing one opens a **thread**:
that agent's own conversation, with its own folder, branch and history, and none of the furniture
that describes a team. **Every team is one row** that opens the team, and no longer opens a roster
underneath itself. Both wear the same shape: a 34px mark, the name and the time, and the last thing
said. An agent's mark is their face; a team's is its members' faces clustered, capped at three,
with the project icon as a sticker.

A thread is a Team underneath, and it is the only Team the user never sees as one.

## User Stories

1. As an operator, I want every agent I have hired to have a row in the rail, so that the people I
   work with are visible without opening a project first.
2. As an operator, I want a freshly hired agent to appear near the top of the rail, so that I can
   speak to them immediately after hiring them.
3. As an operator, I want to press an agent's row and start talking, so that messaging a colleague
   does not begin with a form.
4. As an operator, I want the folder for that conversation made for me, so that I do not have to
   find a repository before saying hello.
5. As an operator, I want to be told nothing about that folder until there is one, so that an
   empty conversation is empty.
6. As an operator, I want the thread's agent to talk to me and not about a team, so that it never
   claims teammates it does not have.
7. As an operator, I want the thread's agent to have no way of messaging teammates, so that it does
   not attempt a handoff that cannot arrive.
8. As an operator, I want a thread to keep a Handbook, so that what an agent learns about my work
   with them survives between conversations.
9. As an operator, I want a thread to keep Routines, so that one agent can send me a briefing on a
   schedule.
10. As an operator, I want one thread per agent, so that I never have to choose which conversation
    with Alice I meant.
11. As an operator, I want a team to be one row, so that the rail is not half-expanded into
    whichever project I happen to be reading.
12. As an operator, I want a team's row to show its members' faces, so that I can tell two projects
    apart by who is on them.
13. As an operator, I want the project icon kept on that mark, so that two teams with the same
    people are still distinguishable.
14. As an operator, I want teams and agents in one list ordered by recency, so that what happened
    most recently is at the top regardless of which kind it was.
15. As an operator, I want to pin rows, so that the projects and people I return to stay where I
    left them.
16. As an operator, I want pinned rows separated by a hairline, so that the order below them does
    not look arbitrary.
17. As an operator, I want the last thing said on each row, so that I can see what happened without
    opening anything.
18. As an operator, I want a Routine's unread report to show as weight on that row, so that I find
    out about work I did not start.
19. As an operator, I want an inverted `waiting` on a team's row, so that an agent blocked on a
    permission reaches me while I am reading something else.
20. As an operator, I want the waiting team's row to be pressable straight to that team, so that
    answering is one click from noticing.
21. As an operator, I want an agent's row to say nothing about their seats on teams, so that a
    signal never points at a place its row cannot take me.
22. As an operator, I want the file panel to remain the way into one member's pane, so that
    removing the roster does not remove the door.
23. As an operator, I want the members' faces in the file panel's empty state to keep working as a
    chooser, so that picking a member is the same act it was on the rail.
24. As an operator, I want `⌘K` to find every hired agent, so that search covers the same people
    the rail does.
25. As an operator, I want `⌘K` to open a found agent's thread, so that finding and talking are one
    step.
26. As an operator, I want `⌘K` not to list threads as teams, so that one thing does not appear
    twice under two names.
27. As an operator, I want threads absent from Settings, so that a screen about sandboxes is not
    padded with rows that have nothing to administer.
28. As an operator, I want a thread's Routine listed under the agent's name alone, so that I can
    tell it from a Routine belonging to one of their seats.
29. As an operator, I want `talk` on the agents screen to do exactly what the rail row does, so
    that two doors do not behave differently.
30. As an operator, I want to delete a conversation without retiring the agent, so that starting
    over costs nothing else.
31. As an operator, I want deleting a conversation priced before it happens, so that I know what
    the disk gets back.
32. As an operator, I want to be told a deleted conversation does not come back, so that I do not
    expect history to return when I say hello again.
33. As an operator, I want retiring an agent to tell me its conversation and folder will go, and to
    make me acknowledge that, so that nothing is destroyed as a side effect.
34. As an operator, I want retiring an agent to leave every team they are on running, so that
    retirement is about hiring and not about work in flight.
35. As an operator, I want a team I made with one member to stay a team, so that the rail does not
    absorb it into a person's row.
36. As an operator, I want existing individual teams left where they are, so that an upgrade does
    not appear to delete a team.
37. As an operator, I want a thread to run on this computer, so that a conversation never
    provisions a sandbox I did not ask for.
38. As an operator, I want the branch in my repository to read `blobot/alice/alice`, so that a
    thread's work is legible where it lands.
39. As an operator, I want the folder to be suffixed rather than refused when the name is taken, so
    that a message I have already typed is not thrown away.
40. As an operator, I want a real failure — no disk, no permission — stated plainly with my message
    kept, so that I can fix it and send.
41. As an operator, I want an agent's row to show its thread's status only, so that one row means
    one thing.
42. As an operator, I want teams and agents to share a row height and a left edge, so that neither
    reads as a heading over the other.
43. As an operator, I want `+N` on a team of more than three, so that a mark capped at three never
    claims a team is three people.
44. As an operator, I want status to take that slot when there is status, so that the right of a
    row says one thing at a time.
45. As a developer, I want a thread told apart from a one-member team by a stored value, so that no
    caller has to infer it from a roster.

## Implementation Decisions

### The Thread, in the store

- `teams` gains a nullable `thread_for` column holding an **AgentProfile id**, `UNIQUE`. A Team with
  a value is a **Thread**; a Team without one is an ordinary Team. Checked-in drizzle migration,
  numbered after the current highest.
- The migration **backfills nothing**. Individual teams created through Machines' `talk` keep
  `thread_for` NULL and remain ordinary teams.
- One thread per agent is the `UNIQUE` constraint, not a rule enforced at call sites.
- A Thread never gains a second member: the store refuses, and no roster editor opens on one.
- The Thread's Team `name` is the agent's name, disambiguated in the store when an ordinary team
  holds it. It is never drawn. The branch is `blobot/<team-name>/<agent-name>`, which for the
  ordinary case reads `blobot/alice/alice`.
- `lead_agent_id` is set to the Thread's single member, because an unaddressed prompt has to route
  and a NULL lead disables send until an `@mention` resolves.
- `individualTeamOf`'s membership inference and `IndividualTeam.tsx`'s duplicate of it are both
  replaced by a `thread_for` lookup.
- `CONTEXT.md` gains a **Thread** entry: *the Team behind an agent's own conversation: one member,
  no team surface.*

### Creating a Thread

- A Thread is created **on send**, never on press. Pressing an agent with no thread opens an empty
  conversation; the first submit creates the Team, the Agent, the Workspace and the branch, then
  starts the turn.
- The Workspace is made by the existing `prepareWorkspace(join(homedir(), 'blobot'), name)`, which
  already slugs, `git init -b main`s and writes one empty commit with a fallback committer.
- Its `already_there` refusal is not surfaced here: a taken, non-empty path **disambiguates** —
  `alice`, then `alice-2`, and so on. Adoption of an existing repository is refused.
- A genuine failure (`git_failed`, permission, disk) keeps the typed message and states what
  happened.
- Placement is always `local`, with the app's default limits. A box-placed one-member team is still
  reachable through ordinary team creation with the profile preselected, and that Team is not a
  Thread.
- A Thread's Workspace path is fixed for life. There is no move control.

### What a Thread strips

- `composePersona` gains a **branch**, not a second function. In a Thread: no team named in the
  opening sentence, no teammates line, and none of the three teammate bullets. The workspace lines,
  the Routine bullet, the house style, the verbosity, the Handbook fold and the standing
  instructions are unchanged.
- `composeLeadBrief` never composes in a Thread, and `composeWakePrompt`'s roster line never
  composes there either.
- `message_agent` is **not advertised**. `PeerMessageServer`'s tool list already makes
  `propose_routine` and `record_entry` conditional on a supplied handler; the message tool becomes
  the third. Absent, never advertised-and-refusing.
- The composer in a Thread drops the `@mention` menu and the fan-out cost line.
- The Handbook stays, per Agent, with copy that says the work rather than the team. Routines stay.

### The rail's contents

- A new pure function in the renderer's `model.ts` produces the ordered rows from teams, profiles,
  statuses, unread ids and the pin set. It is the single seam for ordering, pinning, mixing and
  the `+N` count.
- Ordering is by last activity across both kinds. An agent with no thread sorts on **hire time**,
  so the order is total with no special case and a fresh hire lands near the top.
- Pinned rows form a block at the top in pin order, separated by a hairline. No heading, no glyph
  at rest. The pin is on the row's context menu and persists per user.
- A team row's `waiting` names the member when it is one (`alice waiting`) and counts when it is
  several (`2 waiting`), inverted, as `foldTeamStatus` already produces the count.
- An agent row draws its **thread's** status and its thread's unread only. It never folds its
  memberships.

### The rail's drawing

Decided against [the prototype](prototype.html); captures in `prototype.png`,
`prototype-revised.png`, `prototype-3.png`.

- **One row shape for both kinds**: a 34px mark, name and time on the first line, the last thing
  said on the second. The 20px team row goes: it was small because it headed a roster.
- The team mark is a **cluster**, capped at three — one face fills the box, two and three are
  smaller and overlapping. The pyramid-and-onward geometry was drawn and refused: at mark size,
  four faces are texture and twelve are a pattern. The prototype's layout table is the decision:

  ```
  1 → [[0.00,  0.00, 1.00]]
  2 → [[0.00,  0.16, 0.70], [0.34, -0.10, 0.66]]
  3 → [[0.30, -0.14, 0.56], [-0.02, 0.14, 0.66], [0.34, 0.26, 0.58]]
      // [x, y, scale], each as a fraction of the mark box
  ```

- Members past three are `+N` in mono on the second line, dropped whenever a status is showing.
- The project icon is a greyed sticker on the cluster, keeping `DESIGN.md`'s *the faces say who is
  on the team, the icon says which project*.
- No speaker prefix on the second line, on either kind.
- Two teams with the same roster and no icon draw the same mark. Accepted: the name and the last
  line are what a reader uses, and the mark is not identifying alone. `TeamMark.tsx`'s comment,
  which reverted faces twice for this, is rewritten rather than deleted.
- `DESIGN.md`'s rail entries (the rail, the team row's height, the twisty, `TeamMark`) are amended
  in the same change. The roster, the twisty and the `.roster` box go.

### Where a Thread is hidden

- Hidden: the rail's team rows, the navigator's teams list, the roster editor, the team pane.
- Absent from Settings entirely — a Thread is local, so it owns no sandbox, no private home and no
  volume.
- The Routines screen names the agent alone for a Thread's Routine, and `agent · team` for a seat's.
- The navigator's agents list becomes **every hired agent**, opening their thread. It does not list
  seats.
- `talk` on the agents screen stays and performs the same act as the rail row. The `IndividualTeam`
  chooser dialog is removed; Machines' ticket `18` is superseded on that point and says so.

### Deleting and retiring

- A Thread can be deleted from the agent row's menu, reusing the team-delete flow whole: workspaces
  removed before the tombstone, the full-clean tick with its measured price, independent reporting
  of what was kept. The agent stays hired and the row stays.
- Retiring an agent **deletes the Thread**, priced in the dialog and explicitly acknowledged before
  it proceeds. Teams the agent is on are untouched, as the dialog already promises.
- A deleted conversation does not return; the dialog says so.

### The pane

- `Pane` gains a third kind: `{ kind: 'thread'; profileId: string }`, which resolves to
  `{ kind: 'agent'; agentId }` once the Thread exists. This is a deliberate amendment to the
  charting premise that the pane was unchanged.
- Pressing an agent row opens the **agent's** pane. A Thread's team view is unreachable.
- No member switcher is built. The file panel's empty state is already the members' chooser and its
  head presses back to the team.

## Testing Decisions

A good test here asserts what a user or a caller can observe: the rows a column produces and their
order, the text an agent is sent, the tools a server advertises, what a store returns after a
migration, what a dialog says before it destroys something. It does not assert private shapes,
class names, or the internals of a component. The suite is `vitest` in both packages, jsdom for the
renderer, and the repo's own precedent is that pure model functions carry the interesting cases and
components carry only what rendering can break.

- **Row assembly** — the new `model.ts` function. Prior art: `model.test.ts` and `fold-live.test.ts`,
  which test `liveTailOf`, `rowsOf` and `foldTeamStatus` as pure functions with hand-built inputs.
  Cases: mixed ordering by recency; a never-talked agent sorting on hire time; pinned block order;
  `+N` beyond three; `+N` dropped while a status shows; a team's `waiting` naming one member and
  counting several; an agent row ignoring its memberships' statuses.
- **The store** — `thread_for`, its `UNIQUE` constraint, `threadOf(profileId)`, and the migration
  leaving existing one-member teams as teams. Prior art: `store.test.ts`, which already drives real
  migrations against a temporary database.
- **Composition** — `composePersona`'s thread branch, and that `composeLeadBrief` and the roster
  line never appear in a thread prompt. Prior art: `envelope.test.ts`, which asserts on the composed
  strings directly.
- **The tool list** — a `PeerMessageServer` built for a thread advertises `record_entry` and
  `propose_routine` and not `message_agent`. Prior art: the existing MCP server tests, including the
  `server/discover` regression named after the method it protects.
- **Thread creation** — the main-process function that creates on send: the happy path, the
  `alice-2` disambiguation, a `git_failed` keeping the message, and that nothing is written when the
  user opens a row and leaves. Prior art: `team-store.test.ts`.
- **Retire and delete** — the dialog requires acknowledgement before destroying; a workspace failure
  still disposes of the rest and reports independently. Prior art: the Machines review's
  team-deletion regressions, which already cover the three orderings.
- **The rail component** — that both kinds render, that a pinned row is above the hairline, that the
  cluster draws at most three faces. Prior art: `Rail.test.tsx`.
- No live provider turn is needed for any of this. The thread's persona is asserted as a string, not
  by prompting a real runtime.

## Out of Scope

- Any profile-grain workspace, session, mailbox or memory. A Thread is an ordinary Agent with an
  ordinary worktree; nothing here gives an AgentProfile durable state, which would reopen ADR-0001.
- A member switcher in the team pane. Drawn, and refused: the file panel already is one.
- The right sidebar, `@mention` and the transcript's own faces. Unchanged.
- Changing a Thread's placement, CPU or RAM after it exists. Machines' ticket `25` deferred
  post-creation resource changes and this inherits that boundary.
- Several threads per agent, and a Thread that becomes a team when somebody joins.
- Any change to how a Routine's unread mark is earned. It is earned by origin, and a Routine firing
  in a thread marks that agent's row by the rule that already exists.
- Demo mode growing threads. It draws the list it has.

## Further Notes

Two decisions in here overturn something already written down, and both were made with the prior
reasoning in front of the author rather than around it.

`TeamMark.tsx` records that faces-as-mark was tried twice and reverted, because the same agents are
on several teams and two teams sharing a roster drew an identical stack. The icon-as-sticker answers
that where a team has an icon; where it has none, the ambiguity is real and accepted, and the
prototype's third column is what it looks like. If it bites, the mark is where to look first.

Machines' ticket `18` shipped a chooser among several individual teams. One thread per agent removes
its purpose, and this spec removes the dialog. That map should not be read as current on that point.

The map's Notes carry an execution override: this effort's tickets decide *and* the build follows on
the same branch. `.scratch/rail/` holds the reasoning, and the prototypes stay — they are the only
honest record of why the cluster caps at three.
