# blobot

A local-first desktop application that lets a user assemble **teams** out of the coding
agents they already have installed — Claude Code, Codex, Cursor, Gemini CLI, OpenCode — and watch
them work together on a repository.

This repository is a monorepo.

## Permanent architectural rules

These are not negotiable per-milestone. If a change appears to require breaking one, stop
and raise it rather than working around it.

- **Local-first.** No cloud dependencies. No hosted service is required for the app to run.
- **No hosted inference.** The app never provides LLM inference and never proxies provider
  API credentials. Agents use the user's existing local authentication. One conscious
  exception, dictation's remote Transcriber, on ADR-0005; it does not extend.
- **No credential storage.** We do not build a credentials database and we do not persist
  API keys. The underlying CLI owns its own login. One conscious exception, the key for that
  same Transcriber, on ADR-0005; it does not extend.
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
  and `--live-claude=<dir>` puts a real agent behind the real UI (one of five roster shortcuts
  now, beside `--live-codex`, `--live-fx`, `--live-mixed` and `--live-fx-mixed`).

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
  child's environment. Ticket 14's second 2026-08-30 amendment, and ADR-0002's. **What a level
  sorts on is the verb, corrected 2026-08-31**: `gh` was one atom under *reaches the network*,
  which put `gh pr view` a level above `git fetch` — the same read, against the same host,
  vouched at `normal` since the list was written — and let `trusting` reach `gh pr create`, which
  contradicts *a pull request is the user's action*. It splits the way `git` always did: the
  reading verbs vouched from `normal`, every writing verb at no level, `gh api` with them because
  `-X POST` is invisible to a prefix rule. Whether `trusting` should be the ceiling at all is
  **reopened and open** on ticket 14, deliberately unanswered by that fix.

- **Ticket 14's posture is on screen** (14): a permission request is a channel on the
  orchestrator, so `waiting` is the status fold's own answer; the block is inline in the
  transcript with **Allow once**, **Allow always** and **Reject**. With nobody listening a request
  is **cancelled, never allowed**. The disclosure closes the creation flow, stated rather than
  consented to — and it says blobot sets the runtime to prompt rather than naming commands, which
  is ticket 14's 2026-08-29 amendment. **The third button was withheld and is now offered**, on
  that ticket's second amendment the same day: the reason for withholding it was that
  `allow_always` is a rule the user authors with nowhere to see or revoke, and that was an
  assumption about where the rule goes rather than a measurement. Measured against a real
  `claude`, it writes `permissions.allow` into `<workspace>/.claude/settings.local.json` — a file
  in this one agent's own copy of the folder, which the user can read and delete and which says
  nothing about any other agent, because an AgentWorkspace is per agent. So the block names where
  an *always* goes in the same sentence that offers it, and `PermissionOutcome` gains
  `allowed_always`, because *you allowed this once* and *you allowed this, and it stops asking*
  are not the same record of what happened. `reject_always` stays unoffered: refusing forever is
  the same standing rule pointed the other way, and nobody has asked for it.

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
  already on takes the role, the standing instructions and how it answers at its next start,
  **the face at once**, and keeps its name and its runtime, because the branch is
  `blobot/<team>/<agent>` and a session belongs to the runtime that opened it. The screen is over
  the working surface, reached from above TEAMS in the rail, and nothing on it restarts a team.
  Both halves of a face are the user's to choose now — the hue and, since 2026-09-04, one of the
  nine silhouettes, stored by name on the profile and restated onto every membership. The face
  is the one part of an edit with nothing to restart, which is why it does not wait: it is drawn,
  not composed into a persona, so a team holding the old one is one agent wearing two faces.

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
  rules ticket 14 wrote. `BLOBOT_LIVE_OPENCODE=1` runs the turns that cost tokens, and **all of
  them pass** against a real `opencode` 1.18.4 (2026-08-30), including the edit-count test that
  no OpenCode-specific code was written for.

