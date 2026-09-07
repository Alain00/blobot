Type: grilling
Status: resolved
Blocked by: 01

# The first message makes the folder

## Question

Every hired agent has a row from the moment it is hired, and most of those rows have never been
opened. Pressing one has to land in a working thread without a form, so the first message creates
a git repository at `~/blobot/<agent>` with one empty commit, the way *make one for me* already
does for teams.

What that leaves to decide:

- **When the Team row is written.** On press, or on send. On press means opening a row you were
  curious about leaves a Team, a Workspace and a branch behind it. On send means the pane has to
  render a thread that does not exist yet, and the composer's first submit does four things
  before a turn starts.
- **What the empty thread says.** One line, terse, in the user's own vocabulary, naming the
  folder that is about to be made. `DESIGN.md` and the terse-copy rule bind; this is the empty
  state of a surface that will exist once per hired agent.
- **The collision.** `~/blobot/alice` already exists, because another agent has that name, or
  because a team was made there, or because the user has a folder called that. Adopt, refuse or
  disambiguate.
- **The failure.** `git init` fails, the disk is full, `~/blobot` is not writable. The message is
  already typed at that point.
- **Pointing it elsewhere.** A thread's Workspace is an ordinary Workspace, so the ordinary
  controls are one answer; the other is that a thread made by accident in the wrong place is a
  team-delete away. Whether anything on screen offers to move it.
- **Cancellation.** Pressing a row, typing nothing, and going somewhere else must leave nothing
  behind if the answer above is *on send*, and must be reclaimable if it is *on press*.

## Answer

Decided with the author, 2026-09-06.

**The thread is created on send, and the rail selects a profile.** `Pane` gains a third kind,
`{kind: 'thread', profileId}`, which resolves to `{kind: 'agent', agentId}` once the Agent exists.
This **amends the charting premise** that the pane was unchanged, deliberately: it is the only
option where the rail's identity and the pane's identity agree. A row is a person, so what it
selects is a person, and the thread is something that person's conversation acquires on the first
message. Creating on press instead would keep `Pane` as it is and charge for curiosity — twenty
idle clicks, twenty repositories under a directory the user is meant to open in an editor — and
reclaiming an unused thread afterwards means being exactly right about *said anything*, which a
queued message, a cancelled turn and a Routine firing each complicate.

**The empty thread says nothing.** No line, no card. The author: *"remember to avoid unnecessary
verbosity."* The folder is named by the ordinary `WORKSPACE` line as soon as there is one, and the
Handbook's empty-state card appears after the first turn exactly as it does everywhere else.

**A collision disambiguates silently**: `~/blobot/alice` taken and not empty gives `~/blobot/alice-2`.
`prepareWorkspace`'s existing `already_there` refusal advises *"Choose it yourself if it is the one
you mean"*, which assumes a folder picker this flow has not got, with the user's message already
typed. `01`'s one-thread-per-agent constraint is what makes this safe: the suffix never means two
folders for one agent, it means something unrelated already owns that name. Adopting an existing
repository on a name match was refused — that is a checkout an agent could commit home.

A genuine failure is not a collision and is not silent: `git init` failing, or `~/blobot` not
being writable, keeps the typed message and says what happened.

**A thread's folder cannot be changed afterwards**, the same as a Team's. The path is baked into a
branch name, a worktree location, a Machine's mounts and every path the agent has written down. A
thread in the wrong place is deleted and remade; `06` owns that.
