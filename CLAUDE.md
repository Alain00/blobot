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

This project is being planned before it is built. The plan is a **wayfinder map** at
`.scratch/first-demo/map.md` — read it before doing anything, along with `CONTEXT.md` for the
domain glossary.

The map's destination is a locked spec for the first demo. Its decisions are binding: they were
made deliberately, with reasons recorded on each ticket in `.scratch/first-demo/issues/`, and
several are backed by research observed against the real CLIs on this machine
(`.scratch/first-demo/research/`, with raw transcripts).

If you believe a decision is wrong, say so and reopen its ticket. Do not quietly contradict it.

`.scratch/` is tracked in git on purpose — the map is the canonical artifact, not scratch work.