- **The model and the effort are the user's to choose**, per agent, in the hire and edit
  dialogs. Each adapter hands the UI the option groups its runtime advertises on `session/new`
  (`model`, `effort` and `fast` on Claude; `model` alone on OpenCode) minus the ones blobot
  decides itself, and applies the choices with `session/set_config_option` — the only lever that
  works, since `_meta.claudeCode.options.model` turned out to be accepted and ignored. The
  choices live in one JSON column on the profile, are copied onto the Agent at team creation,
  and taking the runtime's own default stores nothing. `docs/adr/0002` carries the amendment.

- **How full an agent's context is, on screen.** A `CONTEXT` block at the head of the activity
  column: face, name, `used/size`, percent, per agent, from the `usage_updated` the runtimes
  already sent and the renderer already threw away. Observation only: the gauge advises nothing,
  and the CLI behind the adapter still owns compaction. **Corrected 2026-08-30 by ticket 10:
  `/compact` in the palette is no longer the whole of the remedy** — blobot chooses the moment
  now, though it still writes no summary of its own. A turn that stops early now says why in the transcript rather than
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

- **A team's lead has duties now.** It was pure addressing: the implicit recipient of the team
  pane, never told it leads, with nothing routed through it. So the word claimed a rank the app
  did not implement. `composeLeadBrief` is the counterpart, composed fresh on every turn the lead
  holds because it *is* the live status fold: who its teammates are, what each is doing, that the
  list is the whole of what blobot knows, and that what it sends arrives as a colleague's request
  rather than the operator's. It replaces the wake prompt's roster line rather than doubling it,
  and never enters the `messages` row. The lead is **never a pipe** — `@bob` still lands on Bob
  and fan-out still fans out — which is what keeps the coordinator's serialisation and single
  point of failure from being real. Relayed authority stays capped at peer, permanently, and
  reply routing stays refused. The silent-handoff detector drops its *"the prompt named that
  teammate"* clause for exactly one case, a lead on a prompt that named nobody, and issue 02's
  routing-turn budget exemption is finally built, keyed on what a turn did rather than on who
  held it. One extra turn per prompt, not three. `.scratch/team-addressing/issues/06`, which
  reopened issues 02 and 04 on the grounds that both were decided against the inbound arrow only.

- **The composer takes an attachment**, and it is **embedded, never linked** —
  `docs/adr/0004-attachments-are-embedded-not-linked.md`. An image or a text file, from the
  paperclip, a paste or a drop, travelling as an ACP `image`/`resource` block. A `resource_link`
  to the user's path, or to blobot's own store, was the cheap answer and is refused: `Read`,
  `Glob` and `Grep` never prompt, so a path handed to an agent is an ungated read outside its
  AgentWorkspace, and blobot's own attachment directory would be one `Glob` from every
  attachment of every team. The price is paid honestly rather than optimised away — two ceilings
  in `bounds.ts`, refused **at pickup** and never truncated; no resizing, because a downscaled
  screenshot of a stack trace is a wrong line number with no visible cause; the fan-out's cost
  stated in the composer and never narrowed on the user's behalf. One blob and N message rows;
  the bytes are in SQLite and never on disk, because nothing links to them. The renderer never
  reads a file: a path goes to main, which decides the size and the kind before anything
  crosses. `AgentRuntime.accepts` is blobot's own word for what a runtime takes, so the composer
  refuses before the user writes — and `MockAgentRuntime` is the only runtime that says no,
  which is why the refusal path is exercised at all. **A thumbnail is drawn in colour**, the one
  yield in DESIGN.md's governing rule and written into it: saturation is blobot's to spend on
  blobatars, and content the user supplied is not blobot's to desaturate. Under the gauge,
  `attachments · 2 · 480 KB · sent this session` — bytes and a count, never tokens, and worded
  apart because it is the only figure there that is not per-turn.

