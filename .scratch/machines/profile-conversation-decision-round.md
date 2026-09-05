# Profile conversation — first decision round

Owner: [What an agent addressed outside a team may do, and what its transcript is](issues/07-what-a-dmd-agent-may-do.md).
Prepared after the completed profile-overview commit `7f5ef42`.
**Accepted, 2026-09-06:** after requesting an explanation, Guillermo answered “si esta bien asi”.

## Settled prerequisites

The profile overview is membership metadata, not a physical home or an execution location.
Every existing working Agent still belongs to a Team and owns its own Machine and workspace.
Knowing names/roles of other memberships adds no communication or execution authority.
Standing instructions remain under user control; no personal-memory writer was approved.

## First decision: does direct contact need a separate conversation object?

Recommendation: a direct-contact action from a profile opens a **visible individual Team**,
with one Agent, its own folder/worktree and persistent transcript. It can converse, use the
runtime's ordinary tools and produce files/commits under the same Machine and approval rules
as other teams. A fresh workspace can be prepared without the user supplying a repository.
The UI must disclose that this creates a Team and a folder; it must not disguise a hidden
Team as a separate global inbox. Other teams' transcripts and files are not imported.

This product recommendation is now authorized. A true profile DM would
be a separate persisted conversation/session context with its own lifecycle, unread marks,
permission handling and compaction. That may be worth doing if the point is a conversation
which is not a Team; the author must decide that distinction. The accepted metadata overview
does not decide it. Likewise, this proposal does not let the Agent edit standing instructions
off screen or message other memberships.

## Facts checked locally

- `apps/desktop/src/main/team-store.ts:createTeam` accepts one profile and makes the first
  member lead by default. Provisioning still creates a separate AgentWorkspace and Agent row.
- `prepareWorkspace` in the same module prepares a folder below `~/blobot`; the existing
  `NewTeam` flow discloses that folder before creation. No new location policy is needed merely
  to permit a one-member team.
- [Where a profile is addressed from, on screen](issues/18-the-profile-conversation-on-screen.md)
  explicitly allows the owning decision to choose a one-member team or probe instead of a
  new profile conversation. Its prototype must draw whichever outcome the author accepts.
- `RunningTeam`, `startTeam`, the orchestrator and current persisted transcripts are scoped
  by Team/Agent. A separate DM needs an explicit owner of those responsibilities, not a
  reused session from another membership.
- A bounded read-only adapter review found no `AgentRuntime` contract that enforces a
  tool-free session. `setPermissionHandler` handles requests the provider actually sends;
  refusing them does not stop operations it performs without asking. In particular, Codex's
  bridge mode called `read-only` permits workspace edits/execution in the configuration used
  here (`adapters/codex/permissions.ts`). Declining client filesystem/terminal capabilities
  causes adapters to use provider tools, not to disable those tools. Therefore “conversation
  only” cannot be presented as an implemented safety guarantee or obtained by merely omitting
  blobot's MCP tools. A distinct restricted DM would need additional capability work and
  verification before such a promise. No live CLI or inference was run for this code review.

## Accepted question

Does the author accept direct contact through a visible, persistent one-member Team with its
own workspace, ordinary tools and transcript, as the first version of “talk to this agent”?

The explanation explicitly included a visible ordinary Team, its own workspace/history/tools,
and no automatic import from the profile's other teams. The remaining behavior follows those
accepted contracts and the user's delegation of basic implementation choices:

- Offer the profile's active one-member teams by their names, so the user chooses which
  history to continue. Do not guess a target from recency, a name match or a hidden default.
- Offer creation through the existing team flow, preselecting this profile and disclosing the
  folder before creation. The Team is visible in the ordinary list. Adding members later is
  normal roster editing and removes it from this individual-team chooser.
- Help draft standing instructions in conversation, then save through the existing profile
  editor. No new self-edit tool or automatic promotion, as already settled by the home choice.

This resolves the proposed follow-up questions without adding a new profile inbox, Machine
kind, approval posture or shared-memory authority. The screen ticket owns the entry-point UI.
