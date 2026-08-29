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
- **Git-aware.** Agents are isolated by git worktree, not by convention.
- **The orchestrator owns agent-to-agent communication.** It is our concern, not ACP's, and
  never a full context copy between agents — always compact context.

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

Next: the UI (12), then the OpenCode adapter (03 + 16), then the Claude bridge (07). Nothing
has touched a real CLI yet.

The mock is not a stepping stone to be discarded: ticket 08 makes it a **shipped demo mode** that
reproduces every observed trap on purpose — ragged deltas, a cancelled tool reporting
`completed`, `used: 0` on cancel — because a kind mock produces a UI that shatters on first
contact with a real runtime.

`.scratch/` is tracked in git on purpose — the map is the canonical artifact, not scratch work.
