Type: task
Status: ready-for-agent

# Plan limits in the details popover

Build what `../spec.md` decided. Read it first; every decision below is argued there.

## Shape of the work

**Core (`packages/core`)**

- A new `AgentEvent`, provider-agnostic: a plan limit reading carrying a list of windows, each
  `{ durationMinutes, utilization, resetsAt }`. Its own event, not a field on `usage_updated`,
  which is documented as *occupancy, not billing* and feeds the compaction threshold.
- `adapters/acp/wire.ts:115` declares only `_meta.claudeCode.toolName`; `session-updates.ts:119`
  never reads `_meta`. The shared ACP half must **not** learn the key `_claude/rateLimit`. Give
  the translation a way to hand `usage_update._meta` to the adapter, and let
  `adapters/claude` map `unifiedWindows.five_hour` to 300 and `seven_day` to 10,080, dropping
  every other key and every other field (`status`, overage). A `usage_update` carrying both a
  context reading and a plan limit reading yields both events; the gauge is unchanged.
- Not recorded by `SqliteRecorder` and not in the snapshot: in memory only. The status fold
  ignores it.
- `MockAgentRuntime`: every scenario sends a reading; one trap sends a five hour window whose
  `resetsAt` is already past.

**Main (`apps/desktop/src/main`)**

- Hold the latest reading per **login**, app-wide and across every loaded team:
  - an Agent on this computer: keyed by runtime, shared by every local Agent of that runtime;
  - an Agent in a sandbox: keyed by that Agent (`<team>/<agent>`), never shared.
- Stream it to the renderer with the team id leading, like every other channel.

**Renderer (`components/Details.tsx`)**

- A `PLAN LIMITS` block under `CONTEXT`, absent when it has no rows.
- Rows follow the agents `Context` is listing: one per distinct login behind them. Shared logins
  first, labelled with the runtime's display name and no face; then sandboxed Agents in roster
  order, with `Blob` and name. Nothing in the component branches on which runtime it is.
- A head line per login, then one line per window: `5h` / `week`, `41%`, `resets 14:00` or
  `resets Fri 09:00`. Past `resetsAt`: `reset 14:00` and no percent. Percent floored, like
  `usage.ts`. Monochrome, CONTEXT's columns, no motion on update.
- DESIGN.md gains an entry beside the CONTEXT block's (adding to it is ordinary work).

## Done when

- A local Claude turn puts `claude` with both windows under `CONTEXT`, and a second local Claude
  agent on the same team adds no row.
- Switching to another team with a local Claude agent shows the same reading before that team
  has run a turn.
- A window past its reset draws `reset HH:MM` with no figure (mock trap, and a unit test on the
  clock).
- An unknown `unifiedWindows` key and the overage fields reach nothing past the adapter (test).
- The context gauge's figures are identical before and after, on the same transcript
  (`cc1.jsonl`).
- A team with only OpenCode, fx or Codex agents draws no `PLAN LIMITS` block.
- After a restart the block is absent until a turn.
- `pnpm` typecheck, tests and build pass; `--screen=details` screenshot in demo mode reviewed.

## Not to do

- No cost, no token breakdown, no plan name, no warning state, no sound.
- No parsing of Codex's `/status` prose.
- No persistence.
- No relative times.

## Comments

**2026-09-11, built.** What was decided at the keyboard:

- **The reading does not stream with a team id.** Every other channel leads with one; this one
  cannot, because a login is not a team's. Main files readings in `PlanLimitReadings`
  (`main/plan-limits.ts`) off every attached team's events and sends the whole map on
  `blobot:planLimits`; the renderer asks `planLimits()` once on load and holds the map beside the
  team model rather than in it, because a team switch replaces that model.
- **One login function, two callers.** `planLimitLogin` in `shared/plan-limits.ts` is what main
  files under and what the renderer groups by. A login on this computer is keyed by the runtime's
  label, the one thing about a runtime both processes hold; a sandbox is keyed by the Agent.
- **The event is `plan_limits_updated`**, its own member, emitted by the Claude runtime beside the
  shared translation (`adapters/claude/plan-limits.ts`). The shared ACP half is untouched.
- **The mock sends readings only when asked** (`planLimits: true`), so every event sequence the
  suite already asserts is unchanged. Demo mode asks. A scenario step `planLimits` stands in for
  the default on its turn, and `outlives-its-limit` is the trap, played by
  `--demo-scenario=limit-reset`.
- **Row rule, as built:** rows follow the whole roster rather than only agents that have a context
  reading, so a team that has not yet run a turn still shows a login another team measured.

Verified: both typechecks, both builds, the core suite (one sandbox registry test fails under
full-suite load and passes alone, untouched by this) and the desktop suite, and a
`--screen=details` screenshot of `limit-reset` drawing `reset 08:02` with no percent.

**Not yet verified:** a real Claude turn reaching the panel (`--live-claude=<dir>`), and a
sandboxed Agent's row, which cannot run on this host.
