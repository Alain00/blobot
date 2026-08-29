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

The first demo is **planned, not built**. The plan is a **wayfinder map** at
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

There is **no application code yet** — the repo is the map, the glossary and this file. The first
build session's job is the monorepo skeleton (`apps/desktop`, `packages/core`), not a feature.

`.scratch/` is tracked in git on purpose — the map is the canonical artifact, not scratch work.
