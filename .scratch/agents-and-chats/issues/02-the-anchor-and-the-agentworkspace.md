Type: grilling
Status: open
Blocked by: 01

# The anchor, and the AgentWorkspace under the new grain

## Question

The Workspace moves from the Team to the Agent (the **anchor**), and an anchored Agent gets one
AgentWorkspace per Chat on `blobot/<chat>/<agent>`. First-demo ticket 10 and
`packages/core/src/workspace/` were written for one Workspace per Team. What exactly changes?

Decide, with the author:

- **The generalist's folder.** `~/.local/share/blobot/agents/<agent>/`, `plain`, made by blobot.
  Is it also the AgentWorkspace (one folder, no copy, no isolation needed) or does each Chat
  still get a copy of it? Recommendation from charting: one folder, its own. Then what does a
  second Chat with the same generalist do while the first is mid-turn, given a session runs one
  Turn at a time but two Chats are two sessions writing one folder?
- **Deleting.** Today a Team's deletion removes every AgentWorkspace before tombstoning and can
  be a priced full clean (`purge` beside `remove`). Now: deleting a Chat removes that Chat's
  AgentWorkspaces; deleting an Agent removes its DM, every AgentWorkspace it holds on every
  Chat, and, for a generalist, the anchor folder itself. Which of these are priced first, and
  what does deleting an anchored Agent do to unmerged branches on the user's repository?
- **`nested` per Agent.** Scope (which repositories are in) was chosen at team creation. It is
  now chosen when the Agent is anchored. Does an Agent's scope change per Chat? Recommendation:
  no, scope is part of the anchor.
- **The `~/blobot/<name>` "make one for me" door.** It made a git repo with one empty commit for
  a Team. Does it survive for an Agent that wants *a project* but has no repository, beside the
  generalist folder that is `plain`? Recommendation: yes, and it is what *code and repositories*
  offers when no repository is picked.
- **The launch reconcile** (repair a missing directory, report a missing branch, a Workspace that
  has been moved) is per Chat now. Where does it report?
- **`WORKSPACE` line and `publish.ts`** (branch, ahead-by, the pull request): per Agent per
  Chat. Unchanged in substance, but the DM is the common case and a DM's branch name
  `blobot/<dm>/<agent>` needs a decision on what `<dm>` is.
- **The permanent rule's wording.** Draft the replacement for *"Git-aware. Agents are isolated
  by AgentWorkspace... Never a shared directory"* so it is true of a generalist with one folder.

The answer amends first-demo ticket 10 by name and writes the new rule text for `CLAUDE.md`.