- **The Codex adapter** (`.scratch/codex-runtime/`, tickets 01 to 05) in
  `packages/core/src/adapters/codex`: the pinned `@agentclientprotocol/codex-acp` bridge, the
  persona as `CODEX_CONFIG.developer_instructions` (which Codex **stores on the session**, so it
  survives a resume and a compaction, and an edited one does *not* take on a resumed session --
  issue 06), and ticket 14's posture as `INITIAL_AGENT_MODE=read-only`, asserted against the mode
  the session reports and fatal if it cannot be confirmed. That variable is not optional: the
  bridge's default mode wrote a file into the user's home directory without asking once. All
  three trust words answer the same mode, because the neighbouring two are under blobot's floor
  and over its ceiling, and `CODEX_EXPRESSES_TRUST` says so rather than letting three words imply
  otherwise. Codex ships its own subagent vocabulary that competes with the mailbox, so the
  adapter tells it in words that it has none. blobot answers permission requests for **its own
  loopback tool** -- decided on `rawInput.{server,tool}`, never on prose -- because Codex asks
  about every MCP call and a peer message would otherwise wait on a human. `--live-codex=<dir>`
  runs two real Codex agents who message each other, and `--live-mixed=<dir>` puts a Claude agent
  and a Codex agent on one team, which is the point of the whole architecture.

- **Where an agent's work is, and whether GitHub has it.** A `WORKSPACE` line: the branch, what
  the worktree is holding, how far ahead it is, and the pull request whose head that branch is.
  Per agent and never per team, so it is drawn twice and the placement is what makes each
  sentence true: under the composer in an agent's pane, and as a block beside `CONTEXT` in the
  activity column in the team pane, where a single branch name would be false about the other
  members. `workspace/status.ts` reads it and `workspace/publish.ts` is the one place blobot
  writes to a forge, pushing the branch and running `gh pr create` with the two commands shown
  in full before they run. **`gh` is the user's own login, spawned**, the way
  `detect/remedies.ts` spawns `claude auth login`: no token is stored, no credential is proxied,
  no API is called by blobot. **A pull request is the user's action and never an agent's** —
  `git push` and `git remote` prompt at every trust level, nothing here is a tool, and no runtime
  is told any of it. *No pull request* and *we could not look* are separate states in the type
  and never draw the same. Local git follows the work and is re-read as turns finish; GitHub is
  asked on opening a team and on the user's refresh and on no timer. Verified against real
  repositories, `BLOBOT_LIVE_GH=<repo>`.

- **blobot chooses the moment, and still does not compact.** `.scratch/transcript-scale/10`.
  The rule this file carried — *blobot does not compact* — was too wide in one direction and too
  narrow in the other, and both halves are now true separately. blobot provides no inference,
  writes no summary of its own, and never rewrites an agent's history; it could not in any case,
  because `session/prompt` carries a session id and this turn's blocks, so the transcript we
  would rewrite lives inside the CLI and was never ours. TanStack's compaction middleware, which
  is what prompted this, is unavailable on the merits rather than declined. What blobot *does*
  own is a **session boundary**, so at 80% of ticket 09's working ceiling it asks the agent for a
  **handoff** and opens a fresh session with it. It shipped trying the runtime's own `/compact`
  first, on a cost argument, and **the author reversed that the same day from a live run**: a
  self-compacted agent came back having lost too much, and a cheap compaction that leaves an agent
  unable to continue is not cheaper than an expensive one that leaves it able to. `/compact` stays
  in the palette for a person to type; it is not something blobot reaches for. Survivable because **an agent's real state is a git
  worktree, not a conversation**: the branch, the commits and the working tree are untouched, and
  the loopback token and the mailbox are per agent rather than per session. Occupancy triggered
  and never time triggered, because compaction *is* cache invalidation and a timer firing on an
  idle team is background spend nobody asked for. Fired with margin, because the handoff turn is
  the most expensive one available: a handoff that stops, is empty, or runs past 6,000 characters
  is a **refusal to restart**, the old session is kept, and the transcript says so — and a real
  `claude` was measured writing 1,473 characters against that 6,000 limit, so the margin holds
  (`orchestrator/live-compaction.test.ts`, under `BLOBOT_LIVE_CLAUDE=1`, which trips the threshold
  by injecting a small `contextCeilings` entry rather than by editing the trigger). Per agent and
  on by default (`compaction` on the profile, `on`/`off` under *starting over when it runs out of
  room*), because a session and a worktree are per agent. blobot's own turns are published and
  recorded for what they *cost* and never for what they *said*: the handoff rides the
  `context_compacted` event, opens inline in the transcript, and is archived under
  `~/.local/share/blobot/handoffs/` — never in the AgentWorkspace, which is a checkout an agent
  could commit home. It travels into the fresh session as text and never as a path, which is
  ADR-0004's refusal applied again.

