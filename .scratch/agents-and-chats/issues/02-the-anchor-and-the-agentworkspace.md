Type: grilling
Status: resolved
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

## From ticket 01, 2026-09-03

Settled there, so no longer open here: **an Agent takes one Turn at a time across all its
Chats**, which is what makes a made anchor's single folder safe (the first bullet's question);
the branch is **`blobot/<agent slug>/<chat slug>`** with slugs fixed at creation, and a DM's slug
is `dm` (the `WORKSPACE` bullet's question); a chosen anchor is one of the three kinds and a made
anchor is `plain`, made for *generalist*, *research* and *day-to-day operations*. Still this
ticket's: whether a made anchor should be a git repository for the sake of history; where the
one-turn rule lives in the orchestrator; the **re-anchoring** flow for a **missing** anchor
(choose another folder, or become a made one) and what that does to existing AgentWorkspaces and
branches; and the slug's shape (kebab of the name at creation, unique, never shown).

## Answer

Resolved 2026-09-03 with the author, one grilling round (Q1 to Q8), the same session as ticket 01
at the author's direction.

**The made anchor is a repository, worked in place.** blobot initialises it with one empty commit
(`prepareWorkspace`'s argument, unchanged: a millisecond buys history and recovery) and the Agent
works in the repository's own tree, the same one in every Chat, safe because an Agent takes one
Turn at a time. *In place* is a provider mechanism (`provision` answers with the anchor itself),
not a fourth kind. `WORKSPACE` shows its branch, its diff and what is uncommitted, with no remote
and no pull request. **It lives visibly at `~/blobot/agents/<agent slug>/`**, beside the projects
*make one for me* already puts under `~/blobot/`, because a research Agent's reports are for the
user to open. Reverses the settled `~/.local/share/blobot/agents/<agent>/`, and corrects the
glossary line ticket 01 wrote too early (*a made anchor is always `plain`*).

**The *make one for me* door survives** for *a project* and *code and repositories* with no folder
to choose: a repository with one empty commit under `~/blobot/<name>`, named by the user, and it
is a **chosen** anchor — visible, not deleted with the Agent, open to another Agent. *Made* means
private to the Agent and gone with it; this door fabricates a folder of the user's.

**Three deletions.** Deleting an **Agent**: cancel its turns, `remove` every AgentWorkspace it
holds (a branch with unmerged commits is kept and named, as today), one priced tick for the full
clean (`purge`, `-D`), and the made anchor deleted with its size shown, under a second tick
**keep its folder** that leaves it in place and names the path. Deleting a **group chat**: `remove`
for its Members' AgentWorkspaces, the same priced tick. Removing a **Member** from a roster:
`remove`, no price dialog, reports what it kept.

**The reconcile is per Member and runs when a Chat opens.** `repaired` and `lost` are said once as
a `system` line in the transcript of the Chat where they were found; `lost` on a chosen anchor is
also on the `WORKSPACE` line. A **missing** anchor is reported on the Agent (ticket 01) and in
every Chat that tries it.

**Re-anchoring** (a missing anchor, or the Agent asking under ticket 05): every Member is
provisioned afresh from the new anchor; Sessions start over (the cwd changed) and the Handbook
survives, which is what it is for; old AgentWorkspaces are `remove`d if the old anchor exists and
left where they are and named if it does not, because blobot cannot tell what is in them. A
previous made anchor is never deleted by a move to a chosen one; it stays, named.

**Scope** is chosen when the Agent is anchored and is the same in every Chat. **Slugs**:
`refSlug(name)` at creation, unique among Agents and unique among Chats, `-2` on a collision, the
worktree directory `worktrees/<agent slug>/<chat slug>/` mirroring the branch, never on screen.

**The permanent rule**, to be applied to `CLAUDE.md` by ticket 18 in place of *Git-aware*:

> **Git-aware.** An Agent works in its anchor and nowhere else, and no two Agents share a
> directory. On a chosen anchor every Member has its own AgentWorkspace — a git worktree where git
> can hold it, a copy where it cannot — and a colleague's is read, never written. A made anchor is
> one Agent's own repository, worked in place, and an Agent takes one Turn at a time. Never a
> shared directory.

**Amends first-demo ticket 10** by name (an `## Amendment` appended there). **Handed on:** 05 (the
re-anchor mechanics are fixed; what the Agent may ask is yours), 06 (the delete dialog's two ticks;
the re-anchor card), 14 (a made anchor is a git root, which seals OpenCode's upward walk and does
nothing for Claude's, which reads `~/CLAUDE.md` and `~/.mcp.json` from `~/blobot/agents/<slug>`
all the same), 17 (anchor path, kind and origin `chosen`/`made` on the Agent; path and branch on
the Member).
