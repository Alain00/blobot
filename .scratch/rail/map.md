Label: wayfinder:map

# The rail: agents and teams as peers

## Destination

A locked set of decisions for **the rail's second subject**. Today the rail is a list of teams,
and an agent appears only as an indented row under the one team that is open. After this, **every
hired agent is a row of its own**, a team is one row that opens no roster, and the two kinds sit
in one list ordered by recency with a pin.

Raised by the author, 2026-09-06: *"Right now the sidebar rail only shows teams and its agents, I
want an item for every agent individually, and teams to be represented like a group, with no
nested agents rail."* And, on where the per-team pane goes: *"the right sidebar and mentions
already allows targeting one specific agent, it doesn't matter too much."*

The map is done when nothing is left to *decide* before the code is written. It plans; it does
not build, with the exception the Notes record.

## Notes

**Domain.** blobot is a local-first Electron desktop app that assembles teams from the coding
agents a user already has installed. `CLAUDE.md` has the permanent rules, `CONTEXT.md` the
glossary, `DESIGN.md` is binding for anything a user sees. The rail's current rules are
`DESIGN.md` lines 1071 to 1140 and the header comments in
`apps/desktop/src/renderer/src/components/Rail.tsx`; both are amended by this effort rather than
worked around.

**Skills every session should consult:** `/grilling` and `/domain-modeling` by default,
`/prototype` for the two prototype tickets, where the question is what it looks like.

**The two facts this map bends around.**

- **An AgentProfile owns none of the state a row draws.** ADR-0001: an agent is hired once, on no
  team, and joins several. A workspace, a session, a mailbox, a status, a handbook and a Machine
  are all `<team>/<agent>` and none of them is a Profile's to hold. So a rail row for the person
  has to draw something, and what it draws is the subject of `01`.
- **The DM already exists and is a Team.** Machines' `07` and `18` decided that contact from a
  profile opens a **visible individual Team** with an ordinary worktree, tools and history,
  reached by `talk` on the agents screen (`IndividualTeam.tsx`). This map keeps the mechanism and
  reverses its visibility: the Team becomes the thing nobody sees, and the agent becomes the row.

**Settled while charting, 2026-09-06** — put to the author in four grilling rounds and agreed.
Premises, not decisions to revisit:

- **A row is the person, not the seat.** One row per AgentProfile, never one per membership.
  Alice on three teams is one row.
- **Pressing an agent opens their thread**, which is internally the individual Team of Machines'
  `07`, *"but there should not be context of a team for the agent, no members, no lead"*.
- **Every hired agent has a row**, from hire, before anything has happened in it. The author's
  choice over the narrower "only agents you have talked to".
- **One list, mixed, by recency, with a pin.** Not two sections. Pinned rows sit in a block at
  the top in pin order, the rest by recency underneath; the pin is on the row's own menu and
  nothing marks a pinned row at rest.
- **A thread shares nothing with the teams.** The author, on a proposal to fold an agent's
  statuses across its memberships onto its row: *"If Alice's dm has nothing to do with the teams,
  is a new thread and should share nothing regarding status."* An agent `waiting` inside a
  backgrounded team therefore reaches the user through that **team's** row and nowhere else,
  which is what `08` is for.
- **The first message makes the folder.** A thread with no Workspace gets a git repository at
  `~/blobot/<agent>` with one empty commit, the way *make one for me* already does for teams. No
  form between the user and a colleague they are trying to message.
- **A thread always runs local.** Placement and its limits are chosen per member at creation and
  Machines deferred changing them afterwards; a thread has no creation screen, so it takes the
  app's default. A box-placed DM is made through the ordinary creation flow with the profile
  preselected, which still exists.
- **The branch reads `blobot/<agent>/<agent>`.** The Team's name is the agent's, disambiguated in
  the store if a real team holds it, because the string is never drawn and the branch is the one
  place it surfaces for real.
- **The pane is unchanged.** `Pane` stays `{team} | {agent}` — **amended by `04`**, which adds
  `{thread, profileId}` because a thread does not exist until its first message; the rail simply stops being one of
  the doors into an agent's pane inside a team. Pressing an agent row opens the **agent's** pane,
  and a thread's team view is never reachable, because the team view of a one-member team is the
  member's transcript with the roster furniture drawn around it.
- **Execution is in scope, after the decisions.** The tickets decide; the build follows on this
  branch once the frontier is empty. `/wayfinder` defaults to planning and this is the override.

