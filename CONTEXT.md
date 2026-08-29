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
  AgentWorkspace. *Alice*, *Bob*. Name and role are copied from the profile when the team is
  formed, so renaming an agent later cannot rewrite what a transcript says it was called.
- **Workspace** — the location a Team points at. **Not necessarily code, and not necessarily a
  repository** — a folder of documents is a valid Workspace. One per Team. It is one of three
  *kinds*, decided by looking at it and stored on the Team, because the kind chooses the
  mechanism: `git` (a repository), `nested` (not a repository, but it contains some), `plain`
  (no repository anywhere).
- **AgentWorkspace** — an Agent's own isolated copy of the Workspace. One per Agent per Team.
  The name deliberately promises neither git nor Docker, because the mechanism follows the
  kind: a worktree on a `blobot/<team>/<agent>` branch, a mirrored tree of worktrees for the
  repositories in **scope**, or a plain copy. The isolation is the same in all three; the
  *guarantees* are not, and a copy has no branch, no diff and no recovery.
- **Scope** — for a `nested` Workspace, the repositories the user put in. A repository out of
  scope is **absent** from the AgentWorkspace, not present and off limits.

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
- **Envelope** — the framing wrapped around a peer Message: sender, their role, their optional
  context line, and the note that a peer carries no operator authority.
- **Standing instructions** — what is true of an AgentProfile on *every* team it is on. Folded
  into its Persona, and said as such, so it is never mistaken for this team's framing.
- **Persona** — an Agent's system prompt. Carries the static facts about its situation (role,
  Workspace, AgentWorkspace path, roster, the rules). Adapter-owned.
- **Mailbox** — an Agent's queue of undelivered Messages. Delivered as one prompt when the Agent
  is next free.

## Events

- **AgentEvent** — blobot's normalized event vocabulary. Our own type, never an ACP passthrough;
  `packages/core` exports no ACP type.
- **Status** — an Agent's current activity, derived in memory from its AgentEvent stream. Never
  persisted.

## Avoid

- **"worktree"** as a domain term — it is the git *mechanism* behind AgentWorkspace, not the
  concept. Say AgentWorkspace unless you mean the git object specifically.
- **"Authenticated"** for runtime detection — the probe cannot prove a credential works. Say
  *Ready*, *Needs sign-in*, *Not installed*, or *Status unknown*.
- **"done"** as an Agent Status — it was dropped; an Agent that finishes a Turn is *idle*.
