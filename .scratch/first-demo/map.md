Label: wayfinder:map

# First demo

## Destination

A locked spec for blobot's first demo, ready to hand to fresh implementation sessions:
**install → open a repo → the app detects OpenCode and Claude Code → create a team with
Alice and Bob in isolated git worktrees → ask Alice something → Alice asynchronously
messages Bob → both blobatars are visibly working at once.**

The map is done when nothing is left to *decide* before someone writes that code.

## Notes

**Domain.** blobot is a local-first Electron desktop app that assembles teams from the
coding agents a user already has installed. It provides no inference and stores no
credentials. See `CLAUDE.md` for the permanent architectural rules — they bound every
ticket here and are not up for renegotiation inside one.

**Settled while charting** (these are premises, not decisions to revisit):

- Destination is a **spec**, not working software. Plan, don't do.
- Audience: open source, built for the author. Commercial intent is a later, separate call.
- Appetite: a couple of weeks of evenings.
- Shell: **Electron** + React + TypeScript. Chosen so the domain layer, the `AgentRuntime`
  interface and the ACP JSON-RPC client are one language.
- Demo cast: **OpenCode + Claude Code**. Codex and Gemini are not installed on the dev
  machine and are not load-bearing for the demo.
- Agent-to-agent messaging is **asynchronous**. Bob is a peer with a mailbox, not a tool
  call of Alice's. This is what makes it a team rather than a delegation tree.
- Orchestrator runs in the **Electron main process**, written as a plain TypeScript module
  with no Electron imports so it stays extractable.
- **Team is a real aggregate** — it owns the repository and scopes the message bus.
- **Not only for code.** An agent owns an isolated directory and does whatever it likes in it.
  A git worktree is the mechanism when the Workspace is a repo, not the concept. Docker stays
  out of scope, but a non-code Workspace must remain plausible.
- Monorepo is **two packages**: `apps/desktop` and `packages/core`. The boundary exists to
  make "the UI cannot import a provider" a dependency-graph fact.
- *Avatar* is the domain term. `blobatar@2.6.0` is a dependency, seeded on agent id, and
  lives only in the UI layer. Not a design question.

**Skills every session should consult:** `/grilling` and `/domain-modeling` by default.
`/research` for the research tickets. `/prototype` where the question is "how should it
look or behave".

## How to continue this map

Run `/wayfinder .scratch/first-demo/map.md` in a fresh session. It will load this file, take
the first ticket on the frontier, and resolve exactly one.

The **frontier** is every ticket under `issues/` that is `Status: open`, unclaimed, and whose
every `Blocked by:` entry is `Status: resolved`. Tracker conventions — claiming, resolving,
blocking — are in `docs/agents/issue-tracker.md`.

**Read this file and the ticket you are taking. Do not read every ticket.** The Decisions-so-far
index below exists so you can judge relevance and zoom only into what you need; the point of the
map is that no session has to hold all of it.

Research findings live in `research/`, with raw transcripts alongside. They are long and
observed — cite them rather than re-deriving.

## Decisions so far

- [Can an ACP client give an agent a tool?](issues/01-can-an-acp-client-give-an-agent-a-tool.md) — Yes, via `session/new.mcpServers`; ACP has no tool-declaration primitive and MCP is the prescribed path. Session-creation-time only. Verified against OpenCode 1.18.4. Its stdio `type` trap applied to a now-deprecated package — see the correction on the ticket.

- [Detecting installed and authenticated agents](issues/11-detecting-installed-and-authenticated-agents.md) — Presence is detectable only by running the binary (a config dir proves nothing: `~/.codex/` exists here with no codex installed). Auth is asymmetric — a negative is reliable, a positive is not — so the UI says Not installed / Needs sign-in / Ready / Status unknown, never "Authenticated", and detection never gates team creation.