## Decisions so far

<!-- one line per resolved ticket -->

- [The member switcher the roster leaves behind](issues/07-the-member-switcher.md): nothing built — the file panel's empty state is already the members' chooser and its head presses back to the team; both placements were drawn and refused as a duplicate control.

- [The column, drawn](issues/03-the-column-drawn.md): one row shape for both kinds at a 34px mark, the team mark a cluster capped at three with `+N` in mono yielding to status, the icon a sticker, no speaker prefix, a hairline under the pinned block, and the same-roster ambiguity accepted. [Prototype](prototype.html).

- [What reaches the user when a member of a backgrounded team is waiting](issues/08-what-reaches-the-user.md): the team mark becomes the members' faces stacked with the icon as a sticker, the inverted word stays on the right, pressing lands on the team pane as always, agent rows still say nothing about their seats, and recency already keeps a waiting team near the top.

- [Retiring an agent, and what goes with its thread](issues/06-retiring-an-agent.md): retiring deletes the thread, priced and explicitly acknowledged, teams untouched; a thread can also be deleted alone from the row's menu, reusing the team-delete dialog; a deleted conversation does not come back and the dialog says so.

- [Where a thread is hidden, and the one seam where the fiction breaks](issues/05-where-a-thread-is-hidden.md): no seam — a thread is always local, so Settings shows none; Routines name the agent alone; `talk` stays and the chooser dialog goes, superseding Machines' `18`; the navigator lists every hired agent and no seats.

- [The first message makes the folder](issues/04-the-first-message-makes-the-folder.md): the thread is created on send, `Pane` gains `{thread, profileId}` (amending the charting premise), the empty thread says nothing, a folder collision disambiguates to `alice-2`, and the path is fixed for life.

- [What a thread strips, and what its persona is](issues/02-what-a-thread-strips.md): `message_agent` unadvertised, the persona branched to name no team, the lead brief and roster line suppressed while `lead_agent_id` stays for routing, mention and fan-out gone, Handbook and Routines kept as per-Agent facts.

- [What a thread is, and how it is told apart from a one-member team](issues/01-what-a-thread-is.md): a nullable `UNIQUE` `thread_for` column on `teams` holding the AgentProfile id, one thread per agent, never a second member, no backfill of existing individual teams, and a `CONTEXT.md` entry for *Thread*.

**[The spec](spec.md) is written, 2026-09-06**, labelled `ready-for-agent`: problem, user stories,
implementation and testing decisions, synthesised from the eight tickets. The tickets stay
authoritative where the two disagree.

**The frontier is empty, 2026-09-06.** Eight tickets, all resolved. Nothing is left to decide
before this is built; the Notes' execution override applies from here.

**Built, 2026-09-06.** All eight, in one session. `build.md` has what was decided at the keyboard,
the one shipped defect found on the way (`lastActiveAt` and the rail's new second line were two
reads of the same fact), and the one thing nothing here has done: **run a real thread**. `DESIGN.md`'s
rail entries are rewritten rather than deleted, `CONTEXT.md` has *Thread*, and Machines' ticket
`18` is superseded on its chooser dialog, which is removed.

## Not yet specified

- **The unread mark and the two row kinds.** The mark is earned by origin, so a Routine run in a
  thread marks its agent's row. Whether a Routine run inside a *team* still marks anything, now
  that no agent row belongs to a team, is downstream of `08` and may graduate into its own
  ticket.
- **Demo mode and the screenshot flags.** `--demo` has one scripted team and a TypeScript file
  for agents, and every `--screen=` flag reaches the rail. Whether demo mode grows threads or
  simply draws the list it has is a build detail unless `03` finds otherwise.

## Out of scope

- **The right sidebar, `@mention` and the navigator.** The author: *"the right sidebar and
  mentions already allows targeting one specific agent, it doesn't matter too much."* They keep
  working as they do; `07` adds the one deliberate door the rail is taking away and nothing else
  moves.
- **A profile-grain workspace, session or memory.** A thread is an ordinary Agent with an
  ordinary worktree. Nothing here gives an AgentProfile state of its own, which would reopen
  ADR-0001 rather than extend it.
- **Sharing, remote access, or a second client.** Unchanged by anything here.
- **Changing a thread's placement after it exists.** Machines' `25` deferred post-creation CPU and
  RAM edits and this map inherits that boundary rather than reopening it.