- **A prompt with a clock behind it.** `.scratch/routines/`, eleven tickets, all built. A
  **Routine** is one named instruction to **one Agent** — `<team>/<agent>`, never a team and never
  an AgentProfile, because a workspace, a session and a mailbox are what a turn needs and none of
  them are a Team's to lend. The schedule is a **closed set of three shapes** (hourly, daily,
  weekly) and never an expression: issue 04's cost ceiling is a vocabulary, so the runaway case is
  not bounded, it is *not offered*, and `cron` appears nowhere in the app. `Scheduler.due` is pure
  and core's; the timer, the window check and the calling are main's `RoutineRunner`. **blobot
  runs these while it is open and never in the background**, stated once on the screen: with no
  window the tick settles nothing, so a machine that slept and a machine that was shut give the
  same answer, and what they missed comes back as `missed 4 firings` with `Run now` beside it
  rather than as four turns arriving at once. A run gets **three turns**, not the team's ten, and
  a permission it raises **expires** — both because nobody is watching. **An agent may schedule
  one for itself with `propose_routine`, and it is armed when it is made** — issue 05's
  2026-08-30 amendment, which reversed *only a person may arm one* at the author's direction and
  records on its own ticket both the argument against it and what it costs. Four things pay for
  it, and none is optional: the Routine **opens inline in the transcript**, in the turn that
  created it, carrying `disarm`, because an agent arming something off screen is the version of
  this that must not exist; it keeps an **ink edge at the top of the Routines screen** until a
  person answers it, meaning *you have not seen this* and never *this is waiting for you*; an
  agent may hold at most **three armed Routines of its own**, a cap on spend rather than on
  attention, so disarming one frees a slot and waiting frees nothing; and everything an agent
  still may not do is untouched — no scheduling for a teammate, no deleting, no editing an armed
  one, one proposal per turn. In the transcript a firing draws in the
  **user's voice under a `system` line** naming the Routine — the words are theirs, the hour is
  not, and that is the whole disclosure, with no fourth voice invented for it. A run the user has
  not looked at leaves an **unread mark as ink weight** on the rail line already there, never an
  inversion, earned by origin and never by a turn they started.

- **The rail is about teams, and the doors are at its foot.** `YOUR AGENTS` and `ROUTINES` stood
  above `TEAMS` because an agent exists before a team — true of the model, wrong on screen: two
  headed rows over the list read as a second list stacked on the first. They are three rows at
  the bottom now, over the rail's one hairline: *Agents*, *Routines*, **Settings**. Settings is a
  third door and **not a lid over the other two** — an AgentProfile is the roster and a Routine
  is standing work that can put an unread mark on a rail row, and nothing behind a settings door
  should be able to do that. What is behind it is the machine: ticket 11's four states with
  ticket 11's remedies, which until now were reachable only from inside the hire dialog. One
  section, because a sidebar with one true item is more honest than four invented ones. The list
  row is **filled** everywhere now (`.listrow`), and a picker row is that same row outlined
  until it is chosen (`.listrow.pick`), which is the only difference between the two that means
  anything.

