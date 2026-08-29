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

`--live-claude=<dir>` swaps the mock runtimes for **two real Claude Code agents** working in
`<dir>` — the same orchestrator, store, recorder and UI, with `demoMode: false`, plus the
loopback MCP server so they can message each other. Verified end to end: Alice asks Bob a
question through `message_agent`, the orchestrator wakes Bob, Bob reads the repo and answers.

Each agent gets its own AgentWorkspace — a git worktree on `blobot/<team>/<agent>` under
`~/.local/share/blobot/worktrees/`, branched from `HEAD`, with the user's repository untouched.
It therefore needs a git repo with at least one commit, and warns on a dirty tree.

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
| Loopback MCP server: `message_agent` | `packages/core/src/mcp/` | 15, 05 |
| AgentWorkspaces: git worktrees, reconcile | `packages/core/src/workspace/` | 10 |

`@blobot/core` is the full entry point (pulls in `better-sqlite3` + Drizzle).
`@blobot/core/domain` is the pure one — vocabulary, aggregates, status fold, roster lookup — for
consumers that must not pull in SQLite: the renderer today, a CLI later.

**Two real `claude` agents have held a conversation through blobot's mailbox.** A real `claude`
has also answered, streamed, run a tool and been cancelled — see
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
- **`SendMessage` and `ListAgents` are disallowed for a Claude agent** — Claude Code's own
  inter-session messaging, which reaches other Claude sessions on the machine. Before the
  exclusion, Alice ignored blobot's tool, called `ListAgents`, found three unrelated sessions of
  the user's and reported Bob unreachable. Amendment on ticket 07; the permanent rule that the
  orchestrator owns agent-to-agent communication is what decides it.
- **blobot pre-approves the MCP servers it injected itself** (`allowedTools: ['mcp__blobot']`).
  Ticket 14 assumed MCP tools ride an ungated path; that is true on OpenCode and in the `auto`
  mode research 02 observed, but **not** in the `default` mode ticket 14 forces — Claude prompts
  for `mcp__blobot__message_agent` and an unattended turn dies on `Tool use aborted`. Amendment
  on ticket 14. The user's own inherited servers still prompt.
- **The `message_agent` idempotency key is derived server-side** from sender, recipient, body
  and context — the model would invent one, and a retried `tools/call` carries a fresh JSON-RPC
  id, so nothing on the wire is stable across the retry that matters. The cost is real: the same
  sender saying the same words to the same teammate twice is one message. Between swallowing a
  deliberate duplicate and waking Bob twice for one message, the first is the failure a human
  can see.
- **`reconcile` has a fourth state, `absent`.** Ticket 10's table covers directory-gone and
  branch-gone, and its `lost` means data loss has already happened. A first run looks identical
  to branch-gone unless the two are separated, and the live team duly reported "your work is
  not recoverable" for an agent that had never existed. A caller that cannot tell "new" from
  "gone" will eventually report one as the other, which is the failure that ticket cares most
  about.
- **The `lost` case is reached by `git update-ref -d`, not `git branch -D`.** git refuses to
  delete a branch that is checked out in a worktree, so the shape the loss actually takes in
  the wild is the ref going while the stale directory stays. Worth knowing before writing a
  test that cannot happen.
- **Team and agent names are slugged into git refs** (`refSlug`). A team name comes from a
  directory basename and an agent name is whatever the user typed; neither is a valid ref.
- **The MCP token is the caller's identity.** `PeerMessageCall.from` has to come from somewhere,
  and the tool arguments are model-authored. One token per agent, minted at `endpointFor`, and
  the URL path must agree with it.
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

- **`used: 0` on cancel is forwarded, not suppressed.** Ticket 04 makes suppression a
  *consumer* duty and the mock reproduces the trap on purpose, so the adapter is faithful and
  nothing downstream suppresses it yet. The renderer has no context gauge, so it costs nothing
  today — and it will be a visible bug the moment one is drawn.
- **Only `session/new`.** No `session/load`, so nothing resumes across a restart yet. Ticket
  14's trap applies when it lands: re-send `session/set_mode` after every load or resume —
  `#applyPermissionMode()` is the call site.
- **Nothing survives a restart.** Both team factories open the database at `:memory:`, so the
  transcript ticket 13 persists is thrown away when the window closes.
- **A team is a TypeScript file.** `demo-team.ts` and `live-team.ts` hardcode the roster; there
  is no team creation, so ticket 11's detection and ticket 14's disclosure have nowhere to
  appear, and the UI's team rail lists exactly one team forever.

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

## Next session: the desktop app as a real product

The author's call, 2026-08-29: teams and agents the user creates, before a second adapter. The
order below is argued rather than assumed — the first item is a hazard, the rest is surface.

1. **Persistence.** `openDatabase({path: ':memory:'})` in both team factories, and the
   dev-time relative path to migrations in `apps/desktop/src/main/index.ts`. Two lines, and
   nothing else on this list means anything without them.
2. **Team creation.** Pick a Workspace, name agents and roles, choose runtimes. `inspect()`
   already returns what the flow needs to refuse (not a repo, no commits), to offer `git init`,
   and to warn on a dirty tree. Ticket 11 (detecting what is installed and authenticated) feeds
   the runtime picker; `initialize` returning `authMethods: []` is the probe.
3. **Ticket 14's disclosure**, which that flow is *specified* to carry: once, before the first
   agent is spawned, stated rather than consented to. Its text is written out in the ticket.
   Plus the posture indicator in the conversation header.
4. **Multiple teams.** The rail already has the shape; it needs a list, a switch, and one
   orchestrator per team. `Orchestrator` is per-team already, so this is wiring, not surgery.
5. **Ticket 14's permission block.** Unreachable in demo mode, reachable on day one of real
   repos: an agent that asks about `rm` or `git push` currently stalls, because
   `setPermissionHandler` is never called by the app. Inline in the transcript, exactly **Allow
   once** and **Reject**.

Two live-mode shortcuts to undo along the way, both marked in `live-team.ts`: the roster is
hardcoded, and `--live-claude` is a flag rather than a product path.

## OpenCode is deferred, by the author, 2026-08-29

Claude works end to end, so the second adapter is postponed in favour of making the desktop app
a real product: teams and agents the user creates, rather than a team that is a TypeScript file.

**The cost, stated rather than discovered later:** `AgentRuntime` has now been proven against
exactly one real provider, and product surface built on top of it is how a provider-agnostic
interface quietly becomes Claude-shaped. The seams most likely to bend are the ones the adapter
had to invent: persona injection through `_meta`, the permission pre-approval, and the MCP
endpoint shape. `MockAgentRuntime` is a second implementation and covers some of it; it is not
full cover.

When OpenCode does come back (tickets 03 + 16, with `research/03-opencode-acp-surface.md` and
`research/16-opencode-persona.md`): Its six live update kinds are a strict subset of the bridge's eleven, so
`adapters/claude/translate.ts` is the file to read first — the mapping it makes is most of the
second adapter's work, already done and tested. `jsonrpc.ts` is provider-neutral and should move
up a directory rather than be copied.

Two things the Claude adapter learned that the OpenCode one inherits: the permission posture is
ticket 16's `OPENCODE_CONFIG_CONTENT` rather than a mode call, and the MCP server it must be
handed is `PeerMessageServer.endpointFor(agentId)` — same endpoint shape, `{type:"http", url,
headers}`, with the tool arriving as `blobot_message_agent` rather than
`mcp__blobot__message_agent`.

**Do not** subscribe to subagent transcripts (07), store anything resembling a credential (13),
or let the UI learn which provider an agent is (the permanent rules in `CLAUDE.md`).
