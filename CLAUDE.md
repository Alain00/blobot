# blobot

A local-first desktop application that lets a user assemble **teams** out of the coding
agents they already have installed — Claude Code, Codex, Gemini CLI, OpenCode — and watch
them work together on a repository.

This repository is a monorepo.

## Permanent architectural rules

These are not negotiable per-milestone. If a change appears to require breaking one, stop
and raise it rather than working around it.

- **Local-first.** No cloud dependencies. No hosted service is required for the app to run.
- **No hosted inference.** The app never provides LLM inference and never proxies provider
  API credentials. Agents use the user's existing local authentication.
- **No credential storage.** We do not build a credentials database and we do not persist
  API keys. The underlying CLI owns its own login.
- **ACP preferred.** The Agent Client Protocol is the primary integration path. CLI
  adapters are a fallback, not a default.
- **Providers live behind `AgentRuntime`.** Every provider-specific quirk is owned by its
  adapter. Nothing outside the adapter may know which provider an agent is.
- **The UI is provider-agnostic.** No provider-specific logic in React components, ever.
- **Docker is invisible infrastructure.** The user never sees or types a Docker command.
- **Git-aware.** Agents are isolated by AgentWorkspace, not by convention — a git worktree
  wherever git can hold the Workspace, a plain copy where it cannot. Never a shared directory.
- **The orchestrator owns agent-to-agent communication.** It is our concern, not ACP's, and
  never a full context copy between agents — always compact context.
- **The blobatars are the only saturated thing on screen.** Status is monochrome, carried by
  motion, a mono word and a hairline. The rest of the interface's rules, and the reason behind
  each, live in `DESIGN.md` at the repo root. **Read it before changing anything a user sees.**

## Engineering constraints

- TypeScript strict mode.
- Runtime implementations sit behind interfaces.
- Agent status updates are event-driven.
- No premature abstraction beyond clear runtime boundaries.
- Typecheck, tests and build must pass before any milestone is called done.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Interface

`DESIGN.md` at the repo root is the standard: tokens, the three transcript voices, controls,
icons, motion, product copy, and what the stylesheet's one flat namespace demands of you. It is
binding the way the architectural rules are — contradicting a rule is a ticket 12 reopen and a
note in `build.md`, adding to it is ordinary work.

## Current work

The first demo is **planned, and being built**. The plan is a **wayfinder map** at
`.scratch/first-demo/map.md` — read it before doing anything, along with `CONTEXT.md` for the
domain glossary.

**The map is complete.** Sixteen tickets, all resolved, frontier empty: nothing is left to
*decide* before this code gets written. Do not run `/wayfinder` on it — there is no next ticket.

Read the map's *Decisions so far* index to judge relevance, then zoom into only the tickets your
task actually touches. No session should hold all sixteen; that is the point of the map. Reasons
live on each ticket in `.scratch/first-demo/issues/`, and several decisions are backed by
research observed against the real CLIs on this machine (`.scratch/first-demo/research/`, with
raw transcripts).

Decisions are binding. **If you believe one is wrong, say so and reopen its ticket. Do not
quietly contradict it.** Ticket 12 carries an amendment from ticket 14; check for an `##
Amendment` section before treating an answer as final.

**Build order starts with `MockAgentRuntime`**, so that everything above it has something real to
run against before a single CLI is spawned. The UI (ticket 12) is built against the mock, not
against OpenCode.

Built so far, all in `packages/core` (pnpm workspaces + vitest; `pnpm demo` plays a two-agent
team headlessly):

- The `AgentEvent` vocabulary (04), the `AgentRuntime` interface, the injected `Clock`, and
  core's message assembler — deltas pass through, `agent_message_completed` is synthesized.
- `MockAgentRuntime` (08) with eight checked-in scenarios, reproducing the observed traps.
- The status fold (09): `AgentStatusTracker`, derived, never persisted.
- The orchestrator (05 + 06): mailbox, auto-wake, mid-turn queueing delivered as one numbered
  prompt, per-team turn budget, persona and envelope composition, `message_agent` tool handler.
- The SQLite store (13): Drizzle schema, checked-in migrations, `SqliteStore` behind
  `MessageStore`, and `SqliteRecorder` persisting the durable subset of the event stream.
- `@blobot/core/domain`: the pure entry point (event vocabulary, aggregates, status fold,
  roster lookup) with no Node dependencies, for consumers that must not pull in SQLite — the
  renderer today, a CLI later.