- [Is Claude Code's ACP support real?](issues/02-is-claude-codes-acp-support-real.md) — No native ACP and none coming (issue closed 2026-02-09), but `@agentclientprotocol/claude-agent-acp@0.70.0` over stdio works: token deltas, tool-call lifecycle, cancellation, cross-process resume and custom MCP tools all verified live. Pin the version and pin `CLAUDE_CODE_EXECUTABLE` to the user's own binary.

- [OpenCode's ACP session and event surface](issues/03-opencodes-acp-session-and-event-surface.md) — `opencode acp`, NDJSON-RPC on stdio, six update kinds; turn completion is the RPC reply's `stopReason`, not an event. `cwd` binds per-session not per-process. Errors arrive on two channels. Hard constraints: serialize prompts per session, separate agent/client request-ID spaces, and a cancelled tool still reports `completed`.

- [The normalized AgentEvent vocabulary](issues/04-the-normalized-agentevent-vocabulary.md) — Nine members, our own type (never an ACP passthrough; `packages/core` exports no ACP type). OpenCode's set is a strict subset of Claude's, so no reconciliation problem. `turn_ended`, `agent_message_completed` and `agent_message_sent` are synthesized; tool failure stays in the tool lifecycle; permission requests are a callback, not an event; `available_commands_update` is dropped.

- [How messageAgent reaches an agent](issues/05-how-messageagent-reaches-an-agent.md) — Orchestrator hosts an MCP server on loopback HTTP (token-guarded) and is itself the tool handler. Free-form recipient validated by the orchestrator; ack carries recipient state, no message id. Auto-wake on idle, queue mid-turn and deliver as one prompt. Replies are explicit, never auto-routed. Per-team turn budget (default 10) bounds runaway. Ack means committed to SQLite.

- [What Bob actually receives](issues/06-what-bob-receives.md) — Static situation (role, repo, worktree, roster, peer-visibility rule) goes in an adapter-owned persona; the envelope carries only sender, their role, an optional context line they supply, and a trust framing marking it as a peer request rather than an operator instruction. One shared session per agent, fully visible to the user. Queued batches arrive as a numbered list. Alice's uncommitted work is invisible to Bob — stated, not hidden.

- [The agent status state machine](issues/09-agent-status-state-machine.md) — Seven statuses (`done` dropped, `responding` added), precedence `waiting > working > responding > thinking`. Derived in memory from the event stream, never persisted. Only process-level failure is sticky; cancel/refusal/max-tokens return to `idle`. On relaunch everything is `idle` and queued messages are held, not auto-delivered. Runtime availability stays orthogonal.

- [Worktree layout and launch reconcile](issues/10-worktree-layout-and-launch-reconcile.md) — AgentWorkspaces live outside the user's repo under blobot's data dir, on `blobot/<team>/<agent>` branches cut from `HEAD`. A non-git Workspace is *offered* `git init`. blobot never commits for an agent. Reconcile repairs a missing directory silently and reports a missing branch as data loss. Deleting an agent keeps its branch only if it has unmerged commits.

- [The Claude Code adapter strategy](issues/07-the-claude-code-adapter-strategy.md) — Claude's own subagents run unobserved (we never subscribe to the subagent transcript). Bob inherits the user's entire Claude Code config — MCP servers, hooks, skills, project `CLAUDE.md` — with the surprise vectors named. Exact-pinned dependency that fails loudly, `CLAUDE_CODE_EXECUTABLE` pinned to the user's binary, one bridge process per agent.

- [MockAgentRuntime's fidelity contract](issues/08-mockagentruntime-fidelity-contract.md) — Ships as a demo mode. Reproduces every observed trap on purpose (ragged deltas, cancelled-tool-reports-completed, `used: 0` on cancel), because a kind mock produces a UI that shatters on first contact. Checked-in builder scenarios plus a dev control panel; injected clock; peer messages hit the real tool handler but not the real socket.

- [OpenCode's persona mechanism](issues/16-opencode-persona-mechanism.md) — Real and native: ACP "modes" are OpenCode agents, and `agent.prompt` becomes a genuine cached system prefix. Injected via `OPENCODE_CONFIG_CONTENT` (inline JSON env var) so blobot writes no file into the user's repo. No fallback preamble needed. Trap: restored mode comes from message history, so the adapter must re-send `session/set_mode` after every load or resume.

- [Verify loopback HTTP MCP against both runtimes](issues/15-verify-loopback-http-mcp.md) — **Viable on both**; the transport decision stands. Bearer token honoured on every request. Four requirements added: readiness must come from the inbound MCP handshake (a dead port fails silently at `session/new`), the endpoint must be stateless (no re-handshake after a drop), `message_agent` needs an idempotency key and a non-blocking handler, and `mcpServers` must be re-supplied on `session/load`.

- [The team and conversation UI](issues/12-team-and-conversation-ui.md) — Rail / conversation / feed, with the **team as an item in the rail drawn as a group**, so there is one conversation per agent *and* one for the team without a second surface. A peer message is a dashed enclosure with both blobatars in its header — never a bubble, because dashed-against-solid reads as lower authority before a word is parsed. Status is monochrome through three channels (motion, a mono word, a sweeping hairline), with inversion reserved for `waiting` and desaturation for `failed`. The recipient is an `@mention`, not a picker.

- [The SQLite schema for the demo](issues/13-sqlite-schema-for-the-demo.md) — Eight tables, **Drizzle** over `better-sqlite3` inside `packages/core`, one connection in main and none in the renderer. Our store is the transcript of record (04's question, answered yes) and persists the *durable subset*, never deltas. A peer message is **one row**, discriminated by `from_agent_id IS NULL`; the mailbox is `delivered_at IS NULL`, a predicate rather than a table. Runtime config is typed columns so there is nowhere to put a secret. Agents tombstone, never cascade. Status and the consumed turn count stay unpersisted.

## Not yet specified

- **Enforcing commit-before-review across worktrees.** Ticket 06 chose to *tell* agents that
  peers cannot see uncommitted work rather than enforce it. The enforced version — blocking or
  warning on `messageAgent` when the sender references paths she has modified but not committed —
  needs the git-awareness layer to exist first.

- **A live plan/todo view per agent.** The Claude bridge maps `TodoWrite` to a `plan` event
  and OpenCode has no counterpart, so it was cut from the vocabulary as a provider leak. It is
  the most obviously useful of the dropped events, and worth revisiting once a second runtime
  can produce something equivalent.

- **Task and Handoff.** The plan's step 11 makes shared tasks explicit before autonomous
  delegation. Whether the demo needs any of it — or whether a message *is* the handoff at
  this size — can't be settled until async messaging has a shape.
- **Failure propagation across a team.** Single-agent cancellation is now well understood
  (`stopReason: "cancelled"` on both runtimes). What remains foggy is the team-level case:
  what happens when Bob's runtime dies mid-turn while Alice is waiting on him, and what a
  provider/API failure mid-turn even looks like — the one event-surface case the research
  could not observe.
- **The team stream past three agents.** The team pane interleaves every agent's messages
  into one chronological stream and de-duplicates a peer message to its single crossing. That
  reads well at three. What it does at eight — ordering, density, whether tool activity belongs
  in it at all — was not prototyped, and the answer probably arrives as filtering rather than
  as a new layout.

- **Making the hop visible.** The killed variant C drew a peer message physically crossing the
  gutter between two agents, which is the clearest rendering of the demo's claim that anyone
  produced. It does not survive a third agent, but the in-flight moment is worth stealing back
  into the team stream once there is something to animate against.

- **Retention.** Ticket 13 prunes nothing, deliberately — at demo scale it is kilobytes a day
  and a policy wants real usage behind it. `events` was kept append-only and never updated
  specifically so the decision stays cheap: a future prune is a `DELETE WHERE at < ?` and
  nothing else in the schema has to care.

- **First-run and onboarding flow.** The "zero setup" experience from step 19. Needs
  detection to have a shape first.
- **Packaging and distribution.** Signing, auto-update, what an OSS release even looks
  like. Real, but nothing about it is answerable yet.

## Out of scope

- **Docker / container isolation** (plan steps 13–14). Ruled out by the two-week appetite;
  git worktrees give real isolation at a fraction of the cost.
- **Autonomous coordination** (step 20) — manager agent, task splitting, dependency graphs,
  review loops. The plan itself calls this v0.2+.
- **Codex and Gemini adapters** (step 9). Neither is installed; both are post-demo proof
  that the abstraction generalises, not load-bearing for it.
- **Credential storage and an approvals system** (steps 15–16). Forbidden and deferred
  respectively; the underlying CLI owns login, and the demo does nothing destructive.
- **Session restore across restarts** (step 18). Only *workspace* reconciliation survives
  the cut — see the worktree ticket.
