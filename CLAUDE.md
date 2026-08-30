# blobot

A local-first desktop application that lets a user assemble **teams** out of the coding
agents they already have installed — Claude Code, Codex, Gemini CLI, OpenCode — and watch
them work together on a repository.

This repository is a monorepo.

## Permanent architectural rules

These are not negotiable per-milestone. If a change appears to require breaking one, stop
and raise it rather than working around it.

- **Local-first.** No cloud dependencies. No hosted service is required for the app to run.
- **No hosted inference.** The app never provides LLM inference and never proxies provider
  API credentials. Agents use the user's existing local authentication.
- **No credential storage.** We do not build a credentials database and we do not persist
  API keys. The underlying CLI owns its own login.
- **ACP preferred.** The Agent Client Protocol is the primary integration path. CLI
  adapters are a fallback, not a default.
- **Providers live behind `AgentRuntime`.** Every provider-specific quirk is owned by its
  adapter. Nothing outside the adapter may know which provider an agent is.
- **The UI is provider-agnostic.** No provider-specific logic in React components, ever.
- **Docker is invisible infrastructure.** The user never sees or types a Docker command.
- **Git-aware.** Agents are isolated by AgentWorkspace, not by convention — a git worktree
  wherever git can hold the Workspace, a plain copy where it cannot. Never a shared directory.
- **The orchestrator owns agent-to-agent communication.** It is our concern, not ACP's, and
  never a full context copy between agents — always compact context.
- **The blobatars are the only saturated thing on screen.** Status is monochrome, carried by
  motion, a mono word and a hairline. The rest of the interface's rules, and the reason behind
  each, live in `DESIGN.md` at the repo root. **Read it before changing anything a user sees.**

## Engineering constraints

- TypeScript strict mode.
- Runtime implementations sit behind interfaces.
- Agent status updates are event-driven.
- No premature abstraction beyond clear runtime boundaries.
- Typecheck, tests and build must pass before any milestone is called done.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Interface

`DESIGN.md` at the repo root is the standard: tokens, the three transcript voices, controls,
icons, motion, product copy, and what the stylesheet's one flat namespace demands of you. It is
binding the way the architectural rules are — contradicting a rule is a ticket 12 reopen and a
note in `build.md`, adding to it is ordinary work.

## Current work

The first demo is **planned, and being built**. The plan is a **wayfinder map** at
`.scratch/first-demo/map.md` — read it before doing anything, along with `CONTEXT.md` for the
domain glossary.

**The map is complete.** Sixteen tickets, all resolved, frontier empty: nothing is left to
*decide* before this code gets written. Do not run `/wayfinder` on it — there is no next ticket.

Read the map's *Decisions so far* index to judge relevance, then zoom into only the tickets your
task actually touches. No session should hold all sixteen; that is the point of the map. Reasons
live on each ticket in `.scratch/first-demo/issues/`, and several decisions are backed by
research observed against the real CLIs on this machine (`.scratch/first-demo/research/`, with
raw transcripts).

Decisions are binding. **If you believe one is wrong, say so and reopen its ticket. Do not
quietly contradict it.** Ticket 12 carries an amendment from ticket 14; check for an `##
Amendment` section before treating an answer as final.

**Build order starts with `MockAgentRuntime`**, so that everything above it has something real to
run against before a single CLI is spawned. The UI (ticket 12) is built against the mock, not
against OpenCode.

Built so far, all in `packages/core` (pnpm workspaces + vitest; `pnpm demo` plays a two-agent
team headlessly):

- The `AgentEvent` vocabulary (04), the `AgentRuntime` interface, the injected `Clock`, and
  core's message assembler — deltas pass through, `agent_message_completed` is synthesized.
- `MockAgentRuntime` (08) with eight checked-in scenarios, reproducing the observed traps.
- The status fold (09): `AgentStatusTracker`, derived, never persisted.
- The orchestrator (05 + 06): mailbox, auto-wake, mid-turn queueing delivered as one numbered
  prompt, per-team turn budget, persona and envelope composition, `message_agent` tool handler.
