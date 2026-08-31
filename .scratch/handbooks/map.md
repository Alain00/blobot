Label: wayfinder:map

# Handbooks: what an agent knows about this team's work

## Destination

A locked set of decisions for **the Handbook**: a body of knowledge held at `<team>/<agent>`,
elicited by talking to the agent rather than by filling in a form, added to by the agent itself
as it learns, injected into its persona, and read and edited in its own pane.

The map is done when nothing is left to *decide* before someone writes that code. It plans; it
does not build.

**Reached, 2026-08-31.** All ten tickets are resolved and the frontier is empty. Do not run
`/wayfinder` on this map: there is no next ticket. What remains under *Not yet specified* is fog
**beyond** this destination, not work blocking it. An implementation session should read this file,
`CONTEXT.md`, `build.md`, and the tickets its task actually touches. Decisions are binding; if one
is wrong, reopen its ticket and say so on it rather than quietly contradicting it. Check for an
`## Amendment` section before treating an answer as final: **ticket 03 carries two**, from tickets
09 and 10.

Raised by the author, 2026-08-31: *"help me go through a way of making blobot agents context
aware and self improve — for example, I have a marketing expert agent but in team Vlue, that
agent must have certain knowledge. I'm thinking of that more of a chatty onboarding process with
the agent than a wizard or more buttons."*

## What this actually is

There is a hole at `<team>/<agent>` and it has been there since ADR-0001. An **AgentProfile**
holds standing instructions, true on *every* team it is on. An **Agent** holds a role, copied at
team formation and **restated by a profile edit** at the next start. Neither can hold *what Mara
knows about Vlue*: the first would carry Vlue's positioning onto a client's team, and the second
is destroyed the next time someone edits Mara's face.

`<team>/<agent>` is not a new grain. It is the identity an AgentWorkspace branch is named for and
the identity a Routine belongs to, for the same reason both times: a workspace, a session and a
mailbox are what a turn needs, and none of them are a Team's to lend or a Profile's to hold.
Knowledge of the work is the fourth thing in that list.

The second half of the ask — *self improve* — is the same shape as `propose_routine`, and it is
priced the same way: the agent may add to its own Handbook, and every addition is disclosed
inline in the turn that made it.

## Notes

**Domain.** blobot is a local-first Electron desktop app that assembles teams from the coding
agents a user already has installed. It provides no inference and stores no credentials. See
`CLAUDE.md` for the permanent architectural rules and `CONTEXT.md` for the glossary. They bound
every ticket here and are not up for renegotiation inside one.

**Skills every session should consult:** `/grilling` and `/domain-modeling` by default.
`/research` for the research ticket. `/prototype` where the question is how it should look or
behave, and `DESIGN.md` is binding for anything a user sees.

**Settled while charting, 2026-08-31** — these are premises, not decisions to revisit. Each was
put to the author and agreed:

- **Destination is locked decisions**, executed by later build sessions, the way `.scratch/routines/`
  went. Plan, don't do.
- **The knowledge lives at `<team>/<agent>`**, in a noun of its own. Not on the AgentProfile
  (wrong scope, and a leak between teams), not widened out of the Agent's role (a profile edit
  restates it). Ticket 01 names it.
- **It is blobot's and lives in blobot's SQLite**, injected, never written into the user's
  Workspace. A file in an AgentWorkspace is a file that can be committed home — ticket 14's
  refusal of a settings file, and OpenCode's `OPENCODE_CONFIG_CONTENT`, both said this already.
  A knowledge file the user already owns stays readable by the agent as it always was; that is
  ADR-0003 and is untouched.
- **Self improvement is the agent proposing an addition**, disclosed inline in the transcript in
  the turn that made it. Not blobot inferring one from the user's corrections, and never an agent
  rewriting its own persona off screen.
- **Onboarding is a real Turn on the agent's own session** — the runtime the user picked, in the
  AgentWorkspace, costing tokens and appearing in the transcript. A chat-shaped UI in which
  blobot asks scripted questions is a wizard wearing a conversation's clothes, and cannot ask the
  follow-up that makes an interview worth having.
- **There is no third party in the room.** The author's correction, and it is load-bearing: *you
  are speaking to your hire, not about them*. No `system` line names blobot, no fourth voice is
  invented, and no blobot-composed words enter the conversation. The control that starts the
  interview sends **nothing** into the transcript — the agent's persona already says it is
  unbriefed, so the first words are its own.
- **The agent never speaks unprompted.** An empty Handbook puts a control in the agent's pane
  that starts the interview; an agent that introduced itself on every team start would mean three
  agents talking before the user had said anything. The control **goes** once a Handbook exists:
  after day one, knowledge arrives the way it does with a real colleague — you tell them, and
  they remember.
