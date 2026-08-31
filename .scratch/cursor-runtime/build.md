# cursor-runtime — build status and session handoff

## Where this stands, 2026-08-31 (evening)

**The adapter is built.** Ticket 06 was executed in one session on `feat/cursor-runtime`:
`packages/core/src/adapters/cursor/` (runtime, stdio, config, permissions, persona, palette,
extensions, fake, unit tests, live suite), the detection probe and remedies rows, the desktop
wiring (`runtime-for`, labels, `RuntimeMark`, `--live-cursor=` / `--live-cursor-mixed=`), the
core exports, and the `CLAUDE.md` bullet. Typecheck, tests (697 core + 449 desktop) and build
all pass. The map (`map.md`) stays the decision index; every resolution held under build.

## What was decided while building

- **No `context.ts`.** The PR shipped an empty ceilings table; fx ships none and `ceilingFor`
  answers `undefined` for an unknown id, which is the same honest fallback. The file lands the
  day a model is measured through this adapter, not before.
- **`writeCursorConfig` merges rather than clobbers.** The real `cursor-agent` caches display
  settings, model history and an `authInfo` block (identity metadata, not a credential) into
  its own `cli-config.json`; blobot asserts its four fields over the top and leaves the
  vendor's alone. `permissions` is written whole each start — safe because an allow-always
  lives in the session store, never in this file (measured, ticket 01).
- **No mailbox carve-out in the adapter.** Ticket 03 solved peer messages in config
  (`Mcp(blobot:*)` at every level), so `#onPermissionRequest` has no special case — unlike
  Codex (code) and fx (precaution). If the live canary shows a prompt anyway, that is the
  finding to bring back here.
- **`session/close` is never sent**: Cursor's `sessionCapabilities` advertises `list` only.
  `restart()` just opens a new session; the old row stays in the per-agent store.
- **The gh reading verbs ride the same `cmd:args*` split as git** (`Shell(gh:pr view*)`),
  because ticket 03's bar was mirroring Claude's verbs and the failure direction is a prompt.
  The live git-split test stands for the mechanism.
- **`RuntimeMark` uses the vendor's real glyph**: `cursor.com/brand/icon.svg`'s pointer path
  verbatim, cropped to its own mask bounds — the PR drew a pointer from memory.
- The `initialize` result carries **no `agentInfo`** (measured), so the adapter's version
  report usually says nothing; detection reads `cursor-agent --version` instead.

## What is NOT yet done

1. **The live done-when suite has not run.** `BLOBOT_LIVE_CURSOR=1 pnpm --filter @blobot/core
   exec vitest run src/adapters/cursor/live.test.ts` spends real turns on the user's Cursor
   subscription (~5 turns) — ask before running. It covers: persona/streaming/mode, the edit
   title (and whether Cursor populates `locations` or an fx-style repair is owed), the
   **git-split allow syntax** (ticket 03 orders fallback to git-wholly-unlisted if it fails),
   the **loopback canary** (ticket 02; the door contradicts the docs), sandbox-versus-loopback,
   and the palette. Extension reply shapes verify opportunistically (a wrong shape hangs a turn
   into its timeout).
2. **Two Cursor agents on one team** (`--live-cursor=<dir>`) and **the mixed team**
   (`--live-cursor-mixed=<dir>`) — the rest of ticket 06's done-when.
3. Close ticket 06 (`Status: resolved`) once the live suite passes, then **open a fresh PR**
   from `feat/cursor-runtime` to `main` — never a push to PR #1.

## Reviewed, 2026-08-31

A two-axis review (standards, spec) ran on the branch before the live phase. No hard
violations on either axis. Acted on: the spawn contract is pinned now (`cursorArgv` extracted,
`stdio.test.ts` pins the argv, the forbidden flags and the credential strip); the options
lever got a token-free live test reading the session's own catalogue; the extension shapes got
a dedicated live turn that invites `create_plan` and asserts the turn ends either way, printing
whether it fired; `DESIGN.md`'s "grows to four" became five. Recorded as follow-ups rather than
done here: **`permissionKind` is now five near-identical copies** across the adapters and maps
ACP's own vocabulary — a candidate for `adapters/acp/`, left because extracting it edits four
other adapters on a branch about a fifth; and the verb inventory (dangerous verbs, git/gh
split) is restated per adapter, which a third allowlist runtime should turn into shared data.

## The PR verdict, settled

PR #1 was mined as decided: `extensions.ts` and `palette.ts` taken with their tests (comments
updated with the measured reasons), the remedies/probe rows rewritten per ticket 05 (no
`alsoNamed`/`looksLike`; `isAuthenticated`, not the PR's guessed `loggedIn`), `config.ts` and
`permissions.ts` rewritten from the measurements, the runtime rebuilt on fx's shape.
