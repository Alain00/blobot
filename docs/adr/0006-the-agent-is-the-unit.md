# ADR-0006 — The agent is the unit, and a chat is where it works with you

- **Status:** accepted
- **Date:** 2026-09-03
- **Decided by:** the author, grilled through
  `.scratch/agents-and-chats/issues/01-the-model-written-down.md`
- **Touches:** `CONTEXT.md` (rewritten), `docs/adr/0001` (amended, kept), `docs/adr/0002`
  (amended), the permanent *Git-aware* rule in `CLAUDE.md` (reworded by ticket 02),
  `packages/core/src/store/schema.ts` (replaced by ticket 17), `composePersona`, the Handbook's
  and the Routine's grain

## Context

Every aggregate in blobot hung off the **Team**: it owned the folder, the roster, the turn
budget, the lead, and the transcript, and it *instantiated* Agents from AgentProfiles because a
workspace, a session, a mailbox and a status are things a Team gives an Agent and none can be
shared (ADR-0001). That model assumes the reason agents exist is a shared repository.

The author's model, raised by voice on 2026-09-03, is Grok's: *you create a bot, define it, and
talk to it; a group chat is several bots in one conversation.* The agent is not necessarily
anchored to a project at all. A generalist, a researcher and an operations agent have no
repository to share, and an agent that helps with one repository should still be reachable on
its own, without forming a team around it first.

## Decision

**The Agent is the unit.** It is today's AgentProfile plus an **anchor**: a name, a face, a
runtime, a model and effort, a role, standing instructions, a Handbook, a purpose, and *where it
works*. The Workspace moves off the Team onto the Agent. The Handbook moves with it.

**A Chat is where you talk to one Agent or to several.** It owns what the Team used to: roster,
turn budget, lead, transcript. Every Agent has a **DM**, made when the Agent is, undeletable
while the Agent exists; a **group chat** is a named Chat with a description and an editable
roster. The Team is gone as a word and as a thing.

**A Member is an Agent in a Chat**: the AgentWorkspace, the Session, the Mailbox and the Status a
Chat gives it. One per Agent per Chat. It copies nothing from the Agent.

Five rules that fell out of stress-testing the model against the code, each with the scenario
that forced it:

1. **An Agent takes one Turn at a time across all its Chats.** *A generalist in its DM and in two
   group chats, both groups firing at once, both writing `notes.md` in its one folder.* The
   settled "nothing there to isolate" was true only if two turns never coincide, so the
   serialization is the rule: an Agent is one worker and is in one place at a time, the Mailbox
   is per Member (a prompt enters one Session), and the scheduling is per Agent.
2. **Branches and folders are named by slugs, never by names.** *Renaming a group chat when the
   branch was `blobot/<chat>/<agent>`* would have meant moving a branch in every Member's
   worktree, and the author wants Agents renameable too — *"lo importante es el id, el nombre
   solo cambia temas visuales"*. So an Agent and a Chat each carry a slug fixed at creation; the
   branch is `blobot/<agent slug>/<chat slug>` (agent first, because the repository is the
   Agent's now and `blobot/alice/*` lists everything of hers), a DM's slug is `dm`, the made
   anchor is under the Agent's slug, and a name change moves nothing. The slug is invisible in
   ordinary use: it is what git shows, and nothing on screen.
3. **Agents never see another Agent's anchor, and may read a colleague's AgentWorkspace on the
   same one.** *A generalist and an anchored Agent in one group*: the generalist has no copy of
   the repository, so the persona line "commit and say which branch" is false for it, and the
   peer message is the only bridge. *Two Agents anchored to the same repository in one group* are
   today's team as a special case, and the author wants them to see each other's work in a
   coding session. So the Envelope carries the sender's AgentWorkspace path when, and only when,
   sender and recipient share an anchor, read-only and possibly mid-edit; writing there would be
   a shared directory. Enforcement is ticket 14's.
4. **A missing anchor refuses turns and offers to re-anchor; it never deletes the Agent.** *The
   anchor's folder deleted outside blobot* affects every Chat the Agent is in, so the fact lives
   on the Agent and every Member's turn is refused by name, the way a `not_installed` runtime is.
5. **Deleting an Agent cancels its turns, tombstones its Members and DM, and refuses nothing for
   somebody else's turn.** *Bob mid-turn in a group, messaging Alice as she is deleted*: Bob's
   `message_agent` returns *alice is no longer on this chat*; the group keeps her lines; her
   AgentWorkspaces are removed with the price shown first, her Handbook dies with her, and a made
   anchor is deleted.

And two things kept from ADR-0002 on purpose: the runtime is chosen once and never changed (a
Session belongs to the runtime that opened it and resume state is per runtime; changing it is
deleting and re-creating), and the lead of a group chat is chosen or absent and mediates
nothing. A DM's lead is its one Member, unstated and unstored.

## Why not keep the Team and add a DM

Because the DM is not a one-agent team. A Team owned the folder, so a Team of one would still
have to be *pointed at* something before its agent could speak, and a generalist has nothing to
point it at. Putting the folder on the Agent is what makes the DM a place you can open the
moment the Agent exists, and it is what makes a group chat a roster and a description rather than
a repository with people attached.

## Why not one AgentWorkspace per Agent

Because an Agent on a chosen anchor is in several Chats, and two Chats writing one worktree are
two agents sharing a directory: uncommitted changes from one conversation visible in the other.
The per-Chat AgentWorkspace isolates *work in progress*, not *time* — time is isolated by rule 1.
A made anchor is exempt because there is no user repository to keep clean and the one-turn rule
already keeps two Chats from writing it at once.

## Consequences

- Everything keyed on `team_id` is re-keyed: sessions, messages, turns and events on the Member
  or the Chat; the Handbook and the Routine on the Agent and the Member respectively; the
  Workspace on the Agent. Ticket 17 writes the schema, with no migration (clean break).
- `composePersona` opens with the Agent, its purpose and its anchor, then the Chat's description
  and roster; the sentence about *a separate copy of the repository* is said only between
  Members who share an anchor.
- A group chat can be renamed. An Agent can be renamed. `@mention` and the rail resolve the
  current name; a transcript shows `@alice` as it was typed.
- Nothing about access changes here. The purpose changes the anchor and the Persona's opening
  frame only; ticket 14 decides access.
- ADR-0001 is kept and extended, not superseded: agents exist independently of teams, and now
  work independently of them too. ADR-0002's *no rename* is reversed and its *no runtime change*
  stands.

## Not decided here

- The mechanism of the anchor and the AgentWorkspace under this grain, including whether a made
  anchor should be a git repository for the sake of history, and the wording of the permanent
  *Git-aware* rule (ticket 02). **Answered the same day by ticket 02:** a made anchor is a
  repository with one empty commit, worked in place, visible under `~/blobot/agents/`.
- The Handbook's and the Routine's mechanics under the new grain (tickets 03 and 04).
- What an Agent may say about itself and how (ticket 05), the cards (06), and access (14).
- Whether an Agent may address an Agent it shares no Chat with (ticket 19, after 14).
