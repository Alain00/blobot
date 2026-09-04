Type: grilling
Status: open
Blocked by: 01, 06

# What an agent addressed outside a team may do, and what its transcript is

## Question

Raised by the author, 2026-09-04, with Grok Bot as the reference: *"let's debate it's useful that
an agent can be messaged outside a team."* Grok Bot's shape is DM-first — you message a Bot like a
colleague, it has its own persistent computer, and group chats are built on top. blobot's is the
reverse: the Team is the only object with a channel into it, and an AgentProfile is a definition
with no way to reach it.

Assume `01` gives a profile somewhere to run. Decide **what a turn there is**, because the range
is wide and the ends are different products.

- **Conversation only.** No tools, or read-only in its own home. Answers questions, helps write
  its own standing instructions, explains what it is doing on its teams. Cheap, honest, and
  arguably just a worse terminal.
- **Work in its own home.** Files, commands, a scratch directory that is genuinely its own. This
  is the Grok Bot answer and it is the one that earns the home. Produces no branch and no pull
  request, and that has to be stated where the user is, not just decided here.
- **Reach into the teams it is on.** The thing that must not happen without an argument nobody
  has made yet: Mara on the work repo and Mara on the personal repo, addressed at profile grain,
  is a channel between two contexts the team model keeps apart.

## What must come out of it

1. **The verb list**, and where it is bounded. `accepts` is already blobot's own word for what a
   runtime takes; the trust words are already blobot's own vocabulary for how much it vouches.
   Whether a DM is a fourth trust position, a fixed posture, or a Machine kind's property is the
   real question underneath.
2. **What the transcript is.** Every transcript today hangs off a team. A profile-grain
   conversation is a **new top-level persisted object**, and it brings with it a place unread
   marks can appear, a place a permission request can arrive with nobody listening (*cancelled,
   never allowed*), a context gauge, and a compaction decision. Each of those is a real cost and
   none is optional once the object exists.
3. **Whether it has a mailbox.** Almost certainly not: `message_agent` is scoped by team and a
   DM'd agent has no peers. Say it, because a DM that silently cannot be reached by any teammate
   is a dead end the user will discover rather than be told.
4. **The two cases that actually motivate this**, and whether they need the general answer at
   all:
   - **Auditioning before hiring.** Today the only way to learn whether Mara-on-Codex works,
     whether her role reads well, whether the runtime is alive, is to form a team and give her a
     folder. One turn would answer it.
   - **Eliciting standing instructions.** The `handbooks` effort settled that a Handbook is
     *elicited, not authored*, and that *there is no third party in the room*. Standing
     instructions are the profile-grain twin and are still a text field the user fills in alone.
     The argument that killed authoring one grain down applies unchanged here.

   If a **probe** — one turn, not persisted as a conversation — answers both, then the DM is a
   want rather than a need, and this ticket should say so.

## The alternative that must be beaten

A **team of one**. An agent, a folder and a transcript already *is* a Team, and the creation flow
already has *make one for me* putting a git repository with one empty commit under `~/blobot`.
A two-click quick team delivers the DM's ergonomics with zero model change: worktree, routines,
handbook, compaction, permissions and publish all work, and a second member joins later without
migrating anything. Whatever this ticket concludes has to be better than that, and "it feels more
like messaging a colleague" is a real answer if it is argued rather than assumed.
