# blobot — domain glossary

Terms settled while charting the first demo, and **rewritten on 2026-09-03 for agents and
chats** (`.scratch/agents-and-chats/`, `docs/adr/0006`): the Agent is the unit now, and a Chat
is where it works with you. The code is catching up with this file, effort by effort; where they
disagree, this file is the model and the code is the gap. Use these words; don't drift to
synonyms.

## Aggregates

- **Agent** — the unit a person creates: a name, a face, a runtime, a model and effort, a role,
  standing instructions, a Handbook, a purpose and an **anchor**. It exists on its own, belongs
  to no Chat, and is in as many Chats as it is invited to at the same time. *Alice*, *Mara,
  marketing.* It defines part of itself by talking — role, standing instructions, purpose, the
  anchor if asked — and never its runtime, model, trust or compaction. It **can be renamed**: the
  name is what a person sees and says, the identity is the id, and a **slug** fixed at creation
  names whatever git and the filesystem hold for it, so a rename moves nothing. The runtime is
  chosen once and never changed; changing it is deleting the Agent and making another. See
  `docs/adr/0006-the-agent-is-the-unit.md`.
- **Chat** — where you talk to one Agent or to several. It owns what a Team used to own: the
  roster, the turn budget, the lead. One aggregate in two forms:
  - **DM** — the Chat blobot makes with each Agent when it is created, where the Agent is
    defined and its history with you lives. One per Agent; undeletable while the Agent exists,
    and gone with it, transcript kept.
  - **group chat** — a named Chat with a description and an editable roster. The description is
    the frame the Agents in it are given, the way a Team's name and folder used to be. A Routine
    may have a Chat of its own (see *Routine*).

  A Chat has a slug fixed at creation; its name changes freely.
- **Member** — an Agent in a Chat: the thing a Chat gives an Agent, which is an AgentWorkspace, a
  Session, a Mailbox and a Status, none of which can be shared between Chats. One per Agent per
  Chat; a DM has exactly one. A Member **copies nothing** from the Agent: the name on screen is
  the Agent's current one, and what a Member was actually told at the time is recorded on its
  Session, which is what explains a strange turn.
- **Roster** — the Members of a Chat. It answers *who can Alice address?* and *who is `@alice`?*
  In a DM the roster is one Member and the **lead** is that Member by construction, never stated
  and never stored. In a group chat the lead is chosen or absent, receives what names nobody, and
  mediates nothing: the user and every Member can address anyone on the roster directly.
- **Anchor** — where an Agent works: its Workspace, the Agent's own and never a Chat's. Either
  **chosen** — a folder of the user's, of any of the three kinds, whether they picked it or asked
  blobot to make one for them — or **made** — a repository blobot makes for this Agent alone,
  visible, persistent, its own, and deleted with it. Which of the two is decided by the purpose. Agents in a Chat **never see another Agent's anchor**; a peer Message
  is the only bridge between two anchors. An anchor whose folder has gone is **missing**: the
  Agent stays, every turn it would take is refused by name, and its DM offers to re-anchor it.
- **Purpose** — why the Agent exists, from a closed set: *generalist*, *a project*, *code and
  repositories*, *research*, *day-to-day operations*. Chosen in the DM. It changes exactly two
  things: whether the anchor is chosen (*a project*, *code and repositories*) or made (the other
  three), and the opening frame of the Persona. It changes nothing about access.
- **Workspace** — a folder an Agent is anchored to. **Not necessarily code, and not necessarily
  a repository** — a folder of documents is a valid Workspace. It is one of three *kinds*, decided
  by looking at it and stored on the Agent, because the kind chooses the mechanism: `git` (a
  repository), `nested` (not a repository, but it contains some), `plain` (no repository
  anywhere). A made anchor is always `git`.
- **AgentWorkspace** — a Member's own isolated copy of the anchor. On a chosen anchor, one per
  Member: a worktree on a `blobot/<agent slug>/<chat slug>` branch, a mirrored tree of worktrees
  for the repositories in **scope**, or a plain copy. On a made anchor it is the repository itself,
  worked **in place**, the same tree in every Chat, which is safe only because an Agent takes one
  Turn at a time. The
  name deliberately promises neither git nor Docker; the isolation is the same in every case and
  the *guarantees* are not: a copy has no branch, no diff and no recovery. Two Members of one
  Chat on the **same** anchor may **read** each other's AgentWorkspace, handed the path by the
  Envelope when one messages the other; neither ever writes in the other's, because that is a
  shared directory.