- **A fourth runtime, and the first nobody in the ACP working group wrote.** `.scratch/fx-runtime/`,
  five tickets, all resolved. **fx** is Vercel Labs' coding agent: a ~7 MiB native Zig binary,
  Apache-2.0, model and provider agnostic, with a first-party `fx acp` server. The adapter is
  `packages/core/src/adapters/fx`, and the reason it was worth building is that it **tests the
  claim `adapters/acp/` exists to make**: Claude's and Codex's bridges come from the protocol's own
  authors and OpenCode implements it beside them, so the shared half had never met a fourth party.
  It took one. The JSON-RPC, the transport, the wire shapes, the `session/update` translation, the
  option groups and the attachment blocks are all reused with no edit, and a live edit asserts the
  same title string the other three live suites assert for the same edit. **The one edit was a
  comment**: fx opens an MCP connection with `server/discover`, a newer draft's method, and falls
  back to the classic handshake *only because `peer-message-server.ts` answers unknown methods with
  an error* -- a `{}` result fails the session with `McpMissingResultType` and every fx agent would
  launch with no mailbox. That line is load-bearing now, and has a test named after the method.
  What is genuinely fx's own: **the persona has no channel at all**, so it rides the prompt on
  every turn, above the user's words and never in the `messages` row, which is `composeLeadBrief`'s
  shape and buys immunity to a compaction blobot cannot see -- every other candidate was measured
  and failed, including an `AGENTS.md` above the worktree, `--add-dir` (fx's own string says those
  directories contribute no instructions) and the loopback server's `instructions`. **The posture
  is `FX_PERMISSION_MODE` on the process**, not the ACP mode: a session in mode `ask` wrote a file
  without asking once, which is the Codex lesson word for word. **All three trust words answer
  `ask`**, because fx's other mode is "full tool access" with no carve-out for `rm`, `sudo` or
  `git push`, putting it above blobot's ceiling; `FX_EXPRESSES_TRUST` says so rather than letting
  three words imply a difference. `/allowlist` is refused in the palette because it writes a
  permanent allow rule into the user's own `~/.fx/settings.json`, which would be the one path by
  which an agent's turn could widen what the next agent may do. And **`accepts` is
  `{images: false, textFiles: true}`** -- the first real runtime to refuse an attachment kind, so
  ADR-0004's refusal-at-pickup path is finally exercised by something other than the mock.
  Detection is load-bearing rather than a courtesy here, because an unauthenticated fx fails
  `initialize` itself instead of advertising `authMethods`; `fx status --json` is the cheapest and
  most honest probe of the four, and it still cannot see the fifth state, since a signed-in account
  with no gateway credit fails a turn with `insufficient_funds`. Verified live against a real fx
  0.0.7 on a real subscription, `BLOBOT_LIVE_FX=1`: the persona holds, an edit names its file, the
  palette offers four of eighteen, and two agents' loopback carries a per-agent bearer token.

  **Both of that ticket's leftovers are spent, 2026-08-31.** `--live-fx=<dir>` and
  `--live-fx-mixed=<dir>` join the three roster shortcuts, and two real fx agents on one team
  carried a message through the mailbox **in both directions** with two clean worktrees behind
  them. And a real runtime was handed a real attachment for the first time on any of the four: a
  text file from outside the workspace, never named, its bytes embedded, its codeword answered --
  fx being the right one to spend it on because `accepts.images` is false, so the image half is a
  refusal at pickup rather than a turn. Two findings, neither blobot's doing and both on ticket
  05: **fx writes its own diagnostics into the agent message stream**, so a skill-discovery
  warning about `~/.claude/skills` draws as the agent's first words with nothing in the frame to
  tell it apart from what the model said -- not filtered, because guessing at a vendor's
  diagnostic wording is how a real answer disappears at their next release -- and fx declines the
  `attachment:` uri as *project instructions*, asking for an absolute local path, which is the
  thing ADR-0004 refuses, while reading the content block regardless.

