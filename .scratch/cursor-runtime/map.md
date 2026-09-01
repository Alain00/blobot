# Cursor as a runtime — wayfinder map

## Destination

Every decision needed to build the Cursor adapter is made and recorded on its ticket, so a later
session can take ticket 06 (the adapter) as pure execution: no measurement left to run, no
question left open. The build itself is out of this map's hands — ticket 06 stays open as the
handoff.

## Notes

- The domain spec is [spec.md](spec.md) in this directory; it predates this map and stays the
  narrative source. One correction to it: **the CLI is now installed on this machine**
  (`cursor-agent` and `agent`, 2026.08.25, in `~/.local/bin`, logged in), so ticket 01 is
  measurable here.
- **PR #1 on Alain00/blobot** (https://github.com/Alain00/blobot/pull/1) is a *prototype*, not a
  source of truth: an unreviewed AI-agent implementation of all six tickets, built without running
  ticket 01's measurement. Decided 2026-08-31: each ticket's resolution audits what the PR chose
  on that point and confirms or refutes it against the measurement; surviving pieces may be taken
  into our own branch at build time. Never merged as-is, never worked on directly.
- Skills for sessions here: grilling + domain-modeling for HITL tickets; research for AFK ones.

## Decisions so far

- [Does `CURSOR_CONFIG_DIR` give an agent its own `.cursor`?](issues/01-does-cursor-config-dir-give-an-agent-its-own-cursor.md):
  Measured live, 3 turns. The variable moves `cli-config.json` (posture, enforced) and the ACP
  session store, and the login survives — but **not** `mcp.json`, rules, or skills. The blocker
  dissolves anyway: **`session/new` accepts client-supplied `mcpServers`** with per-server
  headers, no approval step, refuting the docs and the PR's config-dir mechanism. Cursor can be
  a blobot runtime. New tickets 07 (the user's own servers walk in) and 08 (persona channel).
- [The loopback server has no client-supplied door](issues/02-the-loopback-server-has-no-client-supplied-door.md):
  False premise — `session/new` takes `mcpServers` with per-server headers, no approval, no file
  on disk. Standard door, plus a live canary because the docs deny it.
- [Trust, `approvalMode`, and a second sandbox](issues/03-trust-approval-mode-and-a-second-sandbox.md):
  `allowlist` always, mode pinned `agent`; allow widens across the three attended words (real
  gradation, second runtime after Claude); **deny stays empty** — measured as a silent block, so
  the dangerous verbs are unlisted and prompt; `Mcp(blobot:*)` allowed at every level; sandbox
  enabled + network as a constant; `unattended` waits on its own auto-review measurement.
- [The two extension methods that block the turn](issues/04-the-two-extension-methods-that-block-the-turn.md):
  `ask_question` refused in-channel, `create_plan` rejected, unknown blocking method errors,
  notifications ignored. PR's implementation survives; wire shapes verified at build.
- [Detection, login, and a binary called `agent`](issues/05-detection-login-and-a-binary-called-agent.md):
  Probe `cursor-agent` only, never bare `agent`; `status --format json`; vendor install +
  `cursor-agent login` on PTY; API-key env stripped; auto-update an accepted named risk.
- [The user's own servers walk into the session](issues/07-the-users-own-servers-walk-into-the-session.md):
  Left loaded — the operator added them (ADR-0003 parity). Per-agent tool restriction is a
  future cross-runtime effort; the measured `mcp disable` door is its inventory.
- [Where the persona goes](issues/08-where-the-persona-goes.md):
  Rides the prompt every turn, fx's shape. Config-dir rules measured unread; `AGENTS.md` refused.
- [The Cursor adapter](issues/06-the-cursor-adapter.md):
  Built and verified live on `feat/cursor-runtime` — the full done-when spent: the seven-test
  live suite, two Cursor agents messaging both ways, and a mixed Claude+Cursor team. The map
  is complete and the effort is closed.

## Not yet specified

(nothing — the frontier is empty and every ticket is resolved; the effort is closed)

## Out of scope

- **`unattended` on Cursor**: `--auto-review` is the same shape as Claude's `auto` and the
  author wants the full trust set here eventually — but it earns its way in through its own
  measurement effort (does the classifier consult `deny`? do the nine verbs hold?), not this one.
- **Per-agent restriction of which MCP servers, skills and tools an agent gets** — a future
  cross-runtime effort (from ticket 07). The measured per-workspace `mcp disable` door is its
  inventory.
- Cursor's own worktrees (`--worktree`), Cloud Agent handoff (`&`, `agent worker`), and team-level
  MCP servers from the Cursor dashboard (docs say ACP mode does not support them anyway).
- `-f` / `--force` / `--yolo` and `approvalMode: unrestricted`, at every trust level, for the
  reason ticket 14 gives every time.
