Type: grilling
Status: resolved

# Where the persona goes

## Problem

Ticket 01 measured the PR's answer dead: a rule in `<CURSOR_CONFIG_DIR>/rules/` is not read.
The channels that remain:

- **Ride the prompt every turn**, fx's answer and `composeLeadBrief`'s shape: above the user's
  words, never in the `messages` row, immune to a compaction blobot cannot see. Proven pattern,
  provider-agnostic, already built once.
- **`AGENTS.md` in the workspace root** — Cursor reads it, and ticket 14 refuses it: an
  AgentWorkspace is a checkout of the user's repository and the file can be committed home.
- Anything else Cursor turns out to read (parent-directory `AGENTS.md`, a session-level config
  option) — unmeasured, and fx's investigation already burned most of these candidates.

## Answer

**The persona rides the prompt, every turn** — fx's answer and `composeLeadBrief`'s shape:
above the user's words, never in the `messages` row, recomposed each turn, immune to any
compaction blobot cannot see. Decided by the author, 2026-08-31.

The alternatives died on measurement or on standing rules: `<CURSOR_CONFIG_DIR>/rules/` is not
read (ticket 01, turn 2 — the PR's `blobot-persona.mdc` never reached the model); `AGENTS.md`
in the workspace root is the committable file ticket 14 refuses every time; and fx's
investigation already burned the parent-directory and add-dir candidates on this exact
question. One consequence to hold: the account-level User Rules also ride into the session
(ticket 07), so the persona coexists with them rather than replacing them — same precedence
picture as everywhere else: what a person wrote outranks what blobot composed.
