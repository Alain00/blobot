Label: wayfinder:build-log

# Build log and session handoff

The map (`map.md`) says what was decided. This file says what has been **built**, what was
decided *while* building that no ticket covers, and what the next session should pick up.

Read this, `CLAUDE.md`, `CONTEXT.md`, and only the tickets your task touches.

## How to run it

```sh
pnpm install                       # pnpm workspaces; two packages
pnpm -r typecheck && pnpm -r test  # must pass before a milestone is called done
pnpm -r build
pnpm demo                          # headless: two agents, one peer message, printed
```

The Electron app, including a way to review it without a human at the screen:

```sh
pnpm --filter @blobot/desktop exec electron-vite build
apps/desktop/node_modules/.bin/electron apps/desktop --no-sandbox \
  --screenshot=/tmp/ui.png [--pane=bob] [--screenshot-at=2200]
```

`--screenshot` implies `--autoplay`, which sends one user prompt and lets the scripted demo
scenarios run. A window opens on the display for a few seconds and quits itself.

## What exists

| Area | Where | Ticket |
|---|---|---|
| `AgentEvent`, `AgentRuntime`, `Clock`, message assembler | `packages/core/src/` | 04 |
| `MockAgentRuntime` + eight checked-in scenarios | `packages/core/src/mock/` | 08 |
| Status fold (`AgentStatusTracker`) | `packages/core/src/status.ts` | 09 |
| Orchestrator: mailbox, wake, budget, `message_agent` handler, persona/envelope | `packages/core/src/orchestrator/` | 05, 06 |
| SQLite: schema, migrations, store, recorder | `packages/core/src/store/` | 13 |
| Electron + React UI, demo mode | `apps/desktop/src/` | 12 |

`@blobot/core` is the full entry point (pulls in `better-sqlite3` + Drizzle).
`@blobot/core/domain` is the pure one — vocabulary, aggregates, status fold, roster lookup — for
consumers that must not pull in SQLite: the renderer today, a CLI later.

**Nothing has touched a real CLI yet.** Every runtime so far is `MockAgentRuntime`.

## Decided while building — not in any ticket

These were forced by writing the code. None contradicts a ticket; if one looks wrong, say so.

- **`AgentRuntime.onEvent`** carries events belonging to no turn (process death between turns).
  A per-turn iterator cannot deliver them, and ticket 08 requires the case.
- **`RuntimeLifecycle`** (`created/starting/ready/stopped/dead`) is separate from Status,
  because ticket 09's `starting` comes from process lifecycle rather than from events.
- **A turn in flight with no events yet reads as `thinking`.** The ninety-second-silence
  scenario is exactly that case and `idle` would be a lie for all ninety seconds. This is why
  the tracker is *told* a turn started rather than inferring it.
- **`error` is fatal by definition, so a mid-turn error leaves the agent `failed`** even with
  the process alive. The non-fatal way for a turn to go wrong is a failed tool call. A turn that
  ends in `error` gets no `turn_ended` and no `stop_reason` in the transcript: the RPC never
  replied, and inventing one would be a lie.
- **The turn budget counts the user-triggered turn**, so `turnBudget: 10` buys one turn for the
  agent addressed plus nine peer turns. Ticket 05's "N total agent turns per user prompt" reads
  either way; this is the conservative reading.
- **`TurnRecorder` is a structural interface declared in the orchestrator**, so core's
  orchestrator has no idea SQLite exists and a test can record into an array.
- **`Orchestrator.start()` swallows a per-agent spawn failure**, leaving that agent `failed` and
  the rest of the team working — extending ticket 11's "detection never gates team creation"
  from pre-flight detection to startup.
- **Adapter order: Claude Code first, then OpenCode.** Reversed from the original suggestion by
  the author, 2026-08-29: Claude Code is the runtime they can test easily, and the bridge is the
  riskier integration, so discovering its problems early is worth more than momentum. The
  argument for OpenCode-first — native ACP, no third-party bridge, and its six update kinds are
  a strict subset of the bridge's eleven — is recorded here because it is what makes the
  *second* adapter cheap.

## Known gaps

- **The renderer hides blobot's own `message_agent` tool by matching its name**
  (`apps/desktop/src/renderer/src/model.ts`). This is the leak ticket 04 warned about in a
  smaller hat. The clean fix is for the adapter to tag its own tool so the UI never matches a
  string — worth doing *with* the first real adapter.
- **Ticket 14's permission block is not rendered.** Nothing can request permission yet: the mock
  has no permission path. Needs a mock scenario that asks, plus the inline block with exactly
  **Allow once** and **Reject** (never `allow_always`).
- **Thinking is not displayed anywhere.** It is persisted (`agent_messages.kind = 'thought'`)
  but no pane shows it.
- **Migrations are found by a dev-time relative path** in `apps/desktop/src/main/index.ts`.
  Packaging must copy them next to the bundle; that line is where it changes.
- **`packages/domain` was considered and not done.** The pure subset is a subpath rather than a
  package, because the map settled two packages. If a CLI is ever built, that is the moment to
  reopen it.

## Next session: the Claude Code adapter

**Read first:** tickets 02 (the bridge is real, and pinned), 07 (what the adapter absorbs), 04
(the vocabulary it must emit), 14 (its permission posture is *forced* — the bridge overrides
`permissionMode` and `canUseTool`, so it gets `session/set_mode("default")`), and
`research/02-claude-code-acp.md` with its transcripts. They are observed against this machine —
cite them rather than re-deriving.

**Build:** `packages/core/src/adapters/claude/` implementing `AgentRuntime`, exported from the
full entry point only. It is the first adapter, so it also fixes the interface's shape for the
second one.

The contract it must meet already exists and is executable: `MockAgentRuntime`'s tests are the
behaviours every runtime owes the orchestrator. The adapter should pass the equivalent ones —
ragged deltas concatenating correctly, a cancelled tool reporting `completed` with `exit: null`,
`used: 0` suppressed on cancel, a tool failure continuing the turn, `turn_ended` synthesized from
the `session/prompt` reply's `stopReason`, `error` only for what actually ends a turn.

**Verify against the real binary.** This is the first code that spawns a CLI, so the session is
not done when it typechecks — it is done when a real `claude` answers a prompt in a real
AgentWorkspace and the UI renders the turn. Keep the mock as the default demo mode either way.

**Do not** subscribe to subagent transcripts (07), store anything resembling a credential (13),
or let the UI learn which provider an agent is (the permanent rules in `CLAUDE.md`).
