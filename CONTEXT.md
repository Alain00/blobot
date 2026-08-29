# blobot — domain glossary

Terms settled while charting the first demo. Use these words; don't drift to synonyms.

## Aggregates

- **Team** — a named group of Agents working on one Workspace. Owns the repository and scopes
  the message bus: "which agents can Alice address?" is answered by her Team. Also owns the
  turn budget.
- **Agent** — a named member of a Team with a role, a RuntimeProvider, and an AgentWorkspace.
  *Alice*, *Bob*.
- **Workspace** — the location a Team points at. Usually a git repository; **not necessarily
  code** — a folder of documents is a valid Workspace. One per Team.
- **AgentWorkspace** — an Agent's own isolated copy of the Workspace. Implemented today as a
  git worktree on a `blobot/<team>/<agent>` branch, but the name deliberately promises neither
  git nor Docker.

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