- The UI (12) in `apps/desktop`: Electron + React, variant A's rail / conversation / feed, the
  three voices, monochrome status, `@mention` addressing. Runs demo mode on mock runtimes.
  `pnpm --filter @blobot/desktop exec electron-vite build` then run electron with
  `--screenshot=<path>` (optionally `--pane=<agentId>`, `--screenshot-at=<ms>`) to review it
  without a human at the screen. `--demo-scenario=<name>` picks which run the demo team plays
  (`?` lists them; `pnpm demo -- --scenario=<name>` reads the same table headlessly), and
  `--autoplay-at=<ms>` delays the scripted prompt — on a cold machine the renderer paints after
  the turn has already ended and the screenshot catches only what was persisted.

**Build status and session handoff live in `.scratch/first-demo/build.md`** — what is built, what
was decided while building that no ticket covers, the known gaps, and what the next session picks
up. Read it before starting work.

- The **Claude Code adapter** (02 + 07 + 14) in `packages/core/src/adapters/claude`: the pinned
  `@agentclientprotocol/claude-agent-acp` bridge spawned over stdio, JSON-RPC spoken directly so
  core still imports no ACP type, `session/set_mode("default")` forced on every session. A real
  `claude` answers, streams, runs tools and cancels — `BLOBOT_LIVE_CLAUDE=1` runs those tests,
  and `--live-claude=<dir>` puts a real agent behind the real UI.

- **Ticket 15's loopback MCP server** in `packages/core/src/mcp`: one tool, `message_agent`,
  over `127.0.0.1` with a per-agent bearer token that *is* the caller's identity, stateless
  because neither runtime re-handshakes, and readiness measured by the inbound handshake rather
  than by `session/new`. `--live-claude=<dir>` now runs **two real Claude agents who message
  each other** through the orchestrator's mailbox.

- **Ticket 10's AgentWorkspaces** in `packages/core/src/workspace`: git worktrees on
  `blobot/<team>/<agent>` under `~/.local/share/blobot/worktrees/`, branched from `HEAD`,
  outside the user's repository, with the launch reconcile (repair a missing directory, report
  a missing branch) and the `-d`-versus-`-D` rule on deleting an agent. **Amended 2026-08-29:
  a Workspace need not be a repository.** Three kinds — `git`, `nested` (a folder of
  repositories, of which the user picks the ones in scope), `plain` (a copy per agent) — one
  provider each behind `workspaceProviderFor`. A copy has no branch, no diff and no recovery,
  and the flow says so where the folder is chosen.

- **Persistence and team creation** (11 + 13): one SQLite file under Electron's `userData`, a
  creation flow that picks a Workspace and forms a team out of agents, and ticket 11's detection
  behind the runtime picker — four honest states, never the word *authenticated*, gating
  nothing. With no flags the app is the product; `--demo` is the scripted team.

- **A team can be deleted and its roster changed** — both on the team's own rail row. Deleting
  removes every AgentWorkspace *before* tombstoning the rows (the branch is
  `blobot/<team>/<agent>`, so the name has to still be true), reports what was kept, releases
  the name, and keeps the transcript. A workspace it cannot reach is not a refusal: the
  ordinary reason to delete a team is that the folder is gone. Editing takes the whole roster,
  instantiates joiners exactly as creation does, and restarts the team, because a persona names
  the roster.

- **blobot vouches for the ordinary work, on both runtimes.** Claude's `default` mode prompts on
  every edit at any path, so an agent asked for permission to write a file inside its own
  worktree. `adapters/claude/permissions.ts` is the counterpart to OpenCode's
  `PERMISSION_POSTURE`: the editing tools plus a closed list of `Bash(<prefix>:*)` rules, handed
  over `_meta.claudeCode.options.allowedTools`, which the bridge passes through where it discards
  `permissionMode`. Not a settings file, because an AgentWorkspace is a checkout of the user's
  repository and a file left there can be committed home. The mode stays `default`; `auto`,
  `acceptEdits`, `dontAsk` and `bypassPermissions` stay unoffered. Verified live in both
  directions: a write in its own workspace does not ask, a `chmod` still does. Ticket 14's
  2026-08-30 amendment, which narrows its own *"Claude Code is not ours to configure"*.

- **How much it vouches for is the user's choice, per agent**: `careful`, `normal`, `trusting`,
  in the hire and edit dialogs under *how it answers*. Three words of blobot's own vocabulary
  (`core/trust.ts`) that each adapter translates from the opposite end, so the renderer names the
  decision and still cannot tell which runtime is behind it. `trusting` is the ceiling and says
  so: `rm`, `sudo`, `chmod`, `chown`, `ssh`, `scp`, `docker`, `git push` and `git remote` ask at
  every level, because the step above is `bypassPermissions` and ticket 14 refuses it. Per agent
  and never per team, since an AgentWorkspace is per agent. Taken at the team's next start, which
  is not a policy: `allowedTools` is a `session/new` parameter and OpenCode's posture is the
  child's environment. Ticket 14's second 2026-08-30 amendment, and ADR-0002's.

