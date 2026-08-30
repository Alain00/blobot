Type: task
Status: open

# An edited persona, and a session that keeps the old one

## Problem

Research 01 measured it and ticket 05 built around it without closing it: **Codex stores
`developer_instructions` on the session.** A resumed session answers in the persona it was
created with, and a *different* persona in `CODEX_CONFIG` does not take. Both directions were
observed on a real Codex, 2026-08-30.

ADR-0002 says an edited agent definition is taken by a team at its **next start**, and that
sentence is true on the other two runtimes because a persona is re-supplied on every session:
Claude gets it in `session/new`, OpenCode in the config the process is launched with. On Codex a
next start that resumes with `session/load` silently keeps the old role, the old standing
instructions and the old teammates, and nothing anywhere says so.

`TeamPool` resumes. So the ordinary path — edit an agent, switch back to the team — is the path
that produces an agent still running as who it used to be.

`CodexAgentRuntimeOptions.resumeSessionId` carries a comment saying *do not pass one after the
persona has changed*, which is a warning to a caller that has no way of knowing.

## What to do

Decide where the knowledge lives, and there are only two honest places:

- **The store remembers what a session was started with.** A fingerprint of the composed persona
  beside `session_id` on the Agent row, compared at launch: unchanged resumes, changed starts a
  new session. Costs a column and a migration, and makes the rule true for every runtime rather
  than for this one.
- **The adapter refuses to resume when it is handed a persona it cannot verify.** Cheaper, and
  wrong in the other direction: it would start a new session on every launch, which is exactly
  the cost `TeamPool` was built to avoid.

Whichever wins, the *user-visible* half is the same and is not built either: a resumed agent and
a fresh one are indistinguishable on screen. `build.md`'s next-session list already carries
**"surfacing whether an agent resumed or started fresh"**, and this is the reason that stopped
being a nicety.

## Watch for

A new session is not free of consequence: it is a new context window, and the transcript the user
sees is blobot's, so the agent will not remember work the transcript still shows. That is the
same trade the Claude adapter already makes when a provider has forgotten a session, and it
should be said in the same words rather than invented twice.
