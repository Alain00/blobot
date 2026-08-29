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
  [--demo] --screenshot=/tmp/ui.png [--pane=bob] [--screenshot-at=2200] [--no-autoplay]
```

**With no flags the app is the product**: it opens Electron's `userData` — `~/.config/@blobot/desktop/blobot.db`
on Linux, because the app's package name is `@blobot/desktop`, starts the most recent team, and shows the creation flow when there is none.
`--demo` is the scripted team on mock runtimes, which is *not* the first-run default — ticket
08's point is that nobody should meet fake agents without being told.

`--screenshot` implies `--autoplay`, which sends one user prompt. `--no-autoplay` opts back
out, which is what a screenshot of a *restored* transcript needs — otherwise the picture is of
a new turn rather than of what the last session left behind.

`--live-claude=<dir>` runs **two real Claude Code agents** in `<dir>`. It now goes *through*
the product path rather than beside it: it creates a real team (or reuses the one named after
the directory) and starts it exactly as the creation flow does. Verified end to end, twice —
Alice asks Bob a question through `message_agent`, the orchestrator wakes Bob, Bob reads the
repo and answers; then the app is relaunched with no flags and the whole exchange is still
there.

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
| Runtime detection: four honest states | `packages/core/src/detect/` | 11 |
| Team creation + persistence, the running team | `apps/desktop/src/main/` | 11, 13 |

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

## The desktop app as a product: what landed

The first two items of the previous handoff, and they went in together because the first is
meaningless alone.

- **Persistence.** One database file under `userData`, opened once in the main process.
  `SqliteStore` gained `listTeams` / `teamById` / `teamByName`, and `answersOfTeam` for
  rebuilding a pane. The renderer's `snapshot` action now **replaces** the pane's items from
  the snapshot rather than only patching it as events arrive — a persisted transcript is
  invisible unless something seeds it, and a team switch has to drop the previous team's.
  Messages and answers are merged by time: peer traffic without the replies reads as a
  conversation with half the speakers missing. Thinking is not restored (no pane shows it
  live), and neither are tool lines (they are what an agent is doing *now*).
- **Team creation.** `apps/desktop/src/main/team-store.ts` — `createTeam` refuses a
  non-repository (the flow offers `git init`, never silently) and a repository with no commits,
  warns on a dirty tree, refuses a duplicate team name and two agent names that slug to one
  branch, then provisions a worktree per agent and writes the rows. `start-team.ts` brings a
  persisted team back: reconcile, spawn, MCP endpoint per agent, orchestrator.
- **Ticket 11's detection** (`packages/core/src/detect/runtimes.ts`): the three-layer cascade
  (`PATH`, known install dirs, then `$SHELL -ilc` for aliases), `claude auth status`'s 0/1
  contract, `opencode auth list` parsed through the escapes `NO_COLOR` does not remove. Four
  states, never the word *authenticated*, and it **gates nothing** — the picker offers a
  runtime that reports "needs sign-in" and the store takes whatever was chosen.
- **`RuntimeDetection.supported`** is a separate field from readiness, because it is a fact
  about *us*, not about the user's machine: OpenCode is detected honestly and offered as "no
  adapter yet" rather than hidden, which would misreport what they have installed.
- **Switching teams stops the previous team's runtimes.** Nothing called `runtime.stop()`
  before, because nothing had a second team to switch to; leaving them would leak a bridge
  process per switch.
- **`live-team.ts` is gone.** Its roster shortcut survives inside `--live-claude`; its
  duplication of the orchestrator wiring does not.

## Known gaps

- **`used: 0` on cancel is forwarded, not suppressed.** Ticket 04 makes suppression a
  *consumer* duty and the mock reproduces the trap on purpose, so the adapter is faithful and
  nothing downstream suppresses it yet. The renderer has no context gauge, so it costs nothing
  today — and it will be a visible bug the moment one is drawn.
- **Only `session/new`.** No `session/load`, so nothing resumes across a restart yet. Ticket
  14's trap applies when it lands: re-send `session/set_mode` after every load or resume —
  `#applyPermissionMode()` is the call site.
- **A restart restores the transcript, not the agents' memory of it.** Every launch is a fresh
  `session/new` against the same rows, so the pane shows a conversation the agent cannot
  remember having. `session/load` is the fix and is still not implemented.
- **One orchestrator at a time.** Switching teams stops one and starts the other, which costs a
  fresh session for every agent. Holding several is wiring rather than surgery — `Orchestrator`
  is per-team already — and is the previous handoff's item 4.
- **A profile cannot be edited.** Hired and retired, nothing in between: no rename, no change
  of role or runtime — and therefore no answer yet to what an edit means for the teams an agent
  is already on. Named in ADR-0001 as not decided.
- **Agents are only visible inside team creation.** There is no screen for *your agents* on its
  own, which is the surface the model most obviously wants next.
- **A team cannot be edited or deleted.** No add-an-agent-later, no rename, no removal — and
  `WorkspaceProvider.remove` (with ticket 10's `-d` versus `-D` rule) therefore has no caller.
- **A team switch is a hard cut with no confirmation**, even mid-turn: the running agents are
  stopped where they stand.

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

## Next session

The author is driving the app by hand for the first time and will send UI fixes; take those
first — the creation flow has never been used with a mouse, only reviewed in screenshots. Two
things they were asked to judge: whether the creation screen reads in the right order now that
agents come before the team, and whether a team switch discarding the previous team's live
agents without asking is acceptable or alarming.

Items 1 and 2 of the previous handoff are done. What is left of it, in the same order:

1. **Ticket 14's disclosure**, which the creation flow is *specified* to carry: once, before
   the first agent is spawned, stated rather than consented to. Its text is written out in the
   ticket. `NewTeam.tsx` is the screen and says so in a comment. Plus the posture indicator in
   the conversation header.
2. **Ticket 14's permission block.** Unreachable in demo mode, reachable on day one of real
   repos: an agent that asks about `rm` or `git push` currently stalls, because
   `setPermissionHandler` is never called by the app. Inline in the transcript, exactly **Allow
   once** and **Reject**.
3. **One orchestrator per team**, so switching stops being a restart.
4. **Editing a team**: add or remove an agent, and the `remove` path that finally exercises
   ticket 10's `-d`-versus-`-D` rule.

### Settled, 2026-08-29: agents exist independently of teams

Raised by the author on reading the creation flow, and now `docs/adr/0001-agents-exist-
independently-of-teams.md` — the repo's first ADR. **AgentProfile** is a new aggregate: an
agent with a name, a role, a runtime and optional standing instructions, belonging to no team.
A Team is formed *out of* profiles, which instantiates one Agent row per membership, and the
same agent can be on several teams at once.

Why not one Agent row on many teams: a Team is what gives an Agent a workspace, a session, a
mailbox and a status, and none of those four can be shared — an agent on two teams is two of
each under any model. Only the *definition* is reusable, so that is what the profile holds.

Name, role and instructions are copied onto the Agent rather than read through the profile: a
rename must not rewrite what a transcript says an agent was called, and ticket 06's stored
persona has to keep matching what the agent was actually told.

Standing instructions are folded into the persona under a line saying they apply on every team
— which is what keeps them distinguishable from the team's own framing. Migration
`0001_outgoing_vampiro.sql` is additive: `agent_profiles`, plus `profile_id` and `instructions`
on `agents`, both nullable, so the demo team and any existing database still work.

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