- The SQLite store (13): Drizzle schema, checked-in migrations, `SqliteStore` behind
  `MessageStore`, and `SqliteRecorder` persisting the durable subset of the event stream.
- `@blobot/core/domain`: the pure entry point (event vocabulary, aggregates, status fold,
  roster lookup) with no Node dependencies, for consumers that must not pull in SQLite — the
  renderer today, a CLI later.
- The UI (12) in `apps/desktop`: Electron + React, variant A's rail / conversation / feed, the
  three voices, monochrome status, `@mention` addressing. Runs demo mode on mock runtimes.
  `pnpm --filter @blobot/desktop exec electron-vite build` then run electron with
  `--screenshot=<path>` (optionally `--pane=<agentId>`, `--screenshot-at=<ms>`) to review it
  without a human at the screen.

**Build status and session handoff live in `.scratch/first-demo/build.md`** — what is built, what
was decided while building that no ticket covers, the known gaps, and what the next session picks
up. Read it before starting work.

- The **Claude Code adapter** (02 + 07 + 14) in `packages/core/src/adapters/claude`: the pinned
  `@agentclientprotocol/claude-agent-acp` bridge spawned over stdio, JSON-RPC spoken directly so
  core still imports no ACP type, `session/set_mode("default")` forced on every session. A real
  `claude` answers, streams, runs tools and cancels — `BLOBOT_LIVE_CLAUDE=1` runs those tests,
  and `--live-claude=<dir>` puts a real agent behind the real UI.

- **Ticket 15's loopback MCP server** in `packages/core/src/mcp`: one tool, `message_agent`,
  over `127.0.0.1` with a per-agent bearer token that *is* the caller's identity, stateless
  because neither runtime re-handshakes, and readiness measured by the inbound handshake rather
  than by `session/new`. `--live-claude=<dir>` now runs **two real Claude agents who message
  each other** through the orchestrator's mailbox.

- **Ticket 10's AgentWorkspaces** in `packages/core/src/workspace`: git worktrees on
  `blobot/<team>/<agent>` under `~/.local/share/blobot/worktrees/`, branched from `HEAD`,
  outside the user's repository, with the launch reconcile (repair a missing directory, report
  a missing branch) and the `-d`-versus-`-D` rule on deleting an agent. **Amended 2026-08-29:
  a Workspace need not be a repository.** Three kinds — `git`, `nested` (a folder of
  repositories, of which the user picks the ones in scope), `plain` (a copy per agent) — one
  provider each behind `workspaceProviderFor`. A copy has no branch, no diff and no recovery,
  and the flow says so where the folder is chosen.

- **Persistence and team creation** (11 + 13): one SQLite file under Electron's `userData`, a
  creation flow that picks a Workspace and forms a team out of agents, and ticket 11's detection
  behind the runtime picker — four honest states, never the word *authenticated*, gating
  nothing. With no flags the app is the product; `--demo` is the scripted team.

- **Agents exist independently of teams** — `docs/adr/0001-agents-exist-independently-of-teams.md`,
  the repo's first ADR, and the reason `CONTEXT.md` now has an **AgentProfile**. An agent is
  hired once, on no team, and can be on several at the same time; joining a team instantiates an
  Agent from it, because a workspace, a session, a mailbox and a status are things a Team gives
  an Agent and none of them can be shared.

Switching a team no longer restarts it: `TeamPool` keeps the last three live, LRU by
selection, never evicting the active team or one that is mid-turn, and the Claude adapter
resumes with `session/load` so a team that *was* evicted comes back knowing the conversation.
Every stream channel leads with a team id, because several teams stream at once now.

Next: **ticket 14's disclosure and permission block**, then editing a team. OpenCode (03 + 16) is deferred by the author, 2026-08-29; the cost of proving
`AgentRuntime` against one provider only is recorded in `build.md`.

The mock is not a stepping stone to be discarded: ticket 08 makes it a **shipped demo mode** that
reproduces every observed trap on purpose — ragged deltas, a cancelled tool reporting
`completed`, `used: 0` on cancel — because a kind mock produces a UI that shatters on first
contact with a real runtime.

`.scratch/` is tracked in git on purpose — the map is the canonical artifact, not scratch work.