- **The Cursor adapter** (`.scratch/cursor-runtime/`, eight tickets, ticket 01 measured live) in
  `packages/core/src/adapters/cursor`: `cursor-agent acp` first-party over stdio, the fifth
  runtime and the second built entirely on `adapters/acp/`'s shared half. The published docs say
  ACP takes MCP servers only from `.cursor/mcp.json`; **measured, `session/new` accepts
  client-supplied `mcpServers`** with per-server headers and no approval step, so the loopback
  rides the standard door — and because the door contradicts the docs, a live canary asserts it
  stays open. `CURSOR_CONFIG_DIR` per agent carries exactly two things (`cli-config.json`, the
  posture, enforced; `acp-sessions/`, resume state) and the login survives outside it. Ticket
  14's posture is `approvalMode: allowlist` with the allow list widening across all three
  attended trust words — the second runtime after Claude to express the gradation — and
  **`permissions.deny` stays empty**: a deny is a silent hard block whose `tool_call` reports
  `completed`, so the nine dangerous verbs are *unlisted*, which measured as a prompt. The
  persona rides the prompt every turn (the config-dir rules channel measured unread; `AGENTS.md`
  is the committable file ticket 14 refuses); `Mcp(blobot:*)` is vouched at every level so a
  peer message never waits on a human; the sandbox is `enabled` with network as a constant, not
  a dial. The two blocking extension methods are answered — `ask_question` refused in-channel,
  `create_plan` rejected, an unknown method errors — and the user's own MCP servers, skills and
  User Rules stay loaded, because the operator added them (ADR-0003; per-agent restriction is a
  future cross-runtime effort). Detection probes **only `cursor-agent`**, never the
  collision-prone bare `agent`; `status --format json` requires the vendor's own
  `isAuthenticated: true`; `CURSOR_API_KEY` / `CURSOR_AUTH_TOKEN` are stripped and the
  in-protocol `authenticate` is never used. `accepts` is `{images: true, textFiles: false}`,
  the exact mirror of fx. `--live-cursor=<dir>` and `--live-cursor-mixed=<dir>` join the roster
  shortcuts; `BLOBOT_LIVE_CURSOR=1` runs the live done-when suite (canary,
  sandbox-versus-loopback, the git verb-split syntax, the live edit title). PR #1 was the
  quarry, never the base: `extensions.ts` and `palette.ts` survive with credit, its
  `config.ts` mechanism and `ALWAYS_DENY` are refuted by measurement.

- **Handbooks are built, and nothing has been run live.** `.scratch/handbooks/`, ten tickets, all
  resolved, frontier empty. A **Handbook** is what an Agent knows about *this team's* work, held at
  `<team>/<agent>` — the identity the AgentWorkspace branch is named for and a Routine belongs to,
  and the one thing that grain never held. Standing instructions are about the person and travel
  with them; a Handbook is about the work and stays with the team, and nobody takes a handbook to a
  new job. Made of **entries**, folded into the Persona immediately **before** standing
  instructions, so the layout states the precedence and an entry the agent wrote never outranks a
  sentence the user wrote. It is **elicited, not authored**: an unbriefed agent's pane carries a
  notice card above the composer, and *brief her* starts a turn whose first words are the agent's
  own, because **there is no third party in the room** — the author's own correction, and the rule
  that killed a `system` line naming blobot. Agents add to their own with `record_entry`, which
  takes a **list** (a Routine proposal is a commitment and an entry is a note, so the one-per-turn
  cap that makes the first safe would make briefing take five turns), records **durable and not in
  the files**, and discloses every write inline in `Compaction`'s collapsed shape. **No new mark on
  the rail**: that mark is earned by origin, so a turn you started is not unread and a Routine run
  already marks the row. An agent may **withdraw an entry it authored as `noticed`** — the seam
  where *no rewriting its own Handbook* was narrowed, on the grounds that the load-bearing words
  were *freely* and *off screen* — and never a `told` one. Bounded at 1,000 and 8,000 characters,
  **provisional**, refused at the boundary and never truncated; the whole-Handbook refusal is the
  first in the app whose fix belongs to somebody who is not in the room, which is why it is the
  only one that leaves it. **Measured live on all four runtimes**: an empty prompt is refused by fx
  (`-32602`), accepted gracefully by Claude and Codex, and **confabulated on by OpenCode**, which
  invented a task and went reading files. So the control sends a minimal instruction on the wire
  that is never drawn. And an empty turn is not a free turn: ~36,000 tokens of cached prefix for
  seventeen output tokens. And a person meets it in the **agent's pane and nowhere else**: a notice card above the composer