- **Ticket 14's posture is on screen** (14): a permission request is a channel on the
  orchestrator, so `waiting` is the status fold's own answer; the block is inline in the
  transcript with exactly **Allow once** and **Reject**, and `allow_always` has no path to the
  UI. With nobody listening a request is **cancelled, never allowed**. The disclosure closes the
  creation flow, stated rather than consented to — and it says blobot sets the runtime to
  prompt rather than naming commands, which is ticket 14's 2026-08-29 amendment.

- **Agents exist independently of teams** — `docs/adr/0001-agents-exist-independently-of-teams.md`,
  the repo's first ADR, and the reason `CONTEXT.md` now has an **AgentProfile**. An agent is
  hired once, on no team, and can be on several at the same time; joining a team instantiates an
  Agent from it, because a workspace, a session, a mailbox and a status are things a Team gives
  an Agent and none of them can be shared.

- **What an agent inherits, and what blobot offers** — `docs/adr/0003-what-an-agent-inherits.md`.
  Two decisions that look like one and are not: **the settings scope decides what an agent can
  do; the palette decides what blobot offers.** An agent loads all three scopes, so the
  repository's CLAUDE.md and the operator's own skills both work. The composer's `/` menu is an
  **allowlist** (`adapters/claude/palette.ts`) built from what a person authored — the
  workspace's `.claude/`, the operator's `~/.claude/skills`, and five vouched built-ins — never
  from a plugin's surface or a vendor's release cadence, which is what makes it fail closed.
  Measured live: 223 advertised commands and 97 KB, of which **40 are offered**, with zero
  plugin entries. Read the ADR's amendment before changing any of this: the first version
  dropped `user` scope and was wrong, because the 140-command flood it was aimed at belonged to
  a plugin and not to the author's 37 skills. The three hazards a menu filter cannot fix are
  their own effort at `.scratch/runtime-posture/`.

- **Switching a team no longer restarts it.** `TeamPool` (`apps/desktop/src/main/team-pool.ts`)
  keeps the last three live, LRU by selection, never evicting the active team or one that is
  mid-turn. The Claude adapter resumes with `session/load`, re-supplying `mcpServers` and muting
  the transcript replay, so a team that *was* evicted comes back knowing the conversation; a
  session the provider has forgotten falls back to a new one rather than failing the launch.
  Every stream channel leads with a team id, because several teams stream at once now, and a
  Workspace that has been moved or deleted says so instead of being called "not a git repository".

- **A screen for *your agents***, and what editing one means —
  `docs/adr/0002-editing-an-agents-definition.md`, the repo's second ADR, which answers the
  question ADR-0001 left open. An edit restates the whole definition; a team the agent is
  already on takes the role, the standing instructions and the face at its next start, and keeps
  its name and its runtime, because the branch is `blobot/<team>/<agent>` and a session belongs
  to the runtime that opened it. The screen is over the working surface, reached from above TEAMS
  in the rail, and nothing on it restarts a team.

- **Every rail row is its team, and says what that team is doing.** A row draws its members'
  faces and folds their status through the same `StatusWord` the open team uses, silent while
  they are idle, inverted for `waiting` — which is the only way a backgrounded team blocked on
  a permission request can reach the user. It said `STOPPED` on every row but the active one
  until this, a literal string left over from when switching really did stop a team, so the
  rail was asserting that about teams the pool was still running. Whether the pool is holding
  a team is *not* surfaced: nobody chose it and an evicted team resumes when it comes back.

- **The OpenCode adapter** (03 + 16) in `packages/core/src/adapters/opencode`: `opencode acp`
  over stdio, the persona as an OpenCode **agent** delivered through `OPENCODE_CONFIG_CONTENT`
  so blobot writes nothing into the user's repository, ticket 14's permission posture in the
  same config, and `session/set_mode` re-asserted after a resume because OpenCode restores the
  last used mode rather than the configured default. The shared half of the two adapters now
  lives in `packages/core/src/adapters/acp` — JSON-RPC, the child-process transport, the wire
  shapes, and the `session/update` translation, which turned out to be the protocol's shape
  rather than a provider's. `runtimeFor` in `apps/desktop/src/main/runtime-for.ts` is the one
  place a `runtime_id` becomes a class. Verified against a real `opencode` 1.18.4 at zero
  token cost: the persona is live on turn 1, and `opencode debug agent` resolves exactly the
  rules ticket 14 wrote. `BLOBOT_LIVE_OPENCODE=1` runs the turns that cost tokens, and has not
  been run yet.