- **Scope** — for a `nested` Workspace, the repositories the user put in, chosen when the Agent is
  anchored and the same in every Chat. A repository out of scope is **absent** from the
  AgentWorkspace, not present and off limits.

## Runtimes

- **AgentRuntime** — the interface every provider sits behind. Nothing outside an adapter may
  know which provider an Agent is.
- **Adapter** — an AgentRuntime implementation. Owns all of its provider's weirdness, including
  persona injection and protocol version quirks.
- **Session** — one runtime-side conversation, bound to a Member's AgentWorkspace. One per
  Member; the user's messages and peer messages share it.
- **Turn** — one prompt and everything that follows until the runtime reports a stop reason.
  Prompts on a session are serialized, and so is the Agent: **an Agent takes one Turn at a time
  across all its Chats.** A prompt for a Member whose Agent is mid-turn elsewhere waits in that
  Member's Mailbox.

## Messaging

- **Message** — something said to a Member. Either from the user or from a peer.
- **Attachment** — bytes the user attached to a Message: an image or a text file, embedded in
  the Prompt and stored with the Message. Only the user attaches; a peer Message never carries
  one. A file that is already in the anchor is not an Attachment — the Agent opens it itself.
- **Envelope** — the framing wrapped around a peer Message: sender, their role, their optional
  context line, the note that a peer carries no operator authority, and — only when sender and
  recipient are on the same anchor — the path of the sender's AgentWorkspace, with the rule that
  it is read and never written and may be mid-edit.
- **Handbook** — what an Agent knows about its work. It belongs to the **Agent**, because the
  work is the anchor and the anchor is the Agent's: one Handbook, folded into the Persona in
  every Chat the Agent is in, and gone with the Agent. Made of **entries**, and read and edited
  from the Agent's DM. The counterpart to Standing instructions, and the contrast is the whole of
  the word: **standing instructions are about the person; a Handbook is about the work.**
  Leaving a group chat does not touch it.
- **Entry** — one thing in a Handbook. Written by the user briefing the Agent, or by the Agent
  itself, which discloses every one inline in the turn that made it. Not a *fact*: an Agent
  recording something it inferred is not asserting one.
- **To brief** — the act. An Agent with an empty Handbook is **unbriefed**, which puts a control
  in its DM that starts the conversation. *Unbriefed is not a Status*: Status is the fold over
  the event stream, derived in memory and never persisted, and being unbriefed is not an
  activity. It never folds into a StatusWord.
- **Standing instructions** — what is true of an Agent in *every* Chat it is in. Folded into its
  Persona, last, so they are the user's last word, and said as such so they are never mistaken
  for a Chat's framing.
- **Persona** — a Member's system prompt. Carries the static facts about its situation: who it
  is, the purpose's opening frame, its anchor and AgentWorkspace path, the Chat's description and
  roster, the rules; then the Handbook, then standing instructions. Adapter-owned.
- **Mailbox** — a Member's queue of undelivered Messages. Delivered as one prompt when the Agent
  is next free.

## Events

- **AgentEvent** — blobot's normalized event vocabulary. Our own type, never an ACP passthrough;
  `packages/core` exports no ACP type.
- **Status** — a Member's current activity, derived in memory from its AgentEvent stream. Never
  persisted. An Agent's status on screen is the fold of its Members'.

## Automation

- **Routine** — a named, repeatable instruction to one Member, delivered on a schedule instead of
  by a person. It is a prompt with a clock behind it: the same words, the same single recipient,
  the same turn. It has no steps, no branches and no output that feeds anything; work that needs
  three agents in order is a prompt saying so, and `message_agent`. A Routine belongs to a
  **Member** — an Agent in one Chat — and never to the Agent alone, because a turn needs an
  AgentWorkspace, a session and a mailbox, and those are what a Chat gives. A Routine may have a
  Chat of its own, separate from the DM, where every run lands (`.scratch/agents-and-chats/`
  ticket 04). It fires **only while blobot is open**, with a window on screen. See
  `.scratch/routines/`.
