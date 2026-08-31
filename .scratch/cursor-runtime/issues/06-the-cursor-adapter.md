Type: task
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 07, 08

# The Cursor adapter

## Problem

Every decision is made; this is pure execution. All seven other tickets are resolved and their
answers are binding — this body restates them only enough to build from, and each ticket holds
the reason. There is no bridge to pin: `agent acp` is Cursor's own.

## What to do

In `packages/core/src/adapters/cursor/`, reusing `adapters/acp/` (JSON-RPC, transport, wire
shapes, `session/update` translation — the fx effort proved the shared half against a fourth
party):

- **Spawn**: `cursor-agent acp --workspace <ws>`, `cwd` the AgentWorkspace, **never**
  `--worktree`, `--force`, `--plugin-dir`. Env: `CURSOR_CONFIG_DIR=<blobot data>/cursor-config/
  <agent>` — it carries `cli-config.json` (the posture) and `acp-sessions/` (resume state), and
  that is all it carries (01). `CURSOR_API_KEY` / `CURSOR_AUTH_TOKEN` stripped (05).
- **Loopback**: the per-agent server on `session/new`'s `mcpServers`, headers
  `[{name: "Authorization", value: "Bearer <token>"}]`. No `mcp.json` anywhere, no approval
  step (02). `Mcp(blobot:*)` in `permissions.allow` at every level so a peer message never
  prompts (03).
- **Posture**: `permissions.ts` per ticket 03 — `allowlist` always, allow widens with the three
  attended trust words, **deny empty** (deny is a silent block, measured), sandbox
  `enabled` + network as a constant, `CURSOR_TRUST_LEVELS` = the three attended levels.
  Live-verify the `Shell(git:status*)` args-syntax split; fall back to git wholly unlisted.
- **Persona**: rides the prompt every turn, `composeLeadBrief`'s shape (08). Nothing written
  into the workspace or the config dir for it.
- **Extensions** (04): `cursor/ask_question` refused in-channel, `cursor/create_plan` rejected,
  unknown blocking method → JSON-RPC error, notifications ignored. Verify the reply shapes
  against the real wire — the PR's `skipped`/`rejected` outcomes are unmeasured.
- **Resume**: `session/load`, re-supplying `mcpServers`, muting replay, **re-asserting mode
  `agent`** (the OpenCode lesson). Sessions live under the config dir, so pool eviction
  survives it.
- **Palette**: ADR-0003's allowlist — authored (workspace `.cursor/`, `~/.cursor`, `~/.agents`)
  ∩ advertised, **zero vouched built-ins**: a live session advertised 130 commands including
  `worktree`, `apply-worktree`, `autopilot`, `shell` — nothing there blobot should hand a team
  member (measured, ticket 01 session logs).
- **Options**: the model groups the session advertises (`models` on `session/new`: Auto,
  grok-4.6, composer, claude-opus…) minus what blobot decides; the setting lever is unmeasured —
  verify whether `session/set_config_option` or a Cursor method applies, the ADR-0002 pattern.
- **Traps to encode against the mock's standards**: a denied command's `tool_call` reports
  `status: completed` (the refusal is only in the text); the user's own MCP servers, skills and
  User Rules load into the session by design (07 — comment the parity argument).

Outside it: a case in `runtime-for.ts` + label + `RuntimeMark`; detection and remedies per
ticket 05 (`cursor-agent` only, `status --format json`); `--live-cursor=<dir>` beside the other
five roster shortcuts.

## The PR as quarry

PR #1 (Alain00/blobot) is based on a pre-fx main and does not rebase; cherry-pick by file:

| File | Verdict |
| --- | --- |
| `extensions.ts` + test | **Survives** — matches ticket 04; verify wire shapes live |
| `palette.ts` + test | **Survives** — matches ADR-0003 and the zero-built-ins answer |
| `remedies.ts` rows | **Survive** (install + login rows as ticket 05) |
| `runtimes.ts` | **Partial** — keep `status --format json` probe; drop `alsoNamed`/`looksLike` |
| `config.ts` | **Refuted** — no `mcp.json`, no `rules/`; only the `cli-config.json` write survives, reduced |
| `permissions.ts` | **Refuted on deny** — `ALWAYS_DENY` implements the wrong semantics; allow lists partially reusable |
| `cursor-agent-runtime.ts`, `stdio.ts`, `fake-cursor.ts` | **Unaudited** — read against the resolved tickets at build time |

## Done when

Typecheck, tests and build pass; two Cursor agents on a team message each other through the
orchestrator's mailbox; a mixed team runs a turn each on two runtimes; and
`BLOBOT_LIVE_CURSOR=1` covers: the **canary** (a `session/new`-supplied server's tool is
offered — the door contradicts the docs and must fail by name if a release closes it), the
**sandbox does not break the loopback** to `127.0.0.1`, the git-split allow syntax, the
extension reply shapes, and the same live-edit title assertion the other four runtimes make.

## Answer

Built and verified live, 2026-08-31, on `feat/cursor-runtime`. Everything the body ordered is
in `packages/core/src/adapters/cursor/` plus the wiring named under "Outside it"; typecheck,
tests (742 core + 450 desktop) and build pass; a two-axis review ran before the live phase
(`build.md` records what it changed). The done-when list, spent with the author's
authorization:

- **The live suite** (`BLOBOT_LIVE_CURSOR=1`, seven tests, all passing): the persona holds on
  a real turn; a workspace edit runs **without prompting** under `normal` and the shared layer
  titles it `notes.txt` — no fx-style repair owed; **the git split is real**: `git status` ran
  unasked and `git push origin main` raised a permission request; **the canary**: a
  `session/new`-supplied server's tool was offered and called through the enabled sandbox to
  `127.0.0.1`, arriving under the agent's own bearer token with no prompt (`Mcp(blobot:*)`);
  the model lever verified — `session/set_config_option` applied `grok-4.6` and the session
  reports it; a turn inviting `create_plan` ended cleanly instead of hanging.
- **Two real Cursor agents on one team** (`--live-cursor=<dir>`): both ready, both handshaked
  the loopback with their own token, the mailbox carried messages **in both directions**, Bob
  recorded Handbook entries, Alice edited `retry.ts +83 -5`, and a compound
  `git add … && git commit` drew ticket 14's inline permission block — a compound matches no
  prefix rule, so it asks, which is the safe direction working on screen.
- **The mixed team** (`--live-cursor-mixed=<dir>`): a Claude lead and a Cursor teammate
  exchanged messages both ways about a real file, and the Cursor pair from the earlier run
  **resumed through `session/load`** when the pool restored it — sessions live in the per-agent
  config dir, as ticket 01 measured.

One deviation from this body, measured and recorded in `build.md`: `sandbox.networkAccess`'s
canonical value is `allow_all` (the CLI rewrote `enabled` on first start), so blobot writes
the vendor's own word. The extension reply shapes remain verified only to the hanging half —
neither method has been observed firing on the wire — which stays a note on ticket 04's
answer, not a blocker.