- **The Handbook rides the Persona, not every prompt.** A change takes at the team's next start,
  which is ADR-0002's rule applied unchanged. It costs nothing extra, because an agent that just
  recorded something said the words in that turn and already has them. Rejected: per-turn
  injection like `composeLeadBrief`, whose immunity to compaction is paid for on every turn
  forever; and forcing a fresh session on a change, which spends a handoff turn on a typo.
- **A Handbook is private to its Agent.** A shared one is a second, quieter channel for one agent
  to change another's context, which is what the peer-carries-no-authority rule and the
  `/allowlist` refusal both exist to prevent. Bob asking Mara about Vlue is a mailbox round trip,
  and that is the product rather than a cost.
- **A Handbook is a list of entries, not one text.** One text means every self-improvement is a
  full rewrite by an agent, so a fact recorded in week one can vanish in week three with nothing
  on screen to show it went.
- **Bounded at the write, refused rather than truncated**, and shown in the `CONTEXT` gauge's
  breakdown beside the peer-message and attachment lines. `bounds.ts` is the shape. No numeric cap
  on entries: a Routine's cap bounds *spend*, and a Handbook's real cost is context, which is
  measured in tokens.
- **The interview turn spends the ordinary turn budget.** The lead's routing exemption exists
  because a turn that only forwards produced no work; an introduction is work.
- **It survives roster removal, and dies with the team.** Removing someone and putting them back
  is how you fix a mistake, and destroying a conversation's worth of elicited knowledge for it is
  a trap. The team is the thing the Handbook is *about*.

## Decisions so far

<!-- one line per resolved ticket -->

- [What is this thing called, and what is it not?](issues/01-the-word.md) — **Handbook**, made of
  **entries**, with **to brief** as the verb and **unbriefed** as the state. *Briefing* was the
  proposal and lost to the marketing sense of *a brief*, in the domain of the example that raised
  this effort. `CONTEXT.md` written, including that *unbriefed* is never a Status and that
  *memory* is banned in blobot's mouth and fine in the user's.
- [How does an agent record an entry?](issues/03-recording-an-entry.md) — `record_entry`, taking
  a **list** of entries, one call per turn, advertised to every agent always. Reversed charting's
  one-per-turn: a Routine proposal is a commitment and an entry is a note, and a per-entry cap
  would make briefing take five turns. Two bounds, refused at the boundary, numbers left to
  ticket 05. An entry carries text, when, and who by.
- [Where does a Handbook sit in the persona, and what does an empty one say?](issues/04-where-it-sits-in-the-persona.md)
  — immediately **before standing instructions**, so the layout states the precedence and an
  entry the agent wrote never outranks a sentence the user wrote. The empty state is
  **conditional** ("if you are started with nothing to do, introduce yourself and ask; if you are
  given work, do the work"), which is the whole trigger for briefing and gives ticket 02 a
  fallback. One string from `composePersona`, no adapter changes. The handoff is told not to
  restate it.
- [Reading and editing a Handbook](issues/06-the-screen.md) — a **notice card above the composer**
  while unbriefed (`.openerror`'s existing shape, persistent because it is a state, no icon, no
  dismiss), and a **panel behind a tray door** once there are entries. The tray's own rule
  (*a live number or a door, never a description*) is what forced the split. Removal only, never
  editing; `add one` opens the composer rather than a field, keeping `record_entry` the single
  path in. In the team pane it is a figure under `CONTEXT` and never a body.
  Prototype: `prototypes/06-handbook/index.html`.
- [How an entry is disclosed, and where "you have not seen this" lives](issues/08-disclosing-an-entry.md)
  — a **collapsed system line** in `Compaction`'s shape (*a thing that happened, not a thing to
  read*), carrying removal, never a card. **No mark on the rail**: that mark is earned by origin,
  so a turn you started is not unread and a Routine run already marks the row. The ink edge this
  ticket was written to port is recorded in DESIGN.md as having been wrong. *Reviewed* stays a
  Routines word. A refused write is silent when the entry ran long and one line when the Handbook
  is full.
- [When should an agent record, and when should it shut up?](issues/09-when-an-agent-should-record.md)
  — **durable, and not in the files**, which is the same test ticket 04's empty state already
  asks for. Four lines in the persona, because this text is paid per turn on fx. Errs shy and says
  why; *"remember that"* skips the test; a teammate's word records as **noticed**, never told; the
  agent is not told its budget. Ticket 03 **amended**: `record_entry` takes the source per entry,
  because nothing can infer it.
- [An entry that is no longer true](issues/10-an-entry-that-is-no-longer-true.md) — an agent may
  **withdraw its own `noticed` entries**, disclosed in ticket 08's block, and correct one atomically
  with `replaces`. A `told` entry is the user's words and stays untouchable. Supersession was
  rejected despite being this ticket's own recommendation: it pays context forever to record what is
  not the case. Dates shown to the agent, **absolute for a cache reason**. Nothing goes stale on a
  clock. Ticket 03 amended again.
