# cursor-runtime — build status and session handoff

## Where this stands, 2026-08-31

**Nothing is built. Everything is decided.** The map (`map.md`) is complete: tickets 01–05, 07
and 08 are resolved, the frontier is empty, and **ticket 06 is the whole of what remains** — a
pure-execution handoff whose body restates every resolution just enough to build from. Read it
first; zoom into the other tickets only where its one-line restatement is not enough.

Ticket 01 was **measured live** on this machine (`cursor-agent` 2026.08.25-3e8eec8, logged in,
three real turns). The decisive facts and their evidence live in that ticket's Answer; the map's
*Decisions so far* is the index.

## The PR is a quarry, not a base

PR #1 on `Alain00/blobot` (`gh pr view 1`, head `cursor/cursor-acp-runtime-5197`) implemented all
six original tickets without running ticket 01's measurement. Decided: audit-and-mine, never
merge or rebase — it is based on a **pre-fx main** and does not rebase cleanly anyway. Ticket 06
carries the per-file verdict table: `extensions.ts` and `palette.ts` survive, `config.ts` and
`permissions.ts`'s deny approach are **refuted by measurement**, the runtime/stdio files are
unaudited. Cherry-pick by file, against the resolved tickets, with credit where a piece survives.

## What the next session does

1. Work on `feat/cursor-runtime` (branched from main at 432b2c7; first commit is this scratch).
2. Build ticket 06 in `packages/core/src/adapters/cursor/`, reusing `adapters/acp/`.
3. Live verification needs the user: `BLOBOT_LIVE_CURSOR=1` spends real turns on the user's
   Cursor subscription — ask before running, same as the other four runtimes. The done-when
   list (canary, sandbox-vs-loopback, git-split syntax, extension wire shapes, live edit title,
   two Cursor agents messaging, a mixed team) is on ticket 06.
4. Update `CLAUDE.md`'s current-work section (Cursor becomes the fifth runtime), and this file,
   when the build lands.
5. Open a PR from `feat/cursor-runtime` to `main` — a fresh PR, not a push to PR #1.

## Decided while building

(nothing yet — this section is the next session's)