while the Handbook is empty, carrying *brief them*, and once it is not, a `handbook · 4` door on
the tray with a **dialog** behind it. It shipped as a panel under the composer and became a dialog
the same day, from the first real Handbook: two entries and 774 characters took two thirds of the
pane against a bound of 8,000, and a body with no ceiling cannot live in the composer's footing.
It is a dialog rather than a screen over the surface because *your agents* is a **place** and this
is one agent's Handbook reached from that agent's own tray, where what you do changes what it
believes at the next start. The dialog offers **removal and never editing** (an entry you
edited is neither yours nor the agent's), and its *add one* is **a composer prefill rather than a
text field**, so `record_entry` stays the single path into a Handbook and every entry has a
disclosure block behind it. Its foot reads `1,240 of 8,000 characters`, which is not the gauge's
row said twice: the gauge answers what blobot spends on this turn, this answers how much room is
left in the thing being edited, standing beside the entries a person would remove. In the team
pane a Handbook is a **figure and never a body**, the opposite of `WORKSPACE`'s answer to the same
problem, because four Handbooks do not fold into one the way four statuses fold into a
`StatusWord`. `.scratch/handbooks/build.md` has what was decided while building and what bit.

- **Dictation — speak into the composer, get text there.** `.scratch/dictation/`, twelve
  tickets, eleven resolved and the twelfth built; `build.md` has what was decided while
  building. Voice becomes text and text becomes the ordinary prompt: no runtime takes audio, so
  this is a **composer input method** and not a fourth attachment kind. **ADR-0005, *The one
  hosted service, and the one key*** — the conscious exception to two permanent rules, drawn
  narrowly: transcription only, a service blobot calls and never an agent, a closed provider
  list chosen by criteria (OpenAI, Deepgram, Mistral), one key per provider in
  `dictation-keys.json` (`safeStorage` where the OS can, plain **and stated** where it cannot,
  `basic_text` never) or in `BLOBOT_<PROVIDER>_API_KEY`, which always wins and is **stripped
  from every runtime's environment** by `adapters/acp/child-env.ts`. **Local first**: a
  readiness scan from RAM, arch and disk (four words, `unfit` / `untested` / `fit` / `slow`, the
  last two measured by a real sentence in *say something*), three whisper.cpp weights and a
  `whisper-cli` blobot builds in its own CI (the repo's first workflow) fetched to
  `~/.local/share/blobot/speech/` with a streaming sha256 and `Range` resume — a figure that
  knows its end, `downloading · 412 MB of 574 MB`, and still not a bar (DESIGN.md). One
  `Transcriber` interface for both classes, four events (`partial`, `committed`, `ended`,
  `failed` by cause), the level never crossing IPC; the renderer opens the microphone through
  an AudioWorklet at 16 kHz, cuts segments from the level it measures and never sends silence,
  and main holds the one recording. In the composer: the mic at the head beside `+`, a glyph
  swap to a square, four ink bars from the voice, `LISTENING · 0:05` in the mono line, a ghost
  after the caret for a partial, committed text inserted at the caret. `MockTranscriber` plays
  three ugly scenarios in demo mode with the microphone genuinely open. Nothing has met a real
  provider yet; the whisper adapter has (1.8 s on `base` for a 10 s clip, identifiers intact).

- **blobot makes a sound now, and it is a fourth channel spent the way the other three were.**
  `.scratch/sound/`, ten tickets, all resolved, built, and `DESIGN.md` has a **Sound** section
  beside Motion. Raised from Velvet UI, and the author's own framing is what the effort is built
  on: a sound is either **interaction** or **notification**, and one test separates them —
  *did the person cause this sound in the last 200ms by an act they committed?* That split is
  what let the rule in the Routines bullet stand: *blobot still never interrupts: no notification,
  no badge, no sound* turns on the word **interrupts**, and a sound you caused cannot, which is
  the same argument `DESIGN.md` already accepted twice for interaction motion and for the gaze
  layer. Eight committed acts sound; **one notification does**, and it is bought rather than
  assumed — an agent `waiting` on a team you are not looking at, because with nobody listening a
  permission request is *cancelled, never allowed*, so silence there loses work nobody chose to
  lose. It never fires for a team already on screen in a focused window, and at most once in two
  seconds **app-wide**, since the rail already carries who and how many. A Routine firing does not
  sound (the unread mark is earned by origin), a turn ending does not (one prompt to four agents
  ends four turns), and nothing navigational does — the `@mention` list was refused its open
  animation on frequency alone, and frequency is harsher for a sound because a sound cannot be
  looked away from. **One voice, synthesized and never a file**, so no two plays are identical and
  no asset ships; a second timbre would be a fourth channel inside a fourth channel. The grammar is
  three rules: yes rises a fifth and no falls the same fifth, a repeated note at a whisper means a
  standing rule was written (`arm` and `allow always` share it, `disarm` is `arm` with it taken
  away), and consequence goes down and takes longer. **Attention is bought with duration and never
  with volume.** There is no `prefers-reduced-sound` and blobot **infers nothing** — reusing
  `prefers-reduced-motion` is refused, because it is a signal about a different sense and some of
  the people who set it rely on audio more — so the switch is the whole accommodation, three of
  them in Settings' third section, on by default, stated rather than consented to. The standing
  constraint that falls out of having no media query: **no sound may be the only carrier of its
  fact.** `--screenshot` is a hard mute above the switch, and jsdom having no `AudioContext` is
  why the suite is silent with no test-only branch. Tuned by ear in
  `.scratch/sound/prototype.html`, which stays: three voices and thirteen per-event switches the
  app deliberately does not offer, and a twenty five second session at real cadence that is the
  only honest way to argue about frequency.

- **Only the agent you asked answers you, and the rest folds.** Two fixes to one observed
  failure, 2026-09-04. The **wake prompt** told an agent its prose was invisible to the sender
  only on the *batch* branch, which is the branch that fires least; woken by a single peer
  message, a real agent wrote *"Hi Alice"* into its own turn, promised to be in touch, called
  nothing, and the sender waited for a reply that had never been posted. Both transcripts then
  held a false statement about the other. `REPLY_RULE` in `envelope.ts` is one constant in both
  branches, in the same position, so they cannot drift apart again. On screen, the team pane drew
  that teammate's answer to *Alice* in the user's own column at the user's own altitude, usually
  as the longest thing there; **the block that already folded the turn's own calls holds it now**,
  one run of the addressed agent's steps, the mail either way and the whole turn a teammate took
  because of it, named on the shut line with its face (`ran 2 tools · 1 message with` Bob). It
  shipped that morning as a *second* fold, `aside`, and merged into this one the same day at the
  author's direction: the reader wants everything the turn had to arrange demoted together, and
  whether blobot classed a line as a call or as a message is not a distinction they asked about.
  A run has one principal, so a fan-out never puts one agent's words under another's name; a
  teammate's turn always folds however short, mail with nothing behind it never does; the three
  exclusions bind the teammate too, the unanswered permission hardest, because an agent nobody
  addressed has no other way of reaching the user. **What the principal said to you is never in the
  block** -- all of it comes out and is drawn underneath in order, grouped into one turn -- which
  is the fourth rule tried in one day and the author's own: trimming the end folds away your
  agent's only words to you, cutting the run there strands the teammate's later work as a second
  block reading `ran 1 tool` for a turn that was not theirs, and lifting only the *last* prose is
  worse than both, because an agent that pings three teammates writes a paragraph per reply and
  **the last one is the last increment, not a summary**. blobot provides no inference, so it
  cannot summarise them and must not drop them. A short caption stays in, since it introduces the
  call beneath it and means nothing away from it. The `to Alice` tag under the user's bubble went
  with it: it was the address said twice under words that begin `@Alice`, and what it
  was guarding against is answered where it happens. **The silent-handoff detector still cannot
  see this**, because `#wake` passes it no `HandoffWatch` and its shape assumes an operator
  prompt with names in it. That is a ticket, not a fix.

Next: **the dictation done-when by hand** — a Spanish sentence with identifiers into a real
agent, locally and through one provider (the `whisper-cli` workflow ran and its hashes are
pinned; the engine's release URL is private for now, on `build.md`). Then **brief a real
agent**, which is the only thing left in that effort and what every
provisional number in it is waiting on: measure the Handbook a real interview produces, watch
whether ticket 04's empty-state block actually opens the conversation, and do it on OpenCode as
well, since it is the runtime that confabulated. Then surfacing whether an agent resumed or
started fresh, and a ticket for fx's diagnostics in the message voice. Each effort's `build.md`
has the order and the reasons.

The mock is not a stepping stone to be discarded: ticket 08 makes it a **shipped demo mode** that
reproduces every observed trap on purpose — ragged deltas, a cancelled tool reporting
`completed`, `used: 0` on cancel — because a kind mock produces a UI that shatters on first
contact with a real runtime.

`.scratch/` is tracked in git on purpose — the map is the canonical artifact, not scratch work.