- [Where a Handbook is stored, and what outlives what](issues/07-where-a-handbook-is-stored.md) —
  its own `handbook_entries` table keyed on **`(team_id, agent name)`**, with no foreign key, so it
  outlives the row: `editTeamRoster` mints a **new id** for every joiner and never revives a
  tombstone, so an id key would lose the Handbook on every re-add. Safe only because ADR-0002
  forbids renaming an agent. Tombstoned with the team, absent from the purge figure, and both the
  rows (for the persona) and the events (for the transcript, removals included) are persisted.
- [Will the four runtimes take a turn with no words in it?](issues/02-a-turn-with-no-prompt.md) —
  **no.** Measured against all four: Claude and Codex accept and answer gracefully, OpenCode
  accepts and **confabulates a task**, **fx refuses** with `-32602 "Empty prompt"` before any model
  call. So the control sends a **minimal instruction on the wire that is never drawn** —
  `composeLeadBrief`'s arrangement, so the conversation the user reads still opens with the agent's
  own words. Ticket 04's conditional stays the real mechanism.
  Findings: `research/02-empty-prompt.md`.
- [What a Handbook costs, under the gauge](issues/05-what-it-costs-on-screen.md) — a **sub-row
  under `persona`**, beside `your standing instructions`, because a Handbook is part of the persona
  rather than a fourth injection. Hidden when empty (the notice card already says *unbriefed*), and
  it **never warns**: the ring is quiet because blobot will act, this row is quiet because it will
  not. **1,000 and 8,000, provisional** — about five percent of the ~36,000-token cached prefix
  ticket 02 measured — with the calibration written as an instruction.

## Not yet specified

- **A lead briefing the agents who join after it.** A lead already holds `composeLeadBrief` and
  already knows the roster; a teammate hired onto a running team starts empty. Whether the lead
  can hand over what it knows — through the mailbox, which is the only channel a private Handbook
  permits — is a real question and it is downstream of how an entry is written at all.
- **A Handbook that turns out to be true everywhere.** If a Handbook entry is really about Mara
  rather than about Vlue, there is an obvious move: promote it to the profile's standing
  instructions. Whether that promotion exists, and who may make it, is unclear until entries have
  a shape.
- **A Routine firing on a briefed agent.** A run gets three turns and nobody is watching. Whether
  an agent may record a Handbook entry during an unattended run is exactly `propose_routine`'s
  question one level down, and it needs ticket 03's answer first.
- **Onboarding an agent whose Workspace is not code.** The `nested` and `plain` kinds exist and a
  folder of documents is a valid Workspace. Whether the interview reads differently there, or
  whether that is the same interview, has not been looked at.

## Out of scope

Ruled beyond this destination while charting. These do not graduate; they return only as a fresh
effort.

- **blobot inferring a Handbook from the user's repeated corrections.** blobot provides no
  inference. Pattern-matching on repetition and calling it noticing would be dishonest about what
  the app is.
- **An agent rewriting its own Handbook freely between turns.** The version that must not exist:
  a persona that edits itself off screen is unreviewable, and it is one step from an agent
  widening what the next agent may do — the `/allowlist` refusal, fx ticket 05.
  **Narrowed 2026-08-31 by [An entry that is no longer true](issues/10-an-entry-that-is-no-longer-true.md):**
  the load-bearing words are *freely* and *off screen*. An agent may **withdraw an entry it
  authored as `noticed`**, disclosed in the turn it happens. It may never touch a `told` entry,
  never edit any entry's text, and never withdraw silently.
- **Writing knowledge into the user's Workspace.** A file left in an AgentWorkspace can be
  committed home.
- **Handbooks shared across a team, or readable by a peer.**
- **A Handbook on the AgentProfile.** It would re-break the boundary ADR-0001 and ADR-0002 drew,
  and it is the leak this effort exists to close.
- **Fixing `agents_team_name`.** Found while resolving
  [Where a Handbook is stored](issues/07-where-a-handbook-is-stored.md): removing an agent from a
  team and adding them back later collides on that unique index, because it has no
  `WHERE deleted_at IS NULL` and `tombstoneAgent` does not release the name the way
  `tombstoneTeam` does. It is a defect in roster editing that exists today with no Handbooks
  anywhere, and fixing it inside this map would bury it. Either candidate fix — a partial index,
  or renaming on tombstone — is compatible with the key above.
- **Opening a fresh session when a Handbook changes.** The compaction machinery is built and it
  would work; a handoff turn is the most expensive one available and a Handbook edit does not
  earn it.
