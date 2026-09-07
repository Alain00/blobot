# blobot

> **Work in progress.** blobot is being built in the open, but it is not ready for use and its
> shape is still changing. Pull requests are not accepted for now. Issues and questions are
> welcome.

**You already have the agents. blobot gives them a team.**

Claude Code, Codex, Cursor, OpenCode, fx. You installed them, you signed in, you use one at a
time. blobot puts them on one team, points that team at your repository, and lets you watch
them work on it together.

## What it is

A local-first desktop app for running the coding agents already on your machine as a team.

- **Hire the agents you have.** Each one keeps its own login. blobot stores no API keys and
  runs no model of its own.
- **Form a team, pick a folder.** Every agent works in its own copy of the repository, on its
  own branch. Nobody steps on anybody's files.
- **They talk to each other.** Ask one agent for something and it can hand part of it to a
  teammate. You read the whole conversation in one place.
- **You stay in charge.** Every agent asks before doing anything risky. A pull request is
  always yours to open, never theirs.

Nothing leaves your computer unless an agent's own CLI sends it. There is no account, no server
and no cloud behind blobot.

## What makes it different

**Every agent can run in its own sandbox.** Choose, per agent, between this computer and a
small private virtual machine on it, built on Docker Sandboxes. The sandbox holds the agent's
own copy of its runtime, its own login and its own copy of the repository. You never see or
type a Docker command. Local and sandboxed agents mix freely on one team. *Preview: enable it
with `BLOBOT_MACHINES_PREVIEW=1` while platform acceptance is finished.*

**Mixed teams.** A Claude Code agent and a Codex agent on the same team, talking to each other
through blobot. Every runtime sits behind one interface, so the app never knows which vendor
is answering, and neither does the interface.

**A worktree per agent, never a shared folder.** Each agent works on its own `blobot/<team>/<agent>`
branch, outside your checkout. A file sidebar shows the folder it is working in, with what git
says has changed. Its real state is that worktree, not a conversation.

**How much it may do is your call, per agent.** Three levels, `careful`, `normal`, `trusting`.
Whatever the level, `rm`, `sudo`, `git push` and their friends ask every time. Permission
requests reach you inline, with allow once, allow always and reject.

**It knows when it is running out of room.** A context gauge per agent, read from what the
runtime already reports. Near the ceiling, blobot asks the agent for a handoff and opens a
fresh session with it. blobot writes no summary of its own, ever.

**Agents remember the job.** A handbook per agent per team, written by the agent in an
interview you start, kept apart from the standing instructions you wrote. Nobody takes a
handbook to the next job.

**A prompt with a clock behind it.** Routines run one instruction to one agent hourly, daily or
weekly, only while blobot is open. What a closed laptop missed comes back as one line with
*run now* beside it, not as four turns at once.

**Speak into it.** Dictation runs on your machine with whisper.cpp. Three hosted transcribers
are the one conscious exception to local-first, chosen by you, stated on the screen.

**Built on the Agent Client Protocol.** Five adapters on one shared protocol layer, measured
against real CLIs rather than their docs. Where a vendor's behaviour disagreed with its own
documentation, the measurement won and a live test keeps it honest.