- **The model and the effort are the user's to choose**, per agent, in the hire and edit
  dialogs. Each adapter hands the UI the option groups its runtime advertises on `session/new`
  (`model`, `effort` and `fast` on Claude; `model` alone on OpenCode) minus the ones blobot
  decides itself, and applies the choices with `session/set_config_option` — the only lever that
  works, since `_meta.claudeCode.options.model` turned out to be accepted and ignored. The
  choices live in one JSON column on the profile, are copied onto the Agent at team creation,
  and taking the runtime's own default stores nothing. `docs/adr/0002` carries the amendment.

- **How full an agent's context is, on screen.** A `CONTEXT` block at the head of the activity
  column: face, name, `used/size`, percent, per agent, from the `usage_updated` the runtimes
  already sent and the renderer already threw away. Observation only, and the rule is unchanged:
  blobot does not compact, the CLI behind the adapter owns that, and `/compact` in the palette is
  the whole of the remedy. A turn that stops early now says why in the transcript rather than
  naming a protocol enum (`turn stopped · the context window is full`), and the activity column
  and that line both survive a team switch, because the snapshot carries the persisted log. And
  **what blobot itself injects is bounded**: `orchestrator/bounds.ts` refuses a peer message over
  4,000 characters at the tool boundary rather than truncating it, caps the wake batch at five
  and requeues the rest, and shows the breakdown under the gauge in estimated tokens. That rule
  was in this file and enforced nowhere.

- **A team has an icon, and a team can be given a folder.** The icon is a `data:` URL in one
  column on `teams`, drawn as a **sticker on the folder** in the rail and never in place of the
  mark: the faces say who is on the team, the icon says which project, and the folder is the
  body that animates the folded status. It is detected from the Workspace
  (`workspace/icon.ts`: one walk four levels deep, raster only, ranked by directory then depth then a folder named after the repository) and **offered rather than applied** —
  the flow names the file it found. And the creation flow has a second door out of its folder
  step: *make one for me* puts a git repository with one empty commit under `~/blobot`, named
  after the team, so nobody has to go and find a repository before they can watch two agents
  talk. The name is step 01 now, because the folder is named after it.

- **Deleting a team can be a full clean, priced first.** The dialog carries one tick that
  deletes every AgentWorkspace whatever it holds, unmerged branches and copies included, with
  what it recovers on it (`recovers about 3.1 GB · alice 2.9 GB · bob 180 MB`) and the result
  reported after. It is a second provider method (`purge`, beside `remove`, plus `measure`), not
  a flag, so no caller reaches the unrecoverable version by passing the wrong boolean. Without
  it the leftovers were unbounded and nothing in the app ever mentioned one again.

- **A runtime that is not ready is handled, not just reported.** Ticket 11's four states now
  each carry the way out of them: the picker offers **the runtime's own `auth login`**, or **the
  vendor's own published install command**, on a real pseudo-terminal inside the app
  (`main/runtime-step.ts`, `components/RuntimeSetup.tsx`, the table in `detect/remedies.ts`). The
  CLI signs the user in itself and opens its own browser; keystrokes pass through and blobot
  reads none of them, which is how the no-credential-storage rule is kept while still helping.
  argv is core's and never the renderer's: two ids travel, and the command is looked up on the
  far side. Nothing concludes from an exit code, because an installer can exit 0 having installed
  nothing, so the screen ends on detection asked again in the same four words. Detection still
  gates nothing, with one addition: a launch whose agent's runtime is `not_installed` is refused
  by name rather than surfacing as `spawn opencode ENOENT`. xterm is handed a monochrome palette,
  because a terminal is quoted and not exempt from the governing rule. `.scratch/runtime-readiness/`
  has the decisions; `claude auth login` is the one path not run live.

Next: surfacing whether an agent resumed or started fresh, and running
`adapters/opencode/live.test.ts` against the real thing.
`build.md`'s *Next session* has the order and the reasons.

The mock is not a stepping stone to be discarded: ticket 08 makes it a **shipped demo mode** that
reproduces every observed trap on purpose — ragged deltas, a cancelled tool reporting
`completed`, `used: 0` on cancel — because a kind mock produces a UI that shatters on first
contact with a real runtime.

`.scratch/` is tracked in git on purpose — the map is the canonical artifact, not scratch work.