- **Firing** — one due moment. **Run** — the turn a firing started, and everything that followed,
  which is what the run budget bounds and what the run's outcome is about.
- A firing blobot was there for and did not run is **skipped**, and the reason is recorded on the
  run: the Member is gone, an anchor that is missing, a runtime that is not installed, or a
  previous run of the same Routine that had not finished. A firing blobot was **not** there for is
  **missed**: it writes no run at all, because nothing happened and nothing decided not to, and it
  is counted on the Routine so the screen can say `missed 4 firings`. Both are terminal and
  neither is a queue. Missed is not a failure — a laptop that was shut is the ordinary condition
  of a laptop — so it is the one thing that does not count toward the rule that disarms a Routine
  after three firings in a row ending in anything but a run.
- **Armed** — a Routine that fires. Disarmed is the resting state for one a person writes, which
  is created disarmed and armed as its own act. An Agent may **schedule** a Routine for itself
  with `propose_routine`, and **that one is armed when it is made** — issue 05's 2026-08-30
  amendment, which reversed *only a person may arm one*. What pays for it: the Routine opens
  inline in the transcript in the turn that created it, carrying `disarm`; it keeps an ink edge
  at the top of the Routines screen until a person has answered it; and an agent may hold at most
  three armed Routines of its own. An agent still may not schedule one for a peer, delete one, or
  edit an armed one.
- **Reviewed** — a person has looked at a Routine an Agent scheduled and said which way. It does
  not mean *approved*: a Routine armed and later disarmed is reviewed, because a decision the
  user reversed is still a decision they made. It is what clears the ink edge, and it is why
  *unreviewed* is a fact on the row rather than an inference from *armed or gone*.

## Avoid

- **"Team"** — retired on 2026-09-03. It named a group of agents *and* the folder they shared,
  and the second half is the Agent's now. Say *group chat* for the people and *anchor* for the
  place.
- **"AgentProfile"**, and *profile* — retired the same day. The definition *is* the Agent; the
  thing a Chat instantiates is a Member.
- **"Bot"** — the word on screen and in this file is *agent*. The author says *bot*, and that is
  fine in their mouth.
- **"Artifact"** — for blobot's own inline blocks. They are **cards**, a closed set blobot draws
  (a permission request, a Routine proposal, a handoff, a Handbook write, the creation card),
  chosen so the word never collides with something an agent authored.
- **"Conversation"** and **"thread"** for a Chat — an Agent has one DM and no threads; *thread*
  promises several.
- **"Home"** for a made anchor — it is `$HOME` to a shell and *per-agent home* to the access
  research, and a made anchor is neither. Say *made anchor*, or *the folder blobot made for it*.
- **"worktree"** as a domain term — it is the git *mechanism* behind AgentWorkspace, not the
  concept. Say AgentWorkspace unless you mean the git object specifically.
- **"Authenticated"** for runtime detection — the probe cannot prove a credential works. Say
  *Ready*, *Needs sign-in*, *Not installed*, or *Status unknown*.
- **"done"** as an Agent Status — it was dropped; an Agent that finishes a Turn is *idle*.
- **"Context"** for a Handbook — the context window, this file, and the `CONTEXT` block on screen
  are three existing meanings already.
- **"Memory"**, and *remembers*, *learns*, *training* — for a Handbook. It promises persistence
  blobot does not give (a Handbook dies with its Agent), and it borrows a vendor's word for what
  is a persona block, implying the Agent itself is changed rather than told something. **The
  exception is the user's own mouth**: *remember that* is a plain instruction to an Agent and must
  keep working. It is wrong in blobot's mouth, on screen or in a persona, and never wrong in
  theirs.
- **"Cron"** — it names a mechanism blobot does not implement and promises a guarantee it cannot
  keep: a Routine does not fire while the app is closed, and a missed firing is never run late.
  Say *Routine*, and say *every day at 09:00* rather than a schedule expression.
