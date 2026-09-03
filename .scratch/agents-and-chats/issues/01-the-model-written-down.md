Type: grilling
Status: resolved
Blocked by: none

# The model, written down and stress-tested: Agent, Chat, anchor

## Question

The charting session settled a new model (see *Settled while charting* on `map.md`). Nothing in
`CONTEXT.md` says it yet, and the code still says the opposite: `teams` owns `workspace_path`,
`agents` is a frozen copy of a profile plus a workspace, the Persona opens with a team name, the
Handbook lives at `<team>/<agent>`.

Does the settled model hold when pushed with concrete scenarios against the code, and what are
the exact words? Resolve by:

1. Reading `CONTEXT.md`, `docs/adr/0001` to `0003`, `packages/core/src/store/schema.ts`,
   `packages/core/src/orchestrator/envelope.ts` (`composePersona`) and the roster lookup in
   `@blobot/core/domain`.
2. Stress-testing with the author (grilling + domain-modeling): an Agent in three Chats at once,
   one of them a group; a generalist and an anchored Agent in one group; an Agent whose anchor
   folder was deleted outside blobot; deleting an Agent that is on a group chat someone else is
   mid-turn in; renaming a group chat when branches are `blobot/<chat>/<agent>`; the lead of a
   DM; what the roster lookup answers for a DM.
3. Writing the glossary: **Agent**, **Chat** (DM, group chat), **anchor**, **generalist**,
   **purpose**, **card**, the retirement of **Team** and **AgentProfile**, and what happens to
   **Agent** as the instantiated-on-a-team word (it may need a new name, since *Agent* is now
   the definition; candidates: **Member**, **Seat**). Update `CONTEXT.md` inline, including the
   *Avoid* list (*bot*, *team*, *artifact*).
4. Writing **ADR-0006** (the agent is the unit; a chat is where it works with you), since this
   is hard to reverse, surprising later, and a real trade-off against ADR-0001's grain. Amend
   ADR-0001 rather than superseding it: it was right and this extends it.

The answer is the glossary text and the ADR, plus the list of scenarios that made anything
change. Tickets 02 to 05 zoom on the parts that have mechanism behind them.

## Answer

Resolved 2026-09-03 with the author, two grilling rounds (Q1 to Q14). The model holds; four
settled lines were amended by scenario and one word was added.

**Written:** `CONTEXT.md` rewritten (Aggregates, Runtimes, Messaging, Automation, Avoid);
`docs/adr/0006-the-agent-is-the-unit.md`; amendments appended to `docs/adr/0001` (kept and
extended) and `docs/adr/0002` (rename allowed, runtime fixed).

**The words:** Agent (the definition plus an anchor), Chat (DM, group chat), **Member** (an Agent
in a Chat: AgentWorkspace, Session, Mailbox, Status; copies nothing), roster, anchor (**chosen**
or **made**; **missing** when its folder is gone), purpose, card. Retired: Team, AgentProfile,
bot, artifact, conversation/thread, *home* for a made anchor.

**Scenarios that changed something:**

1. *A generalist in three Chats, two mid-turn at once, one folder* → **an Agent takes one Turn at
   a time across all its Chats**; the Mailbox is per Member, the scheduling per Agent. "Nothing
   there to isolate" was only true under that rule.
2. *Renaming a group chat with branches named after it*, plus the author allowing Agent renames
   → **slugs fixed at creation** on both Agent and Chat; branch `blobot/<agent slug>/<chat
   slug>`, DM slug `dm`, made anchor under the Agent's slug. Reverses the settled
   `blobot/<chat>/<agent>` and ADR-0002's no-rename.
3. *A generalist and an anchored Agent in one group* → the Persona's "separate copy of the
   repository" line is said only between Members who share an anchor. *Two Agents on the same
   repository* → the **Envelope carries the sender's AgentWorkspace path**, read-only, possibly
   mid-edit, only when both share the anchor. Narrows the settled *never see each other's anchor*
   to *never see another anchor*.
4. *Anchor folder deleted outside blobot* → the Agent stays, marked **missing**; every Member's
   turn refused by name; the DM offers to re-anchor (a card, ticket 06).
5. *Deleting an Agent while a peer is mid-turn* → cancel hers, tombstone Members and DM,
   `message_agent` answers *no longer on this chat*, priced removal, Handbook and made anchor
   gone; nothing refused for another's turn.
6. *The lead of a DM* → the one Member, unstated and unstored; group lead chosen or absent as
   today; `composeLeadBrief` only in groups.
7. *Which purposes need a folder* → *a project* and *code and repositories* choose one; the other
   three get a made anchor. So *generalist* is a purpose, not a kind of anchor.
8. *Changing the runtime* → still refused (*"runtime no se toca"*).

**Handed to other tickets:** 02 (slug mechanics, whether a made anchor is a git repo, re-anchoring,
the one-turn rule's home in the orchestrator); 03 (Handbook keyed on the Agent id); 04 (Routine on
the Member); 05 (rename is not among what an Agent says about itself unless the author adds it);
06 (the re-anchor card, the *runtime cannot change* sentence on the creation card); 14 (enforcing
read-only on a colleague's AgentWorkspace); 17 (slugs, the Member table); **19, new**: addressing
outside the Chat, now that a roster is the Members of a Chat.
