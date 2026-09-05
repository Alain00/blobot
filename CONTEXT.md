# blobot — domain glossary

Terms settled while charting the first demo. Use these words; don't drift to synonyms.

## Aggregates

- **Team** — a named group of Agents working on one Workspace, formed out of AgentProfiles that
  already exist. Owns the repository and scopes the message bus: "which agents can Alice address?" is answered by her Team. Also owns the
  turn budget.
- **AgentProfile** — an Agent that exists on its own: a name, a role, a RuntimeProvider and
  optional standing instructions, belonging to no Team. Agents are hired once and can be on
  several Teams at the same time. *Mara, marketing.* See
  `docs/adr/0001-agents-exist-independently-of-teams.md`.
- **Agent** — an AgentProfile instantiated on a Team: a named member of it with a role and an
  AgentWorkspace. *Alice*, *Bob*. The definition is copied from the profile when the team is
  formed. Editing the profile afterwards **restates** the role, the standing instructions and
  the face here, at the Team's next start, and leaves the name and the RuntimeProvider as they
  were: the AgentWorkspace's branch is under the name the Agent joined with, and a Session
  belongs to the runtime that opened it. See `docs/adr/0002-editing-an-agents-definition.md`.
- **Workspace** — the location a Team points at. **Not necessarily code, and not necessarily a
  repository** — a folder of documents is a valid Workspace. One per Team. It is one of three
  *kinds*, decided by looking at it and stored on the Team, because the kind chooses the
  mechanism: `git` (a repository), `nested` (not a repository, but it contains some), `plain`
  (no repository anywhere).
- **AgentWorkspace** — an Agent's own isolated copy of the Workspace. One per Agent per Team.
  The name deliberately promises neither git nor Docker, because the mechanism follows the
  kind: a worktree on a `blobot/<team>/<agent>` branch, a mirrored tree of worktrees for the
  repositories in **scope**, or a plain copy, on either Machine kind. Each Agent has its own
  working files; repository metadata is shared by worktrees. A copy has no branch, no diff
  and no recovery.
- **Scope** — for a `nested` Workspace, the repositories the user put in. A repository out of
  scope is **absent** from the AgentWorkspace, not present and off limits.

## Execution

- **Machine** — the place an Agent's Turn executes. One per Agent and never shared: a Team gives
  each Agent a Machine the way it gives it an AgentWorkspace, and deleting the Agent deletes it.
  It is one of a closed set of **kinds**, chosen when the Team is formed — once for the Team, and
  per Agent for the exception: **this computer**, or **a sandbox on this computer**, a small
  virtual machine holding the Agent's own copy of its runtime, its own login and its own copy of
  the Workspace. It can also write the Workspace’s shared Git metadata, reach the mailbox and
  the Internet under its runtime's own restrictions, and read the operator’s skills. Blobot
  imposes no additional Internet destination list. The main checkout and other Agents’ working
  files are outside it. A Machine is **not** a home: what an AgentProfile keeps for itself across teams is a
  different object. On screen a Machine is said by kind and in plain words; the mechanism behind
  a kind is never named. See `.scratch/machines/`.
- **Approval posture** — when an Agent's runtime asks the operator before acting. Separate
  from where the Agent executes and what it can reach: choosing a Machine does not itself
  grant more permission. See `docs/adr/0006-machine-boundaries-and-approval-posture.md`.

## Runtimes

- **AgentRuntime** — the interface every provider sits behind. Nothing outside an adapter may
  know which provider an Agent is.
- **Adapter** — an AgentRuntime implementation. Owns all of its provider's weirdness, including
  persona injection and protocol version quirks.
- **Session** — one runtime-side conversation, bound to an AgentWorkspace. One per Agent; the
  user's messages and peer messages share it.
- **Turn** — one prompt and everything that follows until the runtime reports a stop reason.
  Prompts on a session are serialized: a session runs at most one Turn at a time.

## Messaging

- **Message** — something said to an Agent. Either from the user or from a peer.
- **Attachment** — bytes the user attached to a Message: an image or a text file, embedded in
  the Prompt and stored with the Message. Only the user attaches; a peer Message never carries
  one. A file that is already in the Workspace is not an Attachment — the Agent opens it itself.
- **Picture** — something an Agent shows the user in the transcript. The counterpart to an
  Attachment and the contrast is the whole of the word: **an Attachment is picked up, a Picture is
  shown.** Nobody attached it, there is no composer near it, and the one who decides it exists is
  the Agent. The verb is the Agent's — it **shows** — and the user performs none. A **shown**
  Picture was handed over deliberately, as a path inside the Agent's own AgentWorkspace, so blobot
  opened the file and measured it; an **observed** Picture was lifted out of a tool result blobot
  was merely watching, and blobot knows only the tool and the moment. Never called an attachment,
  never *media*, never named after the tool that made it, and never a word implying blobot knows
  what is in it: it provides no inference. One that arrived and could not be drawn is **not drawn**,
  always with the reason said. See `.scratch/agent-media/`.
- **Envelope** — the framing wrapped around a peer Message: sender, their role, their optional
  context line, and the note that a peer carries no operator authority.
