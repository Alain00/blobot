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

The Claude adapter against a real, logged-in `claude` (off by default — it costs tokens):

```sh
BLOBOT_LIVE_CLAUDE=1 pnpm --filter @blobot/core exec vitest run src/adapters/claude/live.test.ts
```

The Electron app, including a way to review it without a human at the screen:

```sh
pnpm --filter @blobot/desktop exec electron-vite build
apps/desktop/node_modules/.bin/electron apps/desktop --no-sandbox \
  --screenshot=/tmp/ui.png [--pane=bob] [--screenshot-at=2200]
```

`--screenshot` implies `--autoplay`, which sends one user prompt and lets the scripted demo
scenarios run. A window opens on the display for a few seconds and quits itself.

`--live-claude=<dir>` swaps the mock runtimes for **one real Claude Code agent** working in
`<dir>` — the same orchestrator, store and UI, with `demoMode: false`. One agent, not two,
because peer messaging needs ticket 15's loopback MCP tool and a second agent would inherit a
persona promising a tool that does not exist.

## What exists

| Area | Where | Ticket |
|---|---|---|
| `AgentEvent`, `AgentRuntime`, `Clock`, message assembler | `packages/core/src/` | 04 |
| `MockAgentRuntime` + eight checked-in scenarios | `packages/core/src/mock/` | 08 |
| Status fold (`AgentStatusTracker`) | `packages/core/src/status.ts` | 09 |
| Orchestrator: mailbox, wake, budget, `message_agent` handler, persona/envelope | `packages/core/src/orchestrator/` | 05, 06 |
| SQLite: schema, migrations, store, recorder | `packages/core/src/store/` | 13 |
| Electron + React UI, demo mode | `apps/desktop/src/` | 12 |
| Claude Code adapter over the ACP bridge | `packages/core/src/adapters/claude/` | 02, 07, 14 |

`@blobot/core` is the full entry point (pulls in `better-sqlite3` + Drizzle).
`@blobot/core/domain` is the pure one — vocabulary, aggregates, status fold, roster lookup — for
consumers that must not pull in SQLite: the renderer today, a CLI later.

**A real `claude` has answered, streamed, run a tool and been cancelled** — see
`adapters/claude/live.test.ts`, and the same turn rendered by the real UI via `--live-claude`.
OpenCode is still untouched.

The adapter is four small files, and the split is the point: `jsonrpc.ts` moves messages,
`wire.ts` declares the handful of fields we read, `translate.ts` is the pure function where
every Claude-shaped quirk dies, and `claude-agent-runtime.ts` owns the process and the session.
`fake-bridge.ts` speaks the protocol without spawning anything, so the contract is testable at
wire level; `live.test.ts` is the only thing that can prove the fake is not lying.

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
- **The adapter speaks JSON-RPC itself rather than importing the ACP SDK.** The bridge is a
  *process* we spawn, not a library we link — so the pinned dependency stays a runtime
  artifact, `no-acp-in-core.test.ts` stays green without an exemption, and the wire shapes we
  actually consume are declared in `wire.ts` where they can be read in one screen.
- **`bridgeEntryPath()` resolves from two anchors, and `apps/desktop` carries the same exact
  pin.** Electron-vite bundles core into `out/main/`, whose `node_modules` chain is the app's
  rather than core's, so a single `import.meta.url` anchor resolves under vitest and fails
  under Electron. `BLOBOT_CLAUDE_BRIDGE` overrides both; packaging will use it.
- **The bridge is spawned with `ELECTRON_RUN_AS_NODE=1`.** `process.execPath` is Electron in
  the desktop app, and Electron only behaves like node when told to. Plain node ignores it.
- **`stop()` closes the session before the pipe.** Dropping stdin works — the bridge exits on
  EOF — but it tears the SDK query down mid-flight and the bridge logs a cleanup failure,
  which is a real error message for a routine shutdown.
- **A permission request with no handler attached is answered `cancelled`, approving nothing.**
  Blocking an unattended agent's turn forever is the worse failure.
- **Ten ACP tool kinds collapse onto blobot's four** in `translate.ts` — `search`/`fetch` read,
  `delete`/`move` edit, everything else `other`, which is why a client-supplied tool is told
  apart by its name prefix rather than by its kind.
- **Adapter order: Claude Code first, then OpenCode.** Reversed from the original suggestion by
  the author, 2026-08-29: Claude Code is the runtime they can test easily, and the bridge is the
  riskier integration, so discovering its problems early is worth more than momentum. The
  argument for OpenCode-first — native ACP, no third-party bridge, and its six update kinds are
  a strict subset of the bridge's eleven — is recorded here because it is what makes the
  *second* adapter cheap.

## Known gaps

- **A real Claude agent cannot message a peer yet.** Ticket 15's loopback MCP server is not
  built; `mcpServers` is the seam it plugs into.
- **`used: 0` on cancel is forwarded, not suppressed.** Ticket 04 makes suppression a
  *consumer* duty and the mock reproduces the trap on purpose, so the adapter is faithful and
  nothing downstream suppresses it yet. The renderer has no context gauge, so it costs nothing
  today — and it will be a visible bug the moment one is drawn.
- **Only `session/new`.** No `session/load`, so nothing resumes across a restart yet. Ticket
  14's trap applies when it lands: re-send `session/set_mode` after every load or resume —
  `#applyPermissionMode()` is the call site.
- **`--live-claude` runs the agent in the directory it was pointed at**, not in a git worktree.
  Ticket 10 is not built.

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

## Next session: peer messaging on a real runtime (ticket 15), then OpenCode

**Read first:** ticket 15 (loopback HTTP MCP) with `research/15-loopback-http-mcp.md`, then
tickets 03 and 16 for OpenCode.

The Claude adapter is the shape the second one has to fit, and it left exactly one seam open
for ticket 15: `ClaudeAgentRuntimeOptions.mcpServers`, forwarded verbatim into `session/new`
(with `type` deliberately omitted — 0.70.0 reads an absent type as stdio, and ticket 01's
"omitting it drops the server" trap was observed against 0.16.2). Until a server is passed
there, a real Claude agent has no `message_agent` tool, which is why `--live-claude` builds a
**one-agent** team: `composePersona` on a one-agent roster says "You have no teammates on this
team yet" rather than promising a tool that is not there.

Then OpenCode (03 + 16). Its six live update kinds are a strict subset of the bridge's eleven,
so `translate.ts` is the file to read first — the mapping it makes is most of the second
adapter's work, already done and tested.

**Do not** subscribe to subagent transcripts (07), store anything resembling a credential (13),
or let the UI learn which provider an agent is (the permanent rules in `CLAUDE.md`).