- **Handbook** — what an Agent knows about *this team's* work. Held at `<team>/<agent>`, the
  same identity the AgentWorkspace branch is named for and a Routine belongs to. Made of
  **entries**, folded into the Persona, and read and edited in the Agent's own pane. The
  counterpart to Standing instructions and the contrast is the whole of the word: **standing
  instructions are about the person and travel with them; a Handbook is about the work and stays
  with the team.** Nobody takes a handbook with them to a new job. It survives its Agent being
  removed from the roster and dies with the Team. See `.scratch/handbooks/`.
- **Entry** — one thing in a Handbook. Written by the user briefing the Agent, or by the Agent
  itself, which discloses every one inline in the turn that made it. Not a *fact*: an Agent
  recording something it inferred is not asserting one.
- **To brief** — the act. An Agent with an empty Handbook is **unbriefed**, which puts a control
  in its pane that starts the conversation. *Unbriefed is not a Status*: Status is the fold over
  the event stream, derived in memory and never persisted, and being unbriefed is not an
  activity. It never folds into a StatusWord.
- **Standing instructions** — what is true of an AgentProfile on *every* team it is on. Folded
  into its Persona, and said as such, so it is never mistaken for this team's framing — which is
  the **Handbook**, and is the thing that sentence was written before there was.
- **Profile overview** — an AgentProfile's current team memberships, declared roles and
  teammates. It carries awareness across teams, never their work contents or authority to act
  in them; it is not a shared personal memory or a place where an Agent executes.
- **Persona** — an Agent's system prompt. Carries the static facts about its situation (role,
  Workspace, AgentWorkspace path, roster, the rules). Adapter-owned.
- **Mailbox** — an Agent's queue of undelivered Messages. Delivered as one prompt when the Agent
  is next free.

## Events

- **AgentEvent** — blobot's normalized event vocabulary. Our own type, never an ACP passthrough;
  `packages/core` exports no ACP type.
- **Status** — an Agent's current activity, derived in memory from its AgentEvent stream. Never
  persisted.

## Automation

- **Routine** — a named, repeatable instruction to one Agent, delivered on a schedule instead of
  by a person. It is a prompt with a clock behind it: the same words, the same single recipient,
  the same turn. It has no steps, no branches and no output that feeds anything; work that needs
  three agents in order is a prompt saying so, and `message_agent`. A Routine belongs to an
  **Agent** — that is, to **one agent on one team**, `<team>/<agent>`, the same identity the
  AgentWorkspace's branch is named for, and never to the AgentProfile behind it. The same person
  hired onto two teams has two sets of Routines and they do not travel. A turn needs an
  AgentWorkspace, a session and a mailbox, and none of those are a Team's to lend or a
  Profile's to hold. It fires **only while blobot is open**, with a window on
  screen. See `.scratch/routines/`.
- **Firing** — one due moment. **Run** — the turn a firing started, and everything that followed,
  which is what the run budget bounds and what the run's outcome is about.
- A firing blobot was there for and did not run is **skipped**, and the reason is recorded on the
  run: no agent on the roster, a Workspace that is gone, a runtime that is not installed, or a
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
  three armed Routines of its own. An agent still may not schedule one for a teammate, delete
  one, or edit an armed one.
- **Reviewed** — a person has looked at a Routine an Agent scheduled and said which way. It does
  not mean *approved*: a Routine armed and later disarmed is reviewed, because a decision the
  user reversed is still a decision they made. It is what clears the ink edge, and it is why
  *unreviewed* is a fact on the row rather than an inference from *armed or gone*.

## Avoid

- **"worktree"** as a domain term — it is the git *mechanism* behind AgentWorkspace, not the
  concept. Say AgentWorkspace unless you mean the git object specifically.
- **"Authenticated"** for runtime detection — the probe cannot prove a credential works. Say
  *Ready*, *Needs sign-in*, *Not installed*, or *Status unknown*.
- **"done"** as an Agent Status — it was dropped; an Agent that finishes a Turn is *idle*.
- **"Context"** for a Handbook — the context window, this file, and the `CONTEXT` block on screen
  are three existing meanings already.
- **"Memory"**, and *remembers*, *learns*, *training* — for a Handbook. It promises persistence
  blobot does not give (a Handbook dies with its Team and travels to no other), and it borrows a
  vendor's word for what is a persona block, implying the Agent itself is changed rather than
  told something. **The exception is the user's own mouth**: *remember that* is a plain
  instruction to an Agent and must keep working. It is wrong in blobot's mouth, on screen or in a
  persona, and never wrong in theirs.
- **"Sandbox"** for any Machine — it is the name of one kind, *a sandbox on this computer*, and
  nothing else; *this computer* is not a sandbox and must not be called a weaker one. And
  **"Docker"**, **"VM"**, **"container"**, **"image"** anywhere a user reads: the mechanism behind
  a kind is invisible infrastructure. One exception, and only one: the **account** is named, once each,
  on the onboarding screen, where a sandbox is offered, and where the engine's readiness is shown
  in Settings, because a sign-in cannot be anonymous.
- **"Cron"** — it names a mechanism blobot does not implement and promises a guarantee it cannot
  keep: a Routine does not fire while the app is closed, and a missed firing is never run late. Say *Routine*, and say *every day at 09:00* rather than a schedule expression.
