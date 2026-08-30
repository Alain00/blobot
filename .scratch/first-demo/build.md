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
| Deleting and editing a team, the workspaces with it | `apps/desktop/src/main/team-store.ts` | 10 |
| The permission channel: `waiting`, the inline block, two answers | `orchestrator.ts`, `permission-choices.ts` | 14 |

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
- **A resumed agent looks exactly like one that started fresh.** `session/load` landed
  (2026-08-29) and `runtime.resumed` records which of the two happened, but nothing surfaces
  it. Observed on the first real launch: two agents resumed, and Mara's stored session was gone
  on Claude's side, so she silently started again under a transcript she can no longer remember.
  The user has no way to tell.
- **A backgrounded team is invisible while it works.** Three teams stay live now, and a team
  the user is not looking at can keep taking turns with only its turn budget bounding it. The
  rail shows nothing. Whether it *should* keep working is a product question and should be a
  property of the team, not a side effect of how recently it was clicked.
- **A profile cannot be edited.** Hired and retired, nothing in between: no rename, no change
  of role or runtime — and therefore no answer yet to what an edit means for the teams an agent
  is already on. Named in ADR-0001 as not decided.
- **Agents are only visible inside team creation.** There is no screen for *your agents* on its
  own, which is the surface the model most obviously wants next.
- **A team still cannot be renamed.** Deleting and changing who is on it landed 2026-08-29;
  the name is the half that is load-bearing (it is `blobot/<team>/<agent>`), so renaming means
  moving every branch or accepting that the branch stops matching the team. Undecided.
- **The rail's delete and edit have never been clicked.** Everything under them is covered —
  the store's tombstone, the provider removals, the refusals — but the IPC handlers in
  `index.ts` that release the team from the pool, remove the worktrees and start it again are
  not, for the same reason the open-error banner is not: nothing in the harness can click.

- **The renderer hides blobot's own `message_agent` tool by matching its name**
  (`apps/desktop/src/renderer/src/model.ts`). This is the leak ticket 04 warned about in a
  smaller hat. The clean fix is for the adapter to tag its own tool so the UI never matches a
  string — worth doing *with* the first real adapter.
- **An answered permission block does not survive a re-snapshot.** The question does (it comes
  back with `UiSnapshot.permissions` while it is still pending), but the record of what you
  answered is renderer state: switch away and back and the line is gone. Permissions are not in
  the event vocabulary and so are not recorded — see the note on ticket 04 below.
- **A permission request is not persisted, and never reaches the transcript tables.** It is a
  runtime callback rather than an `AgentEvent` (ticket 04 kept the correlation id and the reply
  channel out of the vocabulary), so `SqliteRecorder` never sees it. What the user allowed is
  therefore not auditable, which is a real gap the moment anybody asks what an agent was
  permitted to do.
- **Thinking is not displayed anywhere.** It is persisted (`agent_messages.kind = 'thought'`)
  but no pane shows it.
- **Migrations are found by a dev-time relative path** in `apps/desktop/src/main/index.ts`.
  Packaging must copy them next to the bundle; that line is where it changes.
- **`packages/domain` was considered and not done.** The pure subset is a subpath rather than a
  package, because the map settled two packages. If a CLI is ever built, that is the moment to
  reopen it.

### UI fixes from the first hands-on session, 2026-08-29

The author drove the app with a mouse for the first time and reported three things. All three
are fixed; the first two were bugs, the third was a design mistake.

- **The transcript could not scroll.** `.stream` had `overflow:auto` and always had, but a grid
  item's automatic minimum size is its content, so the conversation grew the grid row past the
  viewport instead of overflowing inside it. The fix is three declarations, and all three are
  needed: `grid-auto-rows:minmax(0,1fr)` on `.vA`, `min-height:0` on `.vA .conv`, and
  `flex:1 1 0;min-height:0` on `.stream`. The pane now also follows the newest line and stops
  following the moment the reader scrolls away from the bottom (`useStickToBottom` in
  `Conversation.tsx`) — an agent streaming for a minute must not drag a reader out of the
  paragraph they went back to read.
- **Messages are markdown now**, via `streamdown` (`components/Markdown.tsx`), for agent
  answers and peer messages. Not for the user's own line: that stays verbatim, because it is the
  one voice in the pane whose exact characters the user typed. Streamdown rather than a plain
  renderer because deltas arrive with the syntax half-typed — an unclosed fence, a table missing
  its last row — and it completes the incomplete node instead of flashing raw asterisks; a
  settled message is rendered `mode="static"` and skips the repair. It ships Tailwind class
  names and this app runs no Tailwind, so its classes are inert and the elements are dressed by
  `.md` in `styles.css` in the page's own vocabulary. Two things that needed knowing: each
  source line of a fenced block is a `<span>` that Tailwind would have made `block`, so
  `.md pre code > span{display:block}` is what stops a code block collapsing onto one line; and
  `controls={false}` drops its copy/download chrome, which is styled by the framework we do not
  run.
- **"How do I switch teams?"** — the rail showed the running team alone, with the others as a
  list at the foot that appeared only once a second team existed. So the question had no answer
  on screen, and a user with one team could not see that teams are a set at all. The rail is now
  the set: every team is a row under `TEAMS`, the running one drawn as its group of blobatars
  and carrying its agents indented underneath, the rest as names and counts marked `stopped`.
  Only the running team has statuses or blobatars to draw, because only one orchestrator runs at
  a time — the rail now says that rather than hiding it. A first pass put this in a dropdown on
  the topbar's team name; the author rejected it, and was right: an aside that lists what you
  have beats a menu that hides it.

- **The blobatars were too small**, on a reference to Grok's agent list. The reason is not
  cosmetic: the blobatar is ticket 09's *motion* channel, and at 26px in the rail and 22px in
  the transcript, breathing and bobbing are a few pixels of wobble — the one thing carrying
  "Alice is working" was the hardest thing on the page to see. Rail agent 26→34, team group
  24→28, conversation header 30→38, a message's 22→28, the peer route's 18→20, with row
  padding and the peer/tool indents following. What was deliberately *not* taken from the
  reference is its second line: Grok's is a last-message preview, ours is the role, which is the
  durable fact about that agent and appears nowhere else — and the status word already occupies
  the right of the row.

Still open from that session, and asked of the author again: whether a team switch discarding
the previous team's live agents without asking is acceptable or alarming. The creation flow has
now been used with a mouse; whether it reads in the right order with agents before the team was
not reported on.

### UI, 2026-08-29: read against Grok's agent app

The author put a screenshot of blobot beside one of Grok's multi-agent app and asked what to
take. Three things landed; the rest of the comparison is written up in the session, not here.

- **The activity column was a header over nothing.** On a quiet team a fifth of the window was
  an `ACTIVITY` label and blank space. Grok has no such column at all: its one structural event
  ("Created routine") sits inline in the timeline. The split adopted is by *kind*, not by
  wholesale move. A turn that ends `end_turn` is log and stays in the feed. A turn that stops
  for any other reason (`cancelled`, `max_tokens`, `refusal`) is now also a `system` item in the
  conversation, because the reader is looking at an answer that just stopped being written and
  the reason belongs beside it, not in a column they may not be watching. The feed keeps its
  width when empty and says what will land there. Collapsing it was rejected: it would reappear
  on the first tool call and shove the conversation sideways mid-turn.
- **There was no time anywhere in the transcript**, while the feed timestamped every line. It
  matters more here than in Grok's app: a launch restores a persisted transcript verbatim, so
  yesterday's conversation was pixel-identical to one thirty seconds old, and the agent does not
  remember it either. A muted mono rule now appears before the first item and wherever the gap
  since the previous one is over fifteen minutes. `1:16 PM` today, `Yesterday 1:16 PM`, then
  `Aug 20 1:16 PM`. A burst of replies inside one turn gets none.
- **A short conversation hangs from the bottom** rather than stranding three lines at the top of
  an empty column. `.stream > :first-child{margin-top:auto}`: the auto margin absorbs free space
  and resolves to zero once the transcript overflows, so `useStickToBottom` is untouched.

A `system` line now carries the agent's name in the team pane, where several agents share one
stream. That applies to error lines too, which were anonymous before.

What was looked at and deliberately **not** taken: Grok's bubbles and right-aligned user turns
encode two sides, and blobot has three voices, one of which (the dashed peer enclosure) exists
to read as lower authority. Also skipped: its search field, its account row, its reactions, and
its last-message preview under each row, which was already rejected once in favour of the role.

Still open from that comparison, in rough order of value: the conversation header repeats the
topbar's team name and path in the team pane, and that line is where ticket 14's posture
indicator wants to go; stopped teams in the rail carry no recency, so there is nothing to choose
between two of them; the composer's `send` is the weakest control on the page.

### UI, second pass, 2026-08-29

Follow-ups from the same comparison, plus three things the author asked for while looking at it.

- **The conversation header stopped repeating the topbar.** In the team pane its second line was
  the workspace path, which the topbar already carries. It is now ticket 14's quiet posture
  indicator, so what the agents may do without asking is on screen permanently rather than only
  in the creation disclosure. One `POSTURE` constant feeds both panes. The line wraps rather than
  shrinks, and the posture is the half that never truncates: a branch name is recoverable by
  looking, an indicator nobody can read is noise.
- **Stopped teams carry recency**, from a new `SqliteStore.lastActiveAt` (the later of a message
  and an agent's own words). Terse on purpose (`32m`, `3h`, `yesterday`, `Aug 20`), because `ago`
  is the word that gets the line truncated. Rail and transcript time copy now share `time.ts`.
- **The composer's send takes an ink border once armed.** It shared the grey of every secondary
  button, so the border now answers "will this go anywhere?".
- **The team mark replaced the overlapped blobatar row.** Members are packed into one square and
  arranged by how many there are: one fills the box, a pair sits corner to corner, three make a
  triangle, four a square, and past four the last slot is a `+N`. `markLayout` is a pure function
  with its own tests, so the arrangement is assertable without a DOM.

  Two decisions inside it. The box **grew** to 46px in the rail and 48 in the header rather than
  packing members into the old 28px footprint: the blobatar is ticket 09's motion channel, and
  breathing at `scale(1.035)` on a 13px blob is half a pixel, which is the regression the 26→34
  pass had just fixed. And the mark animates the **folded team status once, for the whole
  cluster**, rather than each member separately, because four members bobbing out of phase is
  four things fidgeting where one animation is one thing moving. Members overlap by a few pixels
  and keep the drop-shadow cut, since a gutter leaves air an irregular silhouette cannot fill.
- **The agent rows are no longer indented** under their team. Only one team runs at a time, so
  there is never a second group to tell them apart from, and the rule under the group already
  closes it. Every blobatar now sits on one column, with the team's mark as the wider one. The
  stopped teams' ghost grew to hold the same box, so the names stay on one left edge.
- **The running team's row dropped its agent count.** Its members are enumerated directly
  beneath it, and `1 responding` needs the width more than `2 agents` does.
- **The rail is resizable and remembers its width** (`useRailWidth`, `localStorage`, 180 to 460).
  Pointer capture rather than window listeners: the pointer leaves the 9px handle on the first
  frame of any real drag. The width is a preference about this screen, so it does not go in the
  database, which is for things the orchestrator can act on.

Fixed on the way: **`--pane=<agentId>` had stopped working.** The first snapshot reset the pane
to the team unconditionally; resetting now belongs to a team *change*, which is the only case
that needs it, since the agent it was showing belongs to the team that just went away.

### UI, third pass, 2026-08-29: message containers and the rail row

The author put the two transcripts side by side again and asked the direct question: Grok's is
friendlier to someone who has never used this. It is, and the reasons separate cleanly into
three, only one of which was a decision ticket 12 had made.

**Ticket 12 is amended, not contradicted** (two `## Amendment` sections on it). What changed:

- **The user's turn is a solid bubble on the right, with no name.** The earlier note in this file
  rejected exactly this, on the grounds that bubbles encode two sides and blobot has three
  voices. That reasoning was half right: right-alignment does not encode two sides, it encodes
  *one* side, and there is only ever one "you" no matter how many agents share the pane. The
  agent voice stays uncontained and the peer stays dashed, so the authority ordering the dashed
  border exists for is untouched. The `to Alice` tag moved under the bubble, team pane only.
- **The transcript is a column rather than a left margin.** `max-width:680px` flush left in a
  1300px pane put every message against the rail with half the window empty, which is what made
  it read as a log. A `.col` wrapper fills the pane to 900px and centres. This was the largest
  single difference between the two screenshots and it cost no decision at all.
- **A turn is labelled once.** Consecutive answers from one agent drop the repeated blobatar and
  name and tighten to an 8px gap, so the speaker gap is the wider one. `continuesSpeaker` in
  `model.ts`, with tests: only the agent voice groups.
- **An agent's rail row carries its last line and when it said it**, reversing the earlier
  rejection of a preview. `lastLineOf` takes that agent's own words only, collapsed to one line,
  and is tested against the case that matters: a peer message addressed to Bob is not Bob
  speaking, so it never becomes his preview.
- **The role stays as the fallback**, against the author's first instinct. Grok can drop it
  because its names *are* roles ("Inbox Manager", "Expense Manager"); blobot's are the user's
  own, so `Alice` alone says nothing about what she is for. Role until she speaks, preview
  after.
- **`idle` is no longer printed**, on the rows or on the team fold. Four rows saying IDLE under
  a team saying ALL IDLE is the resting state of a quiet app spelled out five times. Every other
  state keeps its word, so `waiting` still inverts and `failed` still strikes through.
- **Not taken: a coloured status dot.** Ticket 12's governing rule spends colour on the
  blobatars, and seven states do not fit in one dot regardless. Raised with the author rather
  than silently dropped.

Not verified visually: the 900px column at a wide window. This machine's display caps near
945px, so the screenshots only exercise the narrow case, where the column fills.

### UI, fourth pass, 2026-08-29: the composer and the wait

Author-directed, from the running app rather than from Grok's screenshot this time. Ticket 12
carries a third `## Amendment`; the details are there. In short:

- The composer is a pill with a round **Lucide** `ArrowUp` (the app's first icon dependency,
  `lucide-react`). `send to Alice` is gone from an agent's pane, where the pane is the
  recipient; the team pane's button wears the resolved blobatar instead.
- **The gap between sending and the first delta had no indicator at all.** Three dots under the
  agent's name now fill it, and stop the instant there is streaming text. `isPending` covers the
  cases that matter: it never runs alongside a live message, and never stands in for `waiting`
  or `failed`, which are states a human has to clear rather than wait through.
- The activity column has a toggle in the chrome (`useFeedVisible`, `localStorage`). This is not
  the auto-collapse that was rejected: a toggle never moves the conversation mid-turn.
- Scrollbars were the platform's light grey with stepper arrows, which made them the brightest
  thing on a monochrome page. Now a hairline that takes ink on hover.
- Rail selection dropped its ink rule; the team mark's members overlap by a third.

### UI, fifth pass, 2026-08-29: the creation flow, and a hue that persists

The add-team screen was a form with mono labels; it is now the one **editorial** page in the
app. It is read once, start to finish, before anything exists, which is a different job from
every other surface, where the blobatars are the loudest thing and the user is working rather
than reading. So: a display line in the hand face the page already had (Caveat, at 58px, no new
family — an Instrument Serif was tried and the author rejected it), a standfirst, and four
numbered steps. It still spends no colour.

**Controls are the composer's, generalised.** `.field` is the composer's pill with a 12px
radius; `.btn` is the same pill; `.btn.primary` inverts to ink when armed, exactly as send does.
The old `.textfield` / `.agentdraft` / `.hire` vocabulary is gone. A roster row is a bordered
card with the agent's **blobatar** on it and a circular tick, so the list of agents is
recognisably the same set of faces that will appear in the rail.

**Hiring is a modal.** Not because the form is long, but because hiring is not a step of making
a team: the agent exists afterwards whether or not this team is created, and can join any other.
A dialog says "its own thing" in a language every user already reads. Escape and the scrim close
it; the blobatar preview is 104px, seeded by the name as it is typed, because this is the only
moment the user meets that face.

**A blobatar hue is now a persisted fact about an agent** (migration `0003`, nullable `hue` on
`agent_profiles` and on `agents`, copied at team creation like name and role so a transcript
shows the face the agent wore at the time). NULL means the name derives it, which is the default
and stays the default. `AgentProfile.hue` is the one field in `orchestrator/domain.ts` that only
the UI reads; it is there rather than in the renderer because the face has to follow the agent
onto every team it joins. Nothing branches on it.

**Thirteen colours in a block, not a slider.** The first pass was a hue slider, and the author
replaced it: 360 answers to a question with about a dozen useful ones, and two agents a few
degrees apart are two agents nobody can tell apart in a 20px rail. `HUES` is spaced so every
pair is distinguishable at blobatar size, which is the only size that matters, and the grid is
seven by two exactly filled — a ragged wrap reads as a list that ran out of room. The first cell
is the name's own colour, drawn as the dashed silhouette the app already uses for "not drawn,
and that is fine", so the default is inside the set rather than a reset button beside it. It is
a `radiogroup`, because that is what it is.

**Radix owns the dialog and the select** (`@radix-ui/react-dialog`, `-select`), at the author's
direction, after asking whether shadcn was worth adopting. It is not: the design system already
exists and shadcn's value is mostly the visual defaults it would have to override, plus Tailwind
in the build. What was genuinely missing is the half nobody screenshots — a focus trap, focus
returned to the button that opened the dialog, `aria-modal`, and a listbox with arrow keys and
type-ahead. Those come from the primitives; every rule of the look is still this app's own.
Icons are Lucide (`lucide-react`), added in the fourth pass.

**A collision worth remembering:** the modal's `.preview` class silently restyled the *rail's*
preview line, which had the same name, and put a bordered box around every agent's last message.
The stylesheet is one flat namespace with no build step between it and the DOM, so a generic
class name in a new screen is a live grenade. The modal's is `.hirepreview` now.

### The interface is written down: `DESIGN.md`

Asked for by the author, 2026-08-29, once the fifth pass settled. `DESIGN.md` at the repo root
is now the standard: the governing rule and its two consequences, the tokens, the type rules,
the three transcript voices and why the peer's border is dashed, the controls as descendants of
the composer, Lucide, Radix-for-behaviour-never-for-looks, motion behind
`prefers-reduced-motion`, the product-copy rules (no em dashes, never *authenticated*, a refusal
is not a dialog), and what one flat stylesheet namespace demands of a new screen.

It is written as rules with the reason attached to each, because a rule whose reason is lost
gets worked around by the next session. `CLAUDE.md` points at it twice: once in the permanent
architectural rules (the blobatars are the only saturated thing) and once under agent skills.
Contradicting a rule in it is a ticket 12 reopen and an entry here; adding to it is ordinary
work.

### UI, sixth pass, 2026-08-29: the peer enclosure, and following the transcript

- **The peer enclosure is one dashed edge, unfilled.** Four dashed sides on a raised ground was
  fine at demo length and wrong at real length: a peer message is often a whole turn quoted
  back, and the box made it the heaviest thing in the transcript, with the reply it was about
  reading as a footnote to it. The dashed-against-solid signal is untouched, which is the part
  ticket 12 actually decided. Its context line lost the mono box it sat in as well: that is
  prose the agent wrote, and a mono frame made it look like a payload.
- **Long peer messages fold**, to about eight lines, with a fade and a `more` toggle. The fade
  is applied only when something is actually cut, so a message that fits never looks truncated;
  `overflows` is measured from the DOM, because it depends on the rendered width and on markdown
  nobody can count in advance, and it is re-measured on resize since the rail is draggable.
  Only the peer voice folds. An agent's answer is the thing the pane exists to show.
- **The transcript follows its own height now.** `useStickToBottom` keyed on the item list,
  which missed every other way the column gets taller: markdown laying out after it is handed
  the text, a code block highlighted a frame later, an image, a fold opening. A long answer
  would stream off the bottom of the screen and stay there. It is a `ResizeObserver` on the
  column, and it still lets go the moment the reader scrolls away from the bottom.

`DESIGN.md` carries all three, since it states the peer rule.

### Copy: no em dashes

Asked for by the author, 2026-08-29: em dashes read as AI slop. Product copy uses a period, a
comma, a colon, or the app's `·` separator. This covers UI strings, placeholders, tooltips, the
spoken lines in the demo and mock scenarios, and the prompt text in `orchestrator/envelope.ts`
that agents read. The persona also carries one line of house style, `Write plainly. Do not use
em dashes.`, placed last so it can never outweigh the refusability framing above it. It does not cover code comments, this file, or internal invariant throws,
which are in the author's own voice.

### Settled, 2026-08-29: a Workspace need not be a git repository

Raised by the author while driving the app, and now an `## Amendment` on ticket 10. A Workspace
is one of three kinds, decided by inspecting the folder and **stored on the team**, because the
kind chooses the provider that brings the team back at launch:

| Kind | AgentWorkspace | Where |
|---|---|---|
| `git` | A worktree on `blobot/<team>/<agent>`. Unchanged. | `~/.local/share/blobot/worktrees/` |
| `nested` | The tree mirrored: a worktree per **chosen** repo, loose files copied. | `.../trees/` |
| `plain` | A copy of the folder per agent. | `.../copies/` |

"Not a git repository" is no longer a refusal. Two remain: a repository with no commits, and a
`nested` workspace with nothing at all in scope.

- `packages/core/src/workspace/inspect.ts` is the single classification pass, and every
  provider's `inspect` delegates to it so the three can never disagree about what a folder is.
  It looks two levels deep, because `~/code/thing` and `~/code/acme/thing` are both shapes
  people keep and walking a home directory to the leaves to answer a folder picker would feel
  broken.
- `GitWorktreeWorkspaces` grew `addWorktree` / `reconcileWorktree` / `removeWorktree`, addressed
  by path rather than by agent, because `NestedRepoWorkspaces` does exactly that per repository
  and a second copy of `worktree add`, `prune` and the `-d`-versus-`-D` rule is how two
  providers start disagreeing about what git does.
- **A copied workspace's reconcile has no `repaired` row.** The copy *is* the work, so a
  missing directory is `lost`. Telling that from `absent` needs a marker, since there is no
  branch to ask about: provisioning writes `<root>/<team>/<agent>.json` *beside* the copy, so
  an agent that empties its own workspace cannot erase the evidence it was ever provisioned.
- **Deleting an agent keeps a copy** and says where it is. `-d` versus `-D` asks git whether a
  branch holds unmerged commits and nothing can ask that of a directory, so ticket 10's own
  rule decides: never put unrecoverable loss behind a dialog. Copies accumulate; the UI says
  the path. `RemovalOutcome` is now `{work: 'discarded' | 'kept'}` rather than naming a branch.
- **In the mirrored tree, a repository that is `absent` among provisioned siblings is `lost`.**
  On its own, no-branch-and-no-directory is a first run; beside eight repositories that are
  fine it cannot be, and reading it as "new" is exactly the confusion `absent` was added to
  prevent.
- `NestedRepoWorkspaces.initialize` **throws**. Offering `git init` on a folder that contains
  repositories would create a repository wrapping repositories — the wrong action, not an
  unhelpful one.
- Migration `0002_remarkable_stone_men.sql` is additive (`teams.workspace_repos`, JSON), and
  `workspaceKind` gained `nested`. An existing team keeps working, and a `nested` team created
  before the picker existed reads an empty scope as "every repository", so it still comes back.

Known gaps this leaves: **no way to change a workspace's scope after creation** (it is part of
team editing, still unbuilt), the loose files in a mirrored tree are a copy inside an otherwise
git-backed workspace and a repair re-copies them over the agent's edits (said in the reconcile
detail, but nothing surfaces it in the UI yet), and **the scope picker has been screenshotted
but never clicked** — it was reviewed by pointing the flow at a fixture folder, not with a
mouse.

## Settled, 2026-08-29: the four items of the last handoff

All four landed together. What they cost and what they decided that no ticket covers:

**1. Deleting a team.** `SqliteStore.tombstoneTeam` plus `deleteTeam` in
`apps/desktop/src/main/team-store.ts`, a confirm on the team's own rail row, and the removals
reported afterwards rather than swallowed.

- **The order is workspaces first, rows second.** Every branch is `blobot/<team>/<agent>` and
  the team's name is what finds it, so the rows have to still say what they said when the
  worktrees were made.
- **A workspace that cannot be reached is not a refusal.** The ordinary reason to delete a team
  is that the folder is gone, which is exactly when `git worktree remove` cannot run: a team
  deletable only while healthy would be undeletable precisely when the user wants it gone. Each
  removal is attempted, whatever it says is reported as `unknown`, and the rows go either way.
- **The tombstone releases the name.** `teams.name` is unique because it is half of a branch
  name, so a tombstone that kept the string would refuse the next team of that name while
  showing the user nothing to explain it — and the user deleting a team pointed at a moved
  folder is usually about to make the same team again. The dead row is renamed
  `<name> · deleted · <id>`, which is safe only because it happens after the removals and
  nothing derives anything from a team name again.
- **What is kept is said out loud.** A branch with unmerged commits survives and nothing else in
  the app will ever mention it, so the confirm turns into a report rather than closing.

**2. Ticket 14's permission block.** The channel is the orchestrator's:
`onPermissionRequested` / `answerPermission` / `onPermissionSettled`, with `AgentStatusTracker`
finally getting the `permissionRequested()` calls it was written for.

- **The orchestrator owns it, not the app.** It holds the trackers, so `waiting` cannot
  disagree with the blobatar; and it installs the handler on every runtime whether or not
  anybody is listening, because **with no listener the answer is `cancelled`, never allowed**.
  An unattended team is blobot's normal case and approving on nobody's behalf is the one answer
  we may not give.
- **The option ids never leave the main process.** The renderer answers `allow` or `reject`;
  `permission-choices.ts` maps those onto the runtime's option ids by *kind*. `allow_always`
  has no path to the UI at all, which is how ticket 14 stays a posture rather than becoming an
  approvals system.
- **The two announcements race.** A permission request travels a callback while the tool's own
  `tool_call_started` travels the turn's queue, and either can reach the renderer first —
  observed the wrong way round on the first demo run, where the block appeared under a line
  reading `running`. The reducer handles both orders and the tool line is not drawn at all
  while its call is `asking`.
- **The mock asks now** (`callTool(..., { asks: true })`, scenario `asks-before-deleting`), and
  demo mode ends on a live block. A permission prompt was otherwise unreachable in a scripted
  replay, which meant the first place we would meet the UI was somebody's real repository.

**3. Ticket 14's disclosure**, at the foot of the creation flow, above the button that spawns
the first agent. **Its text had to change, and ticket 14 carries the amendment.** The specified
copy promises a prompt before `rm`, `sudo`, `curl`, `git push` and package installs — that is
`OPENCODE_CONFIG_CONTENT`'s list, and OpenCode is deferred. On Claude the only lever is
`session/set_mode("default")` and what counts as dangerous is the CLI's judgment, so printing
the list would be blobot claiming a rule it did not write. **The same sentence had already
shipped as the conversation header's posture indicator** (`asks before rm, git push, curl`),
where it was false for every agent in the app; it now reads `asks before dangerous commands`.

**4. Editing a team.** `editTeamRoster` takes the whole roster rather than a delta, because the
screen is a set of ticks. Joining instantiates an Agent exactly as `createTeam` does — the same
code path deliberately, since a membership *is* a workspace, a session, a mailbox and a status.
**Saving stops and restarts the team**: a persona names the roster (ticket 06), the mailbox
resolves recipients out of it, and an agent who has just left still holds a session and a
loopback token, so a live team whose membership changed is a team disagreeing with itself.
Restarting is cheap now that `session/load` resumes each agent where it was.

## Next session

1. ~~**A screen for *your agents*.**~~ Built, 2026-08-29, with the open question answered:
   see the section at the foot of this file and `docs/adr/0002-editing-an-agents-definition.md`.
2. **Surface a resumed session.** `runtime.resumed` knows whether an agent came back knowing
   the conversation or started again under a transcript it cannot remember, and nothing says
   so. Observed live: Mara silently started fresh.
3. ~~**A backgrounded team that is working says nothing.**~~ Built, 2026-08-29: its rail row
   draws its members and folds their status, and it said `STOPPED` about a live team until it
   did. See the section at the foot of this file.
4. **Renaming a team**, which needs a decision about the branches first.
5. ~~**Talking to a team without naming a member**~~, charted 2026-08-29 at
   `.scratch/team-addressing/`. **Answered and built** through issue 06: issue 01's lead, issue
   02's multi-mention in place of the coordinator, issue 05's silent-handoff detector, and then
   issue 06, which reopened 02 and 04 and gave the lead its duties. The author's ask is a team group chat with a
   coordinator that routes messages and hands out work; the effort splits that into the
   ergonomic (a default recipient, which reopens ticket 12 on one point) and the coordinator
   itself, whose cost, single point of failure and relayed-authority question are the reason it
   is charted rather than built.

Things left unverified, worth knowing before trusting them:

- **Nobody has ever clicked delete or save.** Everything under them is covered — the store's
  tombstone, the provider removals, the refusals, all under test — and both dialogs were
  rendered and read on screen. What has not run once is the click: the IPC handlers in
  `index.ts` that release the team from the pool, remove the worktrees and start it again. Same
  reason as the banner below, and the same fix: somebody with a mouse, or a driver that can
  click.
- **What the user permitted is not recorded anywhere.** A permission is a runtime callback, not
  an `AgentEvent`, so `SqliteRecorder` never sees it.
- **The team-would-not-open banner has never been seen on screen.** `selectTeam` returns a
  `TeamOpenResult` and `App.tsx` renders it, and both halves typecheck, but showing it needs a
  mouse click and the screenshot harness cannot click. Every other path is tested.
- **`session/load` is proven against Claude only**, including the changed-port case
  (research 15 §7a). OpenCode inherits none of it: when tickets 03 + 16 come back, its resume
  is unobserved, and so is a *changed server name* on either runtime.

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

## OpenCode is deferred, by the author, 2026-08-29 — **lifted 2026-08-30, see the foot of this file**

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

## Settled, 2026-08-29: switching a team no longer restarts it

Raised by the author, who asked what keeping every team alive would cost and whether teams
should instead sleep after some idle time. Neither, in the end. What the reading turned up:

- **An idle team costs only memory.** A live team is a bridge process per agent plus one
  loopback port; between turns it spends nothing. So an inactivity timer evicts exactly the
  teams that are cheap and keeps exactly the ones that are spending the user's quota, which is
  backwards. It also makes the moment an agent loses its memory depend on how long the user
  looked somewhere else, and nobody can hold that rule in their head.
- **The real cost of a switch was never latency, it was amnesia** — `startTeam` said so in a
  comment: no `session/load`, so every launch was a fresh session against the same transcript.

So the fix went in that order: resume first, then a count.

**`session/load` in the Claude adapter.** `resumeSessionId` on `ClaudeAgentRuntime`; the
provider's session id is read back out of the `sessions` table (`lastProviderSessionOf`) and
handed to the runtime at launch. Three things it has to get right, all of them observed rather
than assumed:

- `mcpServers` must be re-supplied on the load (research 15 §7), or `message_agent` is gone
  while the replayed transcript still shows the agent using it a moment earlier.
- The load replays the entire prior transcript as `session/update` notifications *before* it
  answers, so the adapter mutes its stream while it runs (`#replaying`). Unmuted, every launch
  repeats everything the agent has ever said.
- A session the provider has forgotten falls back to `session/new` rather than failing the
  launch. `runtime.resumed` says which happened.

**Research 15 §7 had left the load-onto-a-different-port question inferred**, and blobot's
loopback port is ephemeral, so it mattered. It is now §7a and **observed**: a resumed session
accepts a *changed* URL and bearer token, and `session/close` does not end a session for good,
so a tidy shutdown and a resumable one are the same shutdown.

**`TeamPool`** (`apps/desktop/src/main/team-pool.ts`) keeps the last three teams live, LRU by
selection. Two rules beyond the plain LRU, both about not destroying work: the active team is
never evicted, and **a team that is mid-turn is never evicted** — the limit is a target, not a
cap, and `evictIdle()` collects it once it is quiet. Selecting a live team promotes it, so
going back to a team you were just in costs nothing.

**Every stream channel now leads with a team id** (`blobot:event`, `:status`, `:message`,
`:turns`, `:budget`). Several teams stream at once, and `model.ts` holds one flat item list
that the rail reads each agent's preview line out of, so the renderer drops what is not the
team on screen — a ref, not state, because the listeners are registered once.

Three levels of test, because no one of them can cover this: `team-pool.test.ts` pins the
eviction rule against a fake; core's `live.test.ts` pins the resume against a real `claude` on
a new port; `apps/desktop/src/main/live-switch.test.ts` puts the two together through the real
`startTeam` with two real teams (`BLOBOT_LIVE_CLAUDE=1`) — select, prompt, evict, come back,
and the agent still knows the codeword.

**What this does not decide:** whether a backgrounded team should keep *working* while the user
is looking elsewhere. It can, and the turn budget is the only thing bounding it; nothing
surfaces that in the rail yet. That is a product question, and it should be a property of the
team rather than a side effect of how recently it was clicked.

## Settled, 2026-08-29: the command palette has its data, and its hard question has its numbers

A second effort, `.scratch/command-palette/`, off the first demo's map. Issue 01 is built and
resolved; 02 and 03 are still open and 03 is a grilling that wants the author.

**What landed.** `AgentRuntime` can be asked for a session's slash commands and skills:
`availableCommands` plus `onCommandsChange`, with `AvailableCommand` as blobot's own shape and
`sameCommands` (`packages/core/src/commands.ts`) as the change test both runtimes share. The
Claude adapter holds the cache; `commandsFrom` in the translator normalizes an
`available_commands_update` and `translateSessionUpdate` still returns no events for it. Nothing
reached `AgentEvent`, the recorder, the store or the migrations, which was ticket 04's condition
for sanctioning the feature at all.

Two things worth knowing that the ticket did not say:

- **A menu advertised during a resume's replay is kept**, where every other replayed update is
  swallowed. A menu is current state, not something that was said, and `#sessionId` is not
  assigned until `session/load` returns, so the ordinary identity guard would have dropped it.
- **`undefined` and `[]` are different answers** from `commandsFrom`. One means the notification
  is not about the menu, the other means the menu is empty, and only the second may replace a
  full list. An empty advertisement is a real event, not a no-op.

**The measurement is the actual result of this session.** A real `claude` in a fresh workspace,
today, advertises **223 commands and 97 KB, on every turn**. The research's figure was 48. The
gap is not drift: **140 of the 223 are one plugin's skills** (`posthog:`), so the size of this
menu is a property of whatever the user installed last, not of blobot or of Claude.

**Sixteen built-ins survive the bridge's own terminal-bound filter and mutate state blobot
models somewhere else** — `/compact` and `/autocompact` against `TeamPool`'s resume, `/config`,
`/model`, `/effort`, `/fast` and `/auto-mode-setup` against ticket 14's forced permission mode,
`/agents`, `/list-agents` and `/rename` against blobot's own roster, and `/__remote-workflow`,
which is a private command that should never have been in a user-facing list.

The one that is not a menu question: **`/mcp disable all`** turns off ticket 15's loopback
server, which is the agent's only route to a teammate. Hiding it from a list does not stop it
working when typed, so it wants a decision of its own rather than a filter.

**Next on this effort:** issue 03 (grilling, needs the author) before issue 02 (the composer),
which is exactly the order the spec asked for and now has real numbers to argue against.

## Settled, 2026-08-29: an agent inherits the project, not the operator (ADR-0003)

Issue 03 was grilled with the author the same day, in eight questions over three rounds, and it
did not end where it started. The palette turned out to be the small half.

**`docs/adr/0002-an-agent-inherits-the-project-not-the-operator.md`.** A blobot agent loads
`project` and `local` settings scopes and **not** `user`. Until now it was the operator's own
Claude with a persona bolted on, because that was the bridge's default and nobody had chosen it.
The persona is untouched and was never in question: this decides what an agent *has*, not who it
*is*.

Research's open question is closed. `settingSources` reaches the SDK (the bridge sets its own
before spreading ours) and it **fully** isolates, with no plugin-sourced leak. Verified
separately, because the ADR rests on it: with `["project","local"]` a workspace's CLAUDE.md is
read and its own `.claude/skills` are advertised; with `[]` neither is.

**The numbers, all live against a real `claude` in an agent workspace:**

| | commands | payload |
| --- | --- | --- |
| before | 223 | 97 KB |
| `user` dropped | 48 | 11.7 KB |
| after the palette allowlist | **5** | **1.9 KB** |

**The palette is an allowlist the repo owns.** Dropping `user` alone does not rescue it: all 48
survivors are the provider's built-ins, and hand-filtering those is a denylist against a vendor's
release cadence, which **fails open** — the next release puts a new built-in in front of a user
unreviewed, as `/batch` (thirty parallel agents) would have. So `palette.ts` offers the
workspace's own `.claude/` commands plus five vouched by name (`/code-review`,
`/security-review`, `/verify`, `/simplify`, `/compact`), and fails closed.

It filters **inside the adapter**, because a list of one provider's command names is
provider-specific knowledge and the permanent rule puts that behind `AgentRuntime`. No component
ever holds an unfiltered list. The wire has `{name, description, input}` and no source field, so
blobot reads `<workspace>/.claude/` itself and **intersects** with what was advertised: drift
costs a command we failed to offer, never one we offered that does not exist.

**`/compact` was argued and kept.** The spec's claim that it fights `TeamPool`'s resume
overstates it — compaction does not invalidate the session id. What it causes is transcript
divergence, which already exists and is already recorded here (Mara, starting fresh under a
transcript she could not remember). The context gauge is on screen; withholding the remedy while
showing the problem is the worse trade.

**Three hazards a menu filter cannot fix got their own effort**, `.scratch/runtime-posture/`,
because a hidden command still runs when typed:

1. **Mode drift is watched and ignored.** `current_mode_update` is handled, assigned to
   `#modeId`, and the comment there says drift "is the posture quietly failing". Nothing reads
   the field. Meanwhile the creation flow keeps telling the user the runtime prompts.
2. **Permission state can be rewritten on disk.** `/fewer-permission-prompts` writes an
   allowlist into the *project's* `.claude/settings.json`, `/update-config` configures hooks.
   That file is inside an AgentWorkspace, which is a worktree of the user's repository, so it
   survives the session and can be merged back. ADR-0003 makes it sharper, not safer: that is a
   file blobot now deliberately loads.
3. **`/mcp disable all`** switches off ticket 15's loopback server, an agent's only route to a
   teammate. blobot cannot block it and will not pretend to. Ticket 15 already measures
   readiness by the inbound handshake, so the signal exists and is currently used once and
   discarded.

**Not built, deliberately:** issue 04, the line in the creation disclosure saying the operator's
own skills are not loaded. It lands in `NewTeam.tsx`, which the concurrent *your agents* session
holds.

**The composer half is built too** (issue 02), on top of the other session's cmdk work. Commands
reach the renderer exactly the way statuses do: `Orchestrator.commandsOf` and `onCommandsChange`,
`blobot:commands` leading with the team id, and `UiSnapshot.commands` to seed a rebuilt pane.
Per agent, never per team.

The one place `/` cannot copy `@`: **the trigger is position, not the character.** A slash
command is only a slash command at the start of the message, because that is what the CLI
parses, and `src/auth.ts` and `and/or` are not somebody reaching for a menu.

Three states that are easy to collapse into one and must not be: no recipient yet (say so, name
`@` as the fix), a session that offers none (a real answer, not a spinner), and a typo, which
closes the menu rather than showing an empty one — otherwise every mistyped command claims Enter
and refuses to send. A note takes no keys at all, because anything left off the list still works
when typed. The decision is `commandMenu` in `model.ts`, pure and tested; the component renders
it.

### Amended the same day: the operator's own skills come back

The author, on seeing the menu: *global claude code skills are not present why?*

Because the scope decision was argued from a number that belonged to something else. Of the 175
commands `user` scope contributed, **140 were an installed plugin's and 37 were skills the author
had written.** Dropping the scope to be rid of the first threw away the second, and
`settingSources` cannot separate them.

**All three scopes load again.** The separation moved to `palette.ts`, which enumerates
`~/.claude/skills` and the workspace's `.claude/` from disk — a plugin installs into neither, and
the wire carries no field that would say where a command came from. The allowlist still fails
closed. Live after the change: **40 offered out of 223 advertised, zero plugin entries.**

The sentence this cost a round to learn, now in ADR-0003 and CLAUDE.md:

> The settings scope decides what an agent **can do**. The palette decides what blobot
> **offers**.

**A bug worth remembering: a skill directory is usually a symlink.** 36 of the author's 37 are
links into a shared `~/.agents/skills`, and `readdirSync` reports each as a symlink rather than a
directory, so the first implementation found exactly one skill and looked like it worked.
Membership is decided by `statSync` on the `SKILL.md`, which follows links. Pinned by a test.

**The cost, and it is real:** `user` scope also restores the operator's global CLAUDE.md,
settings and hooks for every agent. `.scratch/runtime-posture/`'s issue 02 — permission state
rewritten on disk — gained a second route in. Issue 04 of the palette effort is closed obsolete:
there is no longer anything to disclose.

**Proven live: a skill the repository ships autocompletes.** A `.claude/skills/house-style/` and
a `.claude/commands/ship.md` in a real workspace both appear, ahead of the five built-ins. That
is the population the palette exists for, and the reason ADR-0003 keeps `project` scope. blobot
itself ships no `.claude/`, so in this repo the menu is the five built-ins and nothing else,
which is the honest result rather than a bug. Demo mode now advertises a mixed list, and Alice
and Bob differ, because a command belongs to one teammate's session.

## Settled, 2026-08-29: your agents, and what editing one means

The first item of the last handoff. Two halves: a screen, and the decision ADR-0001 left open.

**The decision, now `docs/adr/0002-editing-an-agents-definition.md`.** An edit **restates the
whole definition** rather than patching it, so an emptied field means "nothing standing". The
profile takes all of it; a team the agent is already on takes the role, the standing instructions
and the face, at that team's next start, and keeps its name and its runtime.

The reason the split is not arbitrary, and the thing worth knowing before touching this again:
**`branchNameFor` derives the branch from `refSlug(agentName)`** (`packages/core/src/workspace/
workspace.ts`), so renaming an Agent row leaves its worktree unfindable by the only code that
knows how to find it. That is the same wall renaming a *team* is behind, which is why both are
one problem and this ADR does not pretend to solve either. A Session belongs to the provider that
opened it, which is the runtime half of the same argument.

What keeps a transcript honest turned out **not** to be `agents.name`: it is
`sessions.persona_text`, which records what the agent was actually told and is never rewritten.
So the transcript argument alone would have permitted a rename. The branch is what forbids it,
and the schema comments now say so rather than repeating the transcript reason for every column.

**Nothing about an edit restarts a team**, which is the opposite of editing a roster. A persona
names the roster and the mailbox resolves recipients out of it, so a live team whose membership
changed disagrees with itself; a live team whose definition changed is mid-conversation under the
definition it started with, which is correct. The consequence the screen has to say out loud is
that a changed role or a changed instruction is not visible on screen until that team next
starts, and it does say it, in both places: before the save, naming the teams, and after it, from
what the main process actually did.

**The screen** (`apps/desktop/src/renderer/src/components/Agents.tsx`) sits over the working
surface rather than in place of it, reached from a row above TEAMS in the rail — the model's
order, agents first. A working surface, not editorial: the creation flow's hand face and numerals
are deliberately absent. `HireAgent` moved out of `NewTeam.tsx` into `AgentForm.tsx` and is now
shared with `EditAgent` and `RetireAgent`, which is what makes hiring and editing visibly the
same fields.

**New in the store:** `updateProfile` and `restateAgent`, both writing columns that already
existed, so there is no migration. `AgentDefinition` is the profile without its id, in
`orchestrator/domain.ts`, because an edit restates that shape exactly. `UiAgentProfile` now
carries `runtimeId` under the same rule `UiRuntimeChoice` already had: an opaque token the
renderer round-trips and never reads, so the edit form can open the picker on the runtime the
agent already has without matching label strings.

**`--screen=agents`** joins `--pane=`: the hash the main process hands the renderer is now a
query string, so a screenshot can open a surface it cannot click to. That is how this screen was
reviewed, against the author's own database, with `--no-autoplay` so no turn was spent.

**One agent had three faces, and now has one.** Found by the author on this screen. A blobatar
is derived entirely from the string it is seeded with, and three surfaces seeded it three ways:
the rail, the composer, the transcript and the team mark by **Agent id**, the roster lists by
**profile id**, and the hire preview by the **name being typed**. Every one of them is the name
now, which is what the colour picker's own label ("the colour its name gives it") always claimed.
`DESIGN.md` carries the rule. The consequence, written into ADR-0002: a rename keeps the hue,
which is stored and restated, and changes the silhouette, which is derived from the name, so a
team that keeps the old name keeps the old shape.

**The screenshot harness renders about one run in three.** Repeated launches against the real
database come back as a uniformly `#0a0a0b` PNG, at any delay, with no renderer console error and
the same result at `HEAD` with `--demo` and with `--disable-gpu`. It is `capturePage` rather than
the app. Take the picture more than once and check the mean pixel value before believing a blank.

**Still unclicked, and now with company:** nobody has clicked save on this screen either. The
store half is covered — eight tests in `team-store.test.ts` pin the restatement, the two fields
that do not travel, the name clash, the cleared instruction and an agent on two teams at once —
but the IPC handler, like delete and edit-team before it, has only ever been typechecked.
Retiring an agent has no test above the store's tombstone, for the same reason.

## Settled, 2026-08-29: streaming a token stopped costing the transcript

A second effort off the first demo's map, `.scratch/transcript-scale/`, whose issue 01 is now
resolved. Found by reading the code rather than by hitting a wall: the conversation pane rendered
every message it had ever been given, from a query with no `LIMIT`, with no memoization.

**Issue 01 is built.** `ItemView` is memoized and its props narrowed, so the work of a streamed
token is the message being written and not the history behind it. Measured, because it is a
performance claim: **401 markdown renders per token into a 400-message transcript, now 1**, and
on the clock **24.1 ms per token, now 10.2** at that depth, 5.0 to 2.3 at demo depth. The
instrument is committed (`Conversation.test.tsx`, jsdom, `Markdown` mocked so the count is of
renders rather than of layout), and **jsdom is a new root devDependency** because observing a
memo needs a real reconciler and `react-dom/server` has none.

The clock is still not flat, and that is the finding worth carrying: what remains at 400 is
`Conversation` itself mapping every item and handing React 400 elements to compare. Cheap, not
free. It is the argument for issue 03 and now has a number behind it.

Two things the ticket did not anticipate:

- **`onAnswerPermission` was an inline arrow in `App.tsx`**, so it was a fresh identity every
  render and would have defeated the memo across the whole transcript by itself. Stabilized
  inside the pane rather than by asking `App` to remember a `useCallback`.
- **A settled message's blobatar no longer carries live status**, which is a real if small
  visible change, and now a rule in `DESIGN.md`. Passing the status only while `item.live` is
  what lets a settled item's props be constant; it also stops twenty of Alice's old messages
  bobbing in unison the moment Alice starts working, which is the fidget the team mark's single
  folded animation already exists to avoid.

Six tests render each voice and read the column back, because narrowing the props rewrote all
six case bodies. The `--demo` transcript was also read on screen — after **three blank captures
in a row** at `--screenshot-at=6000`. The one-in-three capture flake recorded above is worse
than one in three; a longer delay got a frame on the fourth attempt.

**Issue 02 is now unblocked** (the bounded snapshot query), and it carries an open question for
the author before its affordance can be built: whether "load earlier" is a button or happens on
scroll. That is `DESIGN.md`'s call, not the ticket's.

## Settled, 2026-08-29: a rail row says what its team is doing

Raised by the author from a screenshot: `hermes-agent` sat in the rail as a dashed silhouette
with the word `STOPPED` next to it, and the question was why switching stops a team when the
pool was built to stop stopping them.

**It did not.** The team was live. The word was a literal string in `Rail.tsx`, on every row but
the active one, left over from when switching really did stop the team you were leaving. The
pool work updated the button's behaviour and the comment above it and left the label beneath
untouched. So the rail asserted `stopped` about teams that were often still working.

The silhouette had a separate cause and the same shape: `UiTeamSummary` carried `agentCount` and
no members, so the row had no name to seed a face from. It was not a design decision about
backgrounded teams; it was a placeholder for data that was never sent.

What the row says now:

- **Its members' faces**, from `UiTeamSummary.members`. The count is `members.length`. The ghost
  survives for the one team that genuinely has no face to draw: a team with nobody on it.
- **Its folded status**, when it has one, through the same `foldTeamStatus` and `StatusWord` the
  team on screen uses. `waiting` still inverts, which is the point of the word: a backgrounded
  team blocked on a permission request has no other way to reach the user.
- **Nothing, while it is quiet.** The same rule the agent rows follow. `idle` printed on every
  row is one word repeated as many times as the user has teams.

**Loaded-versus-evicted is deliberately not surfaced.** Which three teams `TeamPool` happens to
hold is a fact about a process pool: the user did not choose it, cannot control it, and an
evicted team resumes its session when it comes back. A badge for it would teach a rule nobody
can act on. An unloaded team contributes no statuses, folds to `idle` and is therefore silent,
which is honest — it has nothing in flight either way. What *is* worth surfacing is the next
item below: whether an agent came back knowing the conversation. That belongs in the transcript,
beside the agent it happened to.

Two things this forced:

- **`UiSnapshot.statuses` now covers every live team**, not just the one on screen, and
  `App.tsx`'s status subscription is the one channel *not* filtered by team id. Every other
  channel stays filtered — a second team's messages in this transcript would be a worse bug
  than the one being fixed. Agent ids are per membership, so two teams cannot collide in the
  map, and the reducer's snapshot case still replaces rather than merges: it seeds the other
  rows and forgets a team the pool has since unloaded, which is the correct thing to forget.
- **`start-team.ts` was dropping the stored hue**, found while wiring this. A running team drew
  the name's derived colour while every other surface drew the one the user picked. The hue is
  the only part of a face that is stored rather than derived, so losing it is one agent with two
  faces, which is exactly what `DESIGN.md`'s seeding rule exists to prevent.

`Rail.test.tsx` renders the row and reads it back: it draws its members, it never says
`stopped`, it folds `2 working`, it inverts for `waiting`, and it is silent both when its team
is idle and when the pool is not holding it. Read on screen against the real database:
`portfolio` draws three faces and `3 agents · 13m`, with no status word.

**Not exercised end to end:** a backgrounded team lighting its row *while working*. Every piece
is covered — the main process sends status per team from `attach`, the renderer accepts any
team's, the row renders each state — but nothing has driven a real second team into `working`
and watched the row change. Same reason as the delete dialog above: it needs a mouse.

### Settled, 2026-08-29: the block offers **Allow always**, and MCP calls were never blocked

Asked why MCP calls "are not allowed" and to add *allow always*. Both halves were answered
against a real `claude` rather than by reading (`probe.mts`, `probe2.mts`, `probe3.mts` in this
session's scratchpad, all three run live).

**Nothing in blobot rejects an MCP call.** An MCP server declared in the workspace's `.mcp.json`
loaded, the tool was offered, the bridge raised `session/request_permission` for it with the
ordinary three options, answering `allow_once` ran it, and the tool returned. Injecting a server
of our own alongside it (so `allowedTools: ['mcp__blobot']` is in play, the first amendment's
pre-approval) changed nothing for the inherited one. What is true, and is what an MCP call
*looks* blocked by, is ticket 14's own posture: under `session/set_mode("default")` **every**
user MCP tool prompts, every call, and a request nobody answers is **cancelled, never allowed**,
which reaches the agent as `Tool use aborted`. Backgrounded teams do not draw the block into the
open transcript (they carry it in their rail row's `waiting`), so a team left alone on a
prompting MCP tool will sit there.

That is also what made *allow always* the fix rather than a feature: without it there is no
answer that survives the next call.

**Allow always ships.** Ticket 14's amendment has the measurement and the reasoning: the rule
lands in `<workspace>/.claude/settings.local.json`, per agent, and the block names the file
where it offers the button. `PermissionOutcome` gained `allowed_always` in core; `choicesOf`
gained `allowAlwaysOptionId`; the option ids still never leave the main process, since the
renderer names an intent (`PermissionChoice`) and not a provider's option.

Also fixed while here: the creation disclosure still said blobot does not prompt for the user's
own MCP servers. It has been false since the first amendment, and it was the one sentence a user
would have read while watching an agent stop on exactly that.

Still true, and still unrecorded: a permission is a runtime callback, not an `AgentEvent`, so
`SqliteRecorder` never sees what was allowed. An *always* now leaves a trace on disk that a once
does not, which is the first time that gap has an artifact behind it.

## Settled, 2026-08-29: interaction motion, and a cold start that says so

Two changes, and the second was found by shipping the first.

### The stylesheet had no `transition` in it, anywhere

Every hover, focus border, reveal, fold, modal and full-screen overlay changed state in one
frame. That was not an oversight so much as an overshoot: `DESIGN.md`'s Motion section reasoned
about *ambient* motion, which is spoken for by the blobatars, and by omission banned responsive
motion too. Those are different budgets, and the section now says so — **ambient** loops and
means status, **interaction** runs once because a person did something and is over before the
eye returns to the status column.

Seven places took interaction motion, each of which had failed a frequency-and-purpose gate
before it was written: the agents sheet's arrival, the row actions' hover reveal (120ms, pointer
devices only), the permission block's arrival, the scrim and modal, the peer message's fold
(`interpolate-size:allow-keywords`, so `max-height` can interpolate to `max-content`), the colour
swatch, and press feedback on `.btn`/`.iconbtn`. Rejected and worth not re-proposing: the
composer's `@mention` menu (keyboard-initiated, 100+/day), pane and team switching, the rail's
hover colour, the activity feed, transcript message entrances (the pending dots already bridge
that), and the turn pips.

Three things that cost a rebuild each and are worth knowing:

- **Entrances are keyframes, not `@starting-style` transitions.** A transition out of a starting
  style sits at the starting value until the element has been rendered once, and a window that
  is not getting frames can leave it there for **seconds** — measured, not theorised: the agents
  screen stayed blank for four. An animation that never runs leaves the element at its ordinary
  computed style, which is arrived.
- **They start from a dim frame, not an invisible one.** Even a keyframe holds its opening frame
  while starved. At `.3` that is content you can read; at `0` it is a screen that looks broken.
- **The agents screen's ground does not fade, only its sheet.** Fading an opaque full-bleed panel
  means every starved frame shows the running transcript through the screen covering it, with
  rows the user cannot click.

`.modal` is centred with `translate`, not `transform`, so the entrance `scale` composes with the
centring instead of scaling the -50% offset and walking the sheet sideways.

Withdrawal for `prefers-reduced-motion` is one block, **last in the file**, because it and the
rules it overrides carry the same specificity. Fades stay, travel goes.

### A cold start had no feedback at all, and the launch had no window

Reported by the author while the above was landing. Three things were wrong, in increasing order
of how bad they were:

1. `switchTo` awaited the whole start before telling the renderer anything, so clicking a team
   in the rail did nothing visible for the seconds a workspace reconcile and a process per agent
   take.
2. The renderer had nothing to draw even if it had known, because the roster only existed once
   the team was running.
3. **At launch the team was started before `createWindow()`.** A cold start was spent with no
   window at all.

The fix uses a status the vocabulary already had and nothing had ever emitted. `starting` has a
blobatar animation, a mono word and a place in the team-status fold; it had no producer.

- `opening` in the main process holds the team being started and the set of agents already up.
  `openingSnapshot` builds the snapshot from **the database** rather than from a running team:
  the roster, the roles, the hues and the runtimes are all known the instant the user clicks, and
  only the processes are not. The transcript comes too, because a team you are returning to had
  a conversation.
- `startTeam` takes `onAgentReady`, fired from the runtime's `ready` lifecycle, so agents leave
  `starting` **one at a time** instead of all at the end. A four-agent team no longer looks
  frozen for as long as its slowest member takes.
- The launch team now starts *after* the window and is not awaited. The rail comes up first and
  the team arrives into it. A launch that cannot open its team still is not a launch that fails.
- Sending is closed while `opening` is set, in the composer *and* in the `blobot:prompt` handler:
  `current()` is still the previous team during a switch, so a message sent then would have
  reached the wrong team's agent. The field stays open, because the draft is worth more than the
  wait.
- The transcript's pending dots are suppressed while opening. `starting` is a pending status
  because an agent whose runtime is coming up has usually just been sent something; on a cold
  start nobody has said anything, and three dots under an empty transcript claim an answer is on
  its way.

Verified against two real Claude agents with the start artificially slowed: the rail draws
`2 STARTING` on the team row and `STARTING` on each agent, the hairline sweeps, and send is
closed. **The `--screenshot` review flag cannot see this on its own** — the renderer mounts after
a real 2s start has already finished, so reviewing it means slowing `pool.start` on purpose.

## Settled, 2026-08-30: the blobatar has a rule, and the header stopped repeating the rail

Raised by the author: the blobatars are readable and expressive, and that is exactly the
problem — the same face appeared often enough that the rail, which is the census, was no louder
than a send button. Counted for one agent on the team pane, one moment: the rail row (34,
animated), the rail's team mark (46), the conversation header (38 for an agent, 48 for the team
mark), every settled turn (28), the pending row (28), the peer route header (20, twice), the
composer's mention menu (18) and the send button (17). Five simultaneous instances of one
identity, and **the largest was the header, not the rail**.

Ticket 12 is amended and `DESIGN.md` carries the rule:

> A blobatar appears where you are **identifying among** agents or **choosing** one, and never
> where a single agent is **merely named**.

It is a rule rather than a list so the next surface answers itself. Four changes came out of it.

- **The conversation header is one mono hairline row.** It was a face, a bold name, a role and a
  `StatusWord` over the workspace line; the selected rail row a few pixels to its left already
  carries all four, larger, and carries the same `StatusWord`. What is left is the role, the
  runtime and the branch or path, all mono and muted: the facts the rail does *not* have.
  **Ticket 14's posture line came out of the header too**, on the author's call and amended on
  ticket 14: the indicator existed so the creation disclosure would not be clicked past in week
  one, and a sentence printed over every pane all day is not read by the second day either. The
  disclosure still carries it, and the permission block is still where a user meets it. `team` is no longer a prop of `Conversation` at all — the topbar crumb is
  where the team's name and path live. Height went from ~56px to ~28px and nothing above the
  transcript is bold or saturated any more.
- **A peer message is one shut line.** `message received from ⬤ Alice`, opening on a click into
  the context, the message and the received side's trust framing. The eight-line fold is gone
  and `Foldable` with it, along with `interpolate-size:allow-keywords`, which existed only so
  that fold could grow. The dashed edge moved off the line and onto the opened message, where the
  quoted turn it was always about actually is: a one-line label needs no enclosure, since it says
  in words what the border said in texture. Opening is a 200ms fade-and-lift, not a height animation: there is no cut
  to grow out of when the message was not on screen at all a moment ago. One face, the far end's.
- **The send button shows the recipient's name and the arrow, never their face.** A blobatar on
  a button reads as the affordance rather than as an identity.
- Kept, and each for the rule's own reason: the rail (identify, choose, status), the composer's
  mention menu (choosing among faces, and the fastest way to pick), and a turn in the transcript
  (identifying among agents in a mixed-team column).

Reviewed with `--screenshot` on the demo team pane and on `--pane=bob`. Desktop typecheck and
all 113 tests pass. `Conversation.test.tsx`'s `draw` grew a `then` callback, because the peer
voice can only be asserted on the far side of a click now.

`DESIGN.md` had two lines saying the header carries status; both are corrected there.

## Built, 2026-08-30: a team has a lead, and the team pane writes to it

`.scratch/team-addressing/`, issue 01, and the answer to ticket 12's one-point reopen. The ask
was to say something to a team without naming a member first. This is the ergonomic half of it
and nothing more: **no routing, no coordinator, no broadcast.** The lead receives the message as
itself, in one session, exactly as `@lead` would have delivered it, and issues 02 to 05 are
untouched and still open.

`teams.lead_agent_id`, migration `0005`. An **agent id**, because leading is a fact about a
membership rather than about the agent — the same agent leads one team and not another, and
ADR-0002's "an edit restates the definition" would otherwise drag the designation across every
team the agent is on. No foreign key: `agents.team_id` already points the other way, and a
circular reference is a thing SQLite will create and drizzle-kit will not drop.

**NULL is a behaviour, not a missing value.** The pane reverts to what ticket 12 specified, send
disabled until a mention resolves. Three ways to be there: a team formed before the column, a
lead taken off the roster, and a caller that named nobody. The rule that decides all three is
**the default recipient is only ever somebody the user watched themselves choose** — so nobody
is promoted when the lead leaves, and an existing team gets no lead until the user opens its
roster and says. That rule is also what keeps this from being the quiet default ticket 12
removed.

`LeadPicker` (`components/Lead.tsx`) is on both screens that decide a roster: the creation flow's
*Who joins* and the roster dialog. Faces with one marked, which is what DESIGN.md's new blobatar
rule earns a face for — choosing among agents. In creation the first agent ticked is marked
before the team exists; in the dialog, naming a lead counts as a change on its own, since a team
that never had one is the ordinary reason to open it.

In the composer only `implicit` changed. The reopen's price is the composer saying who: the
placeholder is `Message Alice. @ to say who else`, and the send control carries the name once the
placeholder is gone.

`--screen=new-team` joins `--pane=` and `--screen=agents`, for the same reason they exist.

Tested: five cases in `team-store.test.ts` (first agent leads, the flow's choice is honoured, a
sitting lead survives a roster change, a named lead resolves to this team's membership, a lead
taken off the roster leaves none) and four in a new `Composer.test.tsx`. Reviewed on screen: the
demo team's pane addressing Alice, and the lead picker under a ticked roster.

**Unclicked**, in the sense this file already uses: nobody has saved the roster dialog with a new
lead in the running app. The store half is covered by tests and the picker was rendered, but the
dialog's own save path with a lead change has only been exercised by `editTeamRoster` directly.

## Settled, 2026-08-30: the rail's order, and the team folder

Two changes on the rail, the first a prerequisite for the second. Ticket 12 carries both with
their reasons; `DESIGN.md` carries the rules.

**A team keeps its place when you open it.** `Rail.tsx` built `rows` as `[running, ...others]`,
so opening a team hoisted it. `sqlite-store.ts:94` already orders `listTeams` by `createdAt`, so
the rail now renders that order and substitutes the running team **in place**; the prepend
survives only for demo mode, whose team is a TypeScript file and is in no summary list. Three
tests in `Rail.test.tsx`: it keeps its place, it is still drawn from the conversation while doing
so, and it still leads the column when the store has no row for it.

**A team row is a folder** (`TeamMark.tsx`, rewritten). Two inline SVG paths — a back with a
tab, and a front that is a panel when shut and a flared pocket when open — in
`--line`/`--ground`/`--raised`, with up to three members peeking over the front and a `+N` on the
panel. `markLayout`'s square packing is gone; `peekLayout` is a single overlapping row, clamped
so three faces plus two steps can never leave **the folder**, which is narrower than the box.
The status animation moved from the faces to the folder.

That last move is what pays for the fit. The peeking faces are 52% of the box rather than 62%,
which is under the ~26px floor the 26→34 pass established — and legitimately so, because that
floor is a floor on *motion*: under it a `scale(1.035)` breath is half a pixel. These faces do
not breathe. The folder does, and they are its cargo, so they only have to be identifiable.

Reviewed with a throwaway `--screen=marks` harness — a strip of shut folders at 1/2/3/4/6, both
open candidates, the ghost, and a mock rail column, at 46/92/138px — then deleted. Three things
it caught that the rail alone would not have:

- Three open states read as a folder that was merely **empty**, which is the dashed ghost's
  meaning: a tapered `clip-path`, a dropped panel, and a flap rotated eight degrees on its
  bottom-left corner. What works is the ordinary open-folder shape the author supplied as a
  reference — a **front pocket flared wider than the box at the top and narrower at the bottom**.
  That took the folder from two bordered boxes to two inline SVG paths, because a `clip-path` on
  a bordered box loses the stroke down every slanted edge.
- **Keeping one face** in the open folder, the other candidate, is worse than emptying it: it
  reads as *a team of one*, on the row whose entire roster is listed directly beneath it.
- The `+N` hung below the front panel rather than on it, and read as a detached footnote.
- Two corrections after the shape was right, both from the author looking at it in the rail: the
  back ran to the bottom of the box, so its two bottom corners came out past the sides of the
  narrowing pocket; and the folder was drawn to the box's edges, which made the faces the smaller
  half of their own mark. The back now stops at y=58 and the folder is inset to x 4..96.

**The fly-out is built** — `useFaceFlight.ts`, called from `Rail`. Each agent row's face starts
where that member was sitting in the shut folder, at the size it was there, and travels to its
row. 190ms, `--ease-out`, staggered 30ms and squeezed on a large roster so the last face still
lands under 250ms.

**The first half of the FLIP is arithmetic, not measurement, and that is the whole design.** The
usual shape of this — capture rects before the click, replay them after — is wrong here, because
a team switch is *asynchronous*: a cold team takes seconds to open, and a rect captured before
the click has had a whole rail's worth of reflow to go stale. The source is derivable instead.
The folder is still on screen when the effect runs, `peekLayout` is the same pure function that
placed the faces inside it, and between them they give an exact source rect at the moment the
animation starts. Nothing is captured, so nothing can go stale — and the source is *identical* to
where the face was by construction rather than by measurement, because it is the same function
call with the same arguments.

Three decisions inside it:

- **Only opening travels.** The team being left has had its rows removed from the document by the
  time this runs, so there is nothing to animate them from, and chasing it would mean captured
  rects and the staleness above. It is also the right asymmetry: leaving is the system
  responding, arriving is what the person asked for.
- **Keyed on the roster, not the team.** A team opens in two steps — its row arrives from the
  store, its members arrive with the snapshot — so keying on the team id alone runs the flight
  against an empty column.
- **Cancel, then `Animation`.** A CSS animation restarts from zero when re-triggered; A → B → C
  is ordinary in a column of teams, and this replaces cleanly mid-flight. Only the wrapper span
  is touched, so the status animations on the `.blob` inside are untouched.

`useFaceFlight.test.tsx` pins the arithmetic against hand-worked numbers, because a screenshot
cannot see motion: a two-agent team at a 46px mark starts its first face 4px right and 54px above
where it lands, at 24/34 of its size. It also asserts the two cases where it must *not* fire —
the first paint of a session, which is not an opening, and `prefers-reduced-motion`, which is the
one channel the stylesheet cannot withdraw for us because this is JS.

**It contradicts an interaction-motion rule and `DESIGN.md` now carries it as a named
exception.** The rule said *nothing on the paths that are walked all day* and listed team
switching; the argument for the exception, and the terms it is admitted on, are on ticket 12.

**Not verified: what it looks like.** Demo mode has one team, so there is no switch to screenshot,
and `--screenshot` cannot click. The arithmetic is tested and the source rect is identical to the
shut folder's slot by construction, but nobody has watched it move.

## Settled and built, 2026-08-30: no coordinator, and one prompt can address several agents

`.scratch/team-addressing/`, issue 02, grilled with the author in five rounds. The question was
whether a team should always have an agent whose job is to receive the user's message and hand
out the work. **It should not, in any shape**, and the reason is a chain rather than a
preference:

The ask is **fan-out** — one sentence, several agents working — not triage, which is not a
problem you have on a team you assembled yourself. Issue 03 was then answered in the same
session and decided this one: **relayed authority is capped at peer, permanently**, the way the
palette fails closed. From which a coordinator can only ever deliver *weaker* work than the same
words addressed by the user, and it buys that for three to four turns of ten, a lock at the
coordination layer, a session accumulating everything the team says, one failure that mutes the
team, and a worktree for an agent that never opens a file.

**So fan-out is multi-mention.** `@alice @bob the page double-charges` commits a row per named
agent, each carrying the user's own words with the user's own authority. Ticket 05's "a message
lands in exactly one agent's session" holds N times rather than bending once, and `spec.md`'s
out-of-scope line is amended to draw the boundary it had assumed: what is forbidden is the
*implicit* surface, and blobot never decides who a message is for or widens a list the user did
not type.

**Addressing is now the leading run of mentions**, and a mention after the first ordinary word
is a reference — so `ask @bob about @alice's branch` reaches Bob alone. That **replaces "last
valid mention wins"**, which is ticket 12's, so ticket 12 carries a second reopen. `ship it @bob`
stops working, knowingly: two rules to preserve an hours-old behaviour is worse than one rule.

`promptFromUser(agentIds, text)`: one budget reset, one read of the clock, every row committed
before any turn starts — a turn can message a teammate mid-flight, and a recipient not yet
written to would take that wake before the user's own words. The team pane groups the rows into
the one bubble that was typed, on `(text, at)`; the heuristic's failure mode needs the same
sentence dispatched twice inside one millisecond, and it is named on the ticket rather than
hidden. The field draws three states now — addressing, naming, unresolved — and the send control
reads `Alice, Bob +1`, which `DESIGN.md` records.

**Issues 03 and 04 closed with it.** 03 without the ADR it asked for, because nothing relays and
the envelope is untouched; the posture is on the ticket so nobody re-litigates it. 04 as "the ack
is the answer", which is what ticket 05 already decided and which no router now exists to
disturb. **Issue 05 is unblocked and reframed**: an agent that says "I'll ask Bob" and never
calls the tool is a peer failure that exists today, and blobot will surface it — trigger scoped
to a teammate *the user named in that prompt*, lexical and never inference, worded as an
observation, offering no button that sends the message for her. That and its mock scenario are
issue 05's own pass.

**Decided and deliberately unbuilt**: a turn that only routes should not count against
`turnBudget`, defined by what it did rather than by who did it. Nothing in this answer spends it.

Reviewed on screen with the demo prompting both agents: one bubble, `TO ALICE, BOB`, both
blobatars working off it.

**Found by the author on the first real team, and fixed the same hour.** `hermes-agent` predates
leads, so its `lead_agent_id` is NULL — which is the decided behaviour — and typing into its team
pane produced a disabled arrow and nothing else. The state announced itself only in the
placeholder, which is gone by the second keystroke, and in a tooltip nobody hovers. The composer
now says `say who with @ · or give this team a lead` whenever the field has words in it and
nowhere to send them, suppressed while the mention menu is up. It names both exits and promotes
nobody, which is the whole rule this feature turns on. The general lesson for the next state like
it: **a placeholder is not where a condition lives, because a placeholder is gone exactly when the
condition starts to matter.**

### The rail's two rows are one column, 2026-08-30

Two small things on top of the folder work, both from the author looking at the built rail.

**A team row is now the same box as an agent row**, padding included. It stood 11px taller,
which made a column of teams and their members read as two lists stacked rather than one. The
heights are equal rather than tuned to be equal: both rows are two lines of text at about 37px,
which is taller than either icon, so the icon cannot drive the height and matching the padding is
sufficient. That took the team mark from 46px to 34px, the agent face's size — which is the right
answer anyway, since the two occupy the same slot in the same column.

The folder's faces come down with it, to about 18px. That is well under the floor a blobatar
normally has, and it is the same licence as before: the floor is on *motion*, and a peeking face
does not move.

**The lead is named on the team's row** — `led by Alice`, under the team name, on the line the
running team used to leave for its status alone. The lead already decided something visible (the
composer writes to it when the user names nobody, and the send control says so), but nothing in
the rail said which agent that was.

It went on an agent's row first, as a mono `LEAD` beside the name, and that was the wrong row:
who leads is a fact about **the team**, not about the agent. The same agent leads one team and
not another, which is the same reason it does not live on an AgentProfile either. Corrected by
the author the moment it was on screen.

Named rather than drawn, by the blobatar rule: a face appears where you are identifying among
agents or choosing one, and this is a single agent being mentioned.

Only the open team can say it. `UiTeam.leadAgentId` is an Agent id and the conversation's roster
is right there to resolve it against; a backgrounded team's summary carries a *profile* id while
the members it lists are Agents, so the two do not meet without plumbing the rail does not have.
No great loss: what the lead answers is where an unaddressed message lands, which is a question
about the team you are writing to.

### The opening is three moving parts, 2026-08-30

Raised by the author against the first version of the fly-out, and both points were right.

**The roster's box now grows from nothing.** The faces glided while the teams below them *jumped*
by a whole roster's height between two frames, which is the inconsistency: half the change was
animated and the louder half was not. `height` is the one non-`transform` property in the app and
`DESIGN.md` now says so, with the reason — what has to move is everything *beneath* that box, and
nothing but its height can move that. One box, a handful of rows, once per switch.

The box is deliberately **not clipped**, which is the decision inside the decision. Clipping is
the obvious way to grow a list, and it is wrong here: the rows would be revealed from the top, and
a face flying *up* to the folder would be cut off the moment it left a box that is still short —
the one thing the whole effect depends on. So the rows are painted where they will end up from the
first frame, and what covers the overlap while the teams below slide away is:

**Each row's text fades in.** It fades rather than travels: the name and the last line were never
anywhere else, and a second thing sliding beside the face would be two gestures where the growth
and the flight are already one.

**The faces themselves mostly do not fade, and that is the interesting half of the answer.** The
ask was for the blobs to come from `opacity: 0`. A face that was peeking out of the shut folder
must not: it is on screen in frame N-1 and the travel only reads as travel because it is the same
face, so fading it in would make it *appear* rather than *move* and would undo the illusion the
FLIP exists for. But past the third there was no face — the folder said `+N` about them — so those
arrive from nothing, which is the honest thing for something that was not on screen. Tested both
ways round: the counted face fades, the peeking ones are asserted to carry no `opacity` at all.

`useFaceFlight` is now `useTeamOpening`, because it is no longer only the faces.

## Settled and built, 2026-08-30: one strip of chrome, not two

The window had a topbar across the top — the wordmark, the team's name in bold, the workspace
path, the DEMO badge, the activity toggle and the TURNS pips — and a `convhead` directly under
it saying what the open pane is. Two hairline rows of chrome, and the top one's headline fact
was the team's name, which the selected rail row was already saying larger and to the left. It
was the same second-copy the pane header itself had been trimmed for on the same day.

- **The topbar is gone from the working surface.** The empty state keeps it, because there is
  no team, no rail selection and no `convhead` there, so the wordmark and the team count have
  nowhere else to be.
- **Its controls moved into `convhead`**, at the end of the row, as a `chrome` slot App fills:
  the DEMO badge, the turn-budget continue button, the activity toggle, the TURNS pips. App
  still owns them — `Conversation` renders a node, it does not learn what a turn budget is.
- **The workspace path came with them**, on the team pane only: nothing else on screen carries
  it. An agent pane keeps saying its own branch, which is more specific.
- **The native menubar is hidden** (`Menu.setApplicationMenu(null)`). The default
  File/Edit/View/Window strip was four menus of things blobot does not do, drawn above a window
  whose own chrome is the interface.

The wordmark is not on the working surface any more. The window title still says `blobot`, and
the rail is the app's identity once you are inside it.


## Built, 2026-08-30: the OpenCode adapter (03 + 16)

The second runtime. `packages/core/src/adapters/opencode/` — `opencode acp` on stdio, the
persona as an OpenCode **agent**, ticket 14's permission posture as inline config, and the
mode re-asserted after every resume. `runtimeFor` in `apps/desktop/src/main/runtime-for.ts` is
the one place a `runtime_id` becomes a class; `startTeam` holds `AgentRuntime` and nothing
below it knows which provider an agent is. Detection's `supported` is `true` for OpenCode now,
so the picker offers it without the "no adapter yet" line.

### The shared half moved up, and it is bigger than `jsonrpc.ts`

`packages/core/src/adapters/acp/` — `jsonrpc.ts` (as the last handoff asked), plus
`child-transport.ts`, `wire.ts` and `session-updates.ts`. The last one is the surprise worth
recording: the translation from a `session/update` to an `AgentEvent` is the **protocol's**
shape, not a provider's, and OpenCode's six update kinds are a strict subset of the bridge's
eleven. Both adapters call the same function and neither needed a special case in it. What is
per-provider is what each one puts *inside* those fields, and that is handled where the
connection is owned.

The permanent rule is intact: a provider quirk still dies in its adapter. `acp/` holds nothing
either runtime could disagree about, and each adapter still declares its own `McpServerConfig`
so the day one needs a field the other cannot express, neither has to move.

### What OpenCode made blobot do differently

- **The persona is a process, not a session.** There is no ACP system-prompt field: `_meta` is
  parsed and never read. `OPENCODE_CONFIG_CONTENT` carries one primary agent whose `prompt` is
  the persona and whose key is the ACP mode id, with `default_agent` pointing at it so the
  persona is live on turn 1 rather than after a round trip. Config is snapshot-cached per
  directory for the process lifetime, so it has to be in the environment at spawn.
- **Nothing is written into the user's repository**, which is ticket 14's decision and ticket
  10's instinct. The env var is the last config layer, so it wins key by key over a repo's own
  `opencode.json` while still deep-merging with it.
- **The mode is re-asserted, not assumed.** `session/load` restores the *last used* mode from
  the message history rather than `default_agent`, so a session that ever ran as `build` comes
  back as `build`. `#applyPersonaMode` reads `configOptions[id=="mode"].currentValue` back and
  only calls `session/set_mode` when it has to. That read is also the free health check
  research 16 asked for: whether the persona is live is knowable without spending a turn.
- **The version is reported, not enforced.** The Claude bridge is a dependency blobot installs
  and pins exactly; `opencode` is the user's own binary on the user's own update schedule, and
  refusing to start a team over a patch release is blobot breaking a machine that works. The
  *protocol* version is still refused, because OpenCode does not negotiate it: a client
  claiming 99 is answered `1` with no error.
- **`authMethods` is never read as a sign-in prompt.** OpenCode advertises it even when it is
  authenticated, so the Claude adapter's "non-empty means logged out" rule would refuse every
  healthy machine.
- **No MCP pre-approval.** Ticket 14's Claude amendment does not apply here: MCP tools are not
  gated by the `bash`/`edit` keys, so `message_agent` rides the ungated path the ticket
  originally assumed on both.
- **`--pure` is deliberately not passed**, against research 03's suggestion. It runs OpenCode
  without external plugins, and this machine's global config loads an *auth* plugin: a
  determinism flag that can log the user out is not a trade blobot gets to make. The command
  menu is controlled where ADR-0003 says it belongs, in `palette.ts`.
- **The palette has no vouched built-ins.** Claude's five were chosen against a measurement of
  what a real session advertises. OpenCode's built-in commands have not been measured, and
  vouching for a name nobody has observed is guessing, so the allowlist is authored surface
  only: the workspace's `.opencode/` and the operator's `~/.config/opencode/`. The consequence
  is stated rather than hidden — on a machine with no authored commands, an OpenCode agent's
  composer menu is empty. `live.test.ts` prints what a real session advertises, which is the
  measurement that would change it.

### Verified against the real `opencode` 1.18.4, at zero token cost

Two things that needed no model turn and were run rather than assumed:

- **The persona is live on turn 1.** A real `opencode acp` handshake, `session/new` in a temp
  workspace, and `modeId` came back `alice` — the agent blobot defined, not `build`.
- **The posture resolves exactly as ticket 14 wrote it.** `opencode debug agent alice` under
  blobot's `OPENCODE_CONFIG_CONTENT` resolves 125 rules, of which the ones that matter are
  `bash * → allow`, `bash rm * → ask`, `bash git push* → ask`, `bash npm install* → ask`,
  `edit * → allow`, `read * → allow`, and `external_directory * → ask` from OpenCode's own
  defaults. This is the assertion ticket 14 said should be assertable; it is now the last case
  in `live.test.ts`.

`FakeOpencode` is the wire-level fake, built from the captured transcripts in
`research/03-transcripts/`: the `configOptions` block where the Claude bridge sends `modes`,
the `session/load` that answers with no `sessionId`, the agent-side request ids that start at
**0** in their own space, and the cancelled tool that reports `completed`.

### Not run yet, and the reason

**`live.test.ts` has never been run.** It costs tokens on the author's own credentials, and
nothing in it can be faked into being free: the persona answer, the tool call in a real
workspace, the loopback HTTP MCP server, the resume across two processes onto a *new* port, and
the mid-flight cancel are exactly the five things only a real turn can prove. Run it with
`BLOBOT_LIVE_OPENCODE=1 pnpm --filter @blobot/core exec vitest run src/adapters/opencode/live.test.ts`.

Two of those five are genuinely unknown rather than merely unproven, and both are noted in the
test: research 03 observed a **stdio** MCP server working and blobot's is **loopback HTTP**
(`mcpCapabilities` advertising `{http:true}` is not the same as it working), and OpenCode's
resume has never been exercised against a changed port and a changed bearer token, which the
Claude adapter proved for itself in research 15 §7a.

### Known gaps this leaves

- **A team of mixed runtimes has never been run.** Nothing prevents it — `runtimeFor` is per
  agent and the orchestrator holds `AgentRuntime` — but Alice on Claude and Bob on OpenCode
  messaging each other has not happened once.
- **The creation disclosure still describes only Claude's half.** Ticket 14's amendment
  removed the command list because it was OpenCode's and OpenCode was deferred. It is not
  deferred any more, so the asymmetry the ticket wrote about is real again and the disclosure
  under-promises on OpenCode: blobot *can* name commands there, and says nothing about it.
  Left alone rather than rewritten, because it is product copy and the ticket's own rule is
  that blobot claims only what is true on both.
- **A provider failure mid-turn is still unobserved**, which research 03 called its biggest
  gap. It would arrive as either a `-32603` on the prompt reply or an unexpected `stopReason`;
  the adapter handles both shapes, and neither has been seen.

## Settled and built, 2026-08-30: the rail at a dozen teams, and a navigator

The question was whether the UI is ready for more agents than fit on a screen. There is no cap
anywhere and there should not be one, but "as many as you want" is a claim about *storage*: the
pool holds three teams live (`LIVE_TEAM_LIMIT`), and a team of ten agents is ten processes and
ten worktrees. The ceiling a user actually meets is a ten-agent *team*, not a large roster.

**The rail broke first, and earliest — at eight or nine rows.** Every team is a row, the open
team expands into a row per agent, and the whole column scrolls as one, so the rows you are
actually clicking were the first below the fold.

The first answer was to pin the open group: `position:sticky` against both edges of the
scrollport, which keeps it on screen without hoisting it to the top. **Rejected by the author on
sight, the same day.** A group stuck to an edge floats over the teams above and below it, and the
rail is one list — the overlap reads as the open team sitting on top of the others rather than
among them, which is a claim about rank that nothing here means. The rule stands: nothing in this
column covers anything else in it.

What the group gets instead is `scrollIntoView({ block: 'nearest' })` when the team changes, so
switching to a team below the fold brings it into view and a team already on screen is not moved.
That is all the rail does about scale. Finding a team you cannot see is the navigator's job.

**The navigator** (`Navigator.tsx`, `ctrl+k`) is the other half: a cmdk layer over the working
surface, agents first — the open team's, then everyone else's carrying their team's name — then
teams, then *your agents* and *new team*. Choosing an agent on a team that is not open names both
the team to open and the agent to land on; App leaves the wish in a ref, because the team switch
resets the pane, and the reset honours it once the roster it names arrives.

It is reached two ways: the key, and a **Search row at the top of the rail** carrying that key as
its hint. The key alone made it a feature for whoever had been told about it. The row is a button
drawn as a field rather than a field — one search, and it lives in the navigator — and it is not
gated on team count, because a door that appears at eight teams is a door nobody finds. It sits
in the rail rather than in the activity column: the rail is the surface it stands in for, and the
activity column is the log and is hidden half the time.

Deliberately **not** a search bar in the chrome, and deliberately **names only**. Searching what
agents *said* is a different feature whose expensive half is not the query — SQLite has FTS5 —
but the click: there is no addressable message and no scroll-to, so a result would be a teaser.
That is the prerequisite whenever transcripts get long enough to lose something in.

Filtering *your agents* and the two roster pickers (`NewTeam`, `TeamEdits`) is still open. They
are flat `roster.map` lists, fine to about twenty-five, and a one-line filter each.


## Built, 2026-08-30: the model and the effort are the user's to choose

Asked for by the author while the OpenCode adapter was landing, with a screenshot of Claude
Code's own picker: one trigger reading `Medium · 1M`, one menu holding a group per axis.

**Where it lives: the hire and edit dialogs, not the running transcript.** The author chose it.
The choice is a fact about the agent, so it is stored on the AgentProfile beside the runtime and
the hue, copied onto the Agent at team creation, and applied when the team next starts.

### What each runtime actually offers, measured rather than assumed

Probed live on 2026-08-30, no model turn and therefore no tokens:

| group | Claude bridge | OpenCode 1.18.4 |
|---|---|---|
| `model` | 5: `default, opus[1m], claude-fable-5[1m], sonnet, haiku` | 34, provider-prefixed |
| `effort` | 6: `default, low, medium, high, xhigh, max` | **none** |
| `fast` | `on/off` | none |
| withheld | `mode` (ticket 14's posture), `agent` (the persona) | `mode` (the persona) |

The asymmetry is the interesting part and it is **data, not a branch**: the adapter hands the UI
a list of groups, and the same component draws three for one runtime and one for the other.

### The bug this turned up

**`_meta.claudeCode.options.model` is accepted and silently ignored.** `ClaudeAgentRuntimeOptions`
has had a `model` field since the adapter was written; passing `sonnet` at `session/new` yields a
session on `opus[1m]`. The lever that works on both runtimes is `session/set_config_option` after
the session exists, verified by setting `effort=high`, `model=haiku` and `fast=on` and reading
each back. So the dead field is gone from both adapters, along with the `model` key in
`opencodeConfigContent`, and everything routes through one mechanism.

Two things that shape the applying code, both measured: `fast=on` was **refused** while the model
was `haiku` and accepted a moment later under `sonnet`, so the model is applied first and a
refusal is reported rather than thrown; and the reply to `set_config_option` carries the whole
refreshed block, so the current values are read back rather than assumed.

### Decisions worth keeping

- **One JSON column, not a column per axis.** `runtime_options` on `agent_profiles` and `agents`
  (migration `0006`), keyed by the provider's own group ids. A schema that named `effort` would
  be blobot deciding which runtimes may exist. The `model` column that shipped with ticket 13 and
  was never once written stays in the table, dead and labelled: dropping it is a table rebuild
  for nothing.
- **Choosing the runtime's default stores nothing**, and the menu offers no `default` row even
  where the provider advertises one. An agent pinned to today's default keeps it after the
  provider moves on, and a user who picked the default picked the *behaviour*. This is also why
  the trigger shows the *resolved* answer rather than the stored one.
- **blobot never enumerates the options itself.** `describeRuntimeOptions` starts the runtime in
  a scratch directory, reads `configOptions` off `session/new`, and stops it: a second or two, a
  process, and no tokens. Both providers volunteer that block and neither answers the question
  any other way. A list of model names in our source is the command palette's problem again, and
  ADR-0003 already settled how that argument goes.
- **An edit restates them, like the role**, and they reach a team at its next start. ADR-0002
  carries the amendment, including why none of what pins the *name* and the *runtime* applies: a
  model is not half of a ref and not the identity of a session.
- **The store's credential guard was updated on purpose.** `store.test.ts` enumerates every
  column of both tables so that adding one is a decision. `runtime_options` is the only free-form
  column in the schema, and the reason it is not a hole: every value in it was read out of the
  runtime's own advertised list a moment before it was written.

### Not verified

**Nobody has clicked it.** The dialog renders under jsdom in `RuntimeOptions.test.tsx` — groups
drawn in order, the `default` badge, a choice stored, the default clearing the key — and the app
still launches and screenshots. But the screenshot harness cannot open a modal, so the control
has never been *seen*. Same gap as delete and save, and it wants the same fix.

**No agent has yet run at a chosen setting.** Everything from the picker to
`session/set_config_option` is covered against the wire fakes and the option lists came off the
real binaries, but the round trip ends at "the session says it is on `max`" rather than at an
answer that took longer to think.

## Built, 2026-08-30: the context gauge, the ending that says why, and a column that survives

The author asked what stops a session growing until the agent hallucinates and costs more, and
where they could see it. `.scratch/transcript-scale/` gained an amendment and three resolved
tickets (04, 05, 06). The rule did not move: **blobot does not manage the agent's context.**
What moved is that it stopped hiding what it already receives.

**The gauge was already end to end and thrown away at the last step.** `usage_update` reaches the
vocabulary as `usage_updated`, is persisted by `SqliteRecorder`, and was dropped by `model.ts`
under the comment "usage has no gauge yet". It is now a `CONTEXT` block at the head of the
activity column: face, name, `used/size`, percent, one row per agent, seeded from
`SqliteStore.lastUsageOfTeam` so a relaunch or a switch does not blank it. Both numbers, because
the two runtimes' windows differ by five times. No bar, no colour, no threshold, no advice.

**The `used: 0` reset is suppressed in two places**, the renderer and the store, because a
cancelled turn's zero is persisted like any other reading. It is taken only from an agent that
has never reported, where it is true.

**Line 857 of this file is now true.** The palette kept `/compact` on the argument that "the
context gauge is on screen; withholding the remedy while showing the problem is the worse trade".
It was not on screen when that was written. It is, as of today, and `/compact` remains the whole
of the remedy: nothing fires it and nothing suggests it.

**`turn stopped · max tokens` became `turn stopped · the context window is full`**, through one
exported `stoppedBecause`, with lines for `max_turn_requests`, `refusal` and `cancelled` down the
same path. A test asserts none of them offers a remedy. The instrument is a new mock scenario,
`runs-out-of-room`, which is also a demo run (`--demo-scenario=out-of-room`): the gauge at 100%
and the transcript saying why are only worth anything together.

**The bug the author found while it was being built.** Switching teams lost the activity column,
and the first screenshot of the new scenario showed the answer stopping mid-sentence with nothing
under it. Both the column and the `turn stopped` line were live-only, and `snapshot` sets
`feed: []` on purpose. `SqliteStore.logOfTeam` now carries finished tool calls and finished turns
in the snapshot, windowed together by time, and the pane formats a restored entry through the
same code as a live one so the two cannot drift. A restored tool line deliberately never prints
`(exit null)`: the column stores a null both for a cancelled tool and for a tool that never had
an exit code, so printing it would be a guess.

### The screenshot harness's blank frames are not a flake

This file has called it "the known one-in-three capture flake". On this machine today it was
every capture, four in a row, a blank 7.7 KB frame at four different delays. **`--disable-gpu`
fixes it**, first try, every try since:

```sh
apps/desktop/node_modules/.bin/electron apps/desktop --no-sandbox --disable-gpu \
  --demo --screenshot=/tmp/ui.png --screenshot-at=9000
```

### Then: what blobot itself injects, bounded (ticket 07)

The author's follow-up, same day: bound what blobot puts into a turn, and show it. It turned up
a rule that was a sentence in a file. `CLAUDE.md` says agent-to-agent communication is
"never a full context copy between agents, always compact context", and **nothing enforced it**:
`message_agent`'s schema called `context` a one-line description and checked nothing, and the
body had no bound at all, so one agent could paste its whole transcript into a teammate's window
and blobot would carry it, commit it and replay it on every relaunch.

`packages/core/src/orchestrator/bounds.ts` holds the three numbers with the reasoning beside
them: **4,000 characters** a message, **500** a context line, **5** messages a wake.

- **Over the bound is refused, not truncated**, before the commit, so a refused message does not
  exist: no row, nobody woken. The sender reads the reason as a *tool failure*, stays alive and
  writes the short version. Truncating would hand the recipient half a request with no way to
  know what the other half said. The limit is also in the tool's schema and description, so a
  sender does not spend a call finding out.
- **The wake batch is capped and the overflow requeued.** Nothing is dropped, and no new path
  was needed: `#runTurn` already ends by waking the agent for whatever arrived mid-turn.
- **`injectionOf` plus `lastPersonaOf` feed a breakdown under the gauge**, opened by clicking a
  row: persona, the operator's standing instructions inside it, the last wake prompt and its
  message count, and what is queued. **Estimated tokens**, four characters to one, with a tilde
  and a line saying the gauge above is the runtime's own count. They are never added together.
- **It opens in place, not over the log.** The author asked for a popover; an inline disclosure
  is the app's existing idiom for the gesture, keeps the rail's rule that nothing in a column
  covers anything else in it, and needs no focus trap. Inset like a rail row (`margin:0 6px`,
  `8px` padding) after the author compared it to the rail: a band touching both edges read as a
  section of the column rather than as one row in it.

The persona and the standing instructions are measured and **not** bounded. They are written by
a person and sent once per session; a limit on what the user may tell their own agent is a
different decision.

### The question that came out of it: what about injected MCP

`.scratch/transcript-scale/issues/08-the-mcp-surface-nobody-counted.md`, open and **not
decided**. blobot's own contribution is now measured and is nothing: `MESSAGE_AGENT_TOOL` is
**956 characters, about 240 tokens**, on the wire every turn, and it is a row in the panel.

What an agent *inherits* is the opposite. ADR-0003's amendment loads `user`, `project` and
`local` scopes, so every MCP server the operator or the repository configures puts its full tool
schemas into every turn. **Nothing filters them and nothing counts them** — the same vector the
command palette was built to fail closed against, with none of the defence, and larger: the
Claude Code session that wrote this reports **197 MCP tools at 272.8k tokens**, which is more
than OpenCode's entire 200k window.

blobot also **cannot see the list**: ACP advertises commands, not tools, which is why the
palette was buildable and this is not. The panel's note says so rather than implying the
breakdown is complete.

The lever probably exists — the pinned SDK's `strictMcpConfig` ignores every MCP config but the
one passed in, `_meta.claudeCode.options` is spread wholesale by the bridge, and blobot's own
server is merged in regardless so it would survive. Unverified, and `model` was accepted and
ignored down that same path. Flipping it is **ADR-0003's decision, not a ticket's**: it removes
capability, not just context, and the first symptom would be an agent failing at something it
did yesterday.

### Not done

- **`costUsd` is carried and drawn nowhere.** It rides the same event, only Claude sends it, and
  it is a running total rather than an occupancy. Putting a dollar figure beside a percentage is
  a billing decision nobody has made.
- **No threshold.** An agent at 95% says 95% and nothing else. Whether a backgrounded team's
  near-full agent should reach the user the way `waiting` does is a product question, and the
  three-channel status vocabulary is where it would have to be answered.
- **The bounds have never met a real agent.** Every test of them is against the mock. Nobody has
  yet watched a live Claude read the refusal and write the short version, which is the whole
  claim: that a refusal at the tool boundary teaches the sender where a truncation would not.

## Built, 2026-08-30: a long menu grows a field

A runtime is free to advertise forty models, and *how it answers* was one flat menu of every one
of them. Past about a dozen rows a menu stops being something you scan, so past a dozen rows it
now has a filter at the top.

**The threshold is the decision, not the field.** Twelve choices across all groups. Under it the
menu is exactly what it was, because a field the user pays for on every hire and needs on one
runtime is the search bar `DESIGN.md` refuses in the chrome, moved inside a popover. The query
dies when the menu closes: it narrows what is already on screen and holds nothing.

**The list is now cmdk's, and Radix keeps the popover.** This is the standard's own division: a
menu you type into is a combobox, and every Radix menu moves *real* focus onto the row under the
pointer, which takes the field away mid-word. The rows are `option`s rather than `menuitemradio`s
as a result, and the group is a heading rather than a radio group. The tick and the `default`
badge are unchanged, and the menu still borrows `.selectmenu` and `.selectitem`.

**Focus is moved from `onOpenAutoFocus`, and that is load-bearing.** Moving it later from an
effect was tried first and does not survive: this menu opens inside the hire dialog, and focus
arriving after both layers have settled reads to the dialog's focus scope as focus escaping, so
the menu closes on its own about a second after opening. `onOpenAutoFocus` is `Menu.Content`'s
own prop, spread straight through by `DropdownMenu.Content` but missing from the types it
re-exports, so it goes in through a small typed object with the reason written next to it.

**Matching is substring, on the label and the value together, every token.** `GPT-5.4` is what
the menu says and `openai/gpt-5.4` is what the changelog said, and a fuzzy score on a name that
dense with digits returns most of the list for `4.5`. A group the query empties is dropped rather
than left as a heading over nothing, and the count beside the field says `11 of 22`.

The menu opens on the row the agent is already set to (`defaultValue`, uncontrolled from there,
so cmdk moves the highlight to the first match as the query narrows). Before this it opened
wherever cmdk's first row happened to be, which on a list of forty is nowhere useful.

### Verified

Fourteen tests in `RuntimeOptions.test.tsx`, and **it has now been seen**, which closes the gap
this file opened when the picker was built: the hire dialog forced open, twenty-two fake models
behind it, screenshot at 20s. The field, the count, the heading, the badge and the tick all draw,
the menu opens scrolled to the chosen row, and a second capture that renders `document.
activeElement` in place of the count says **FIELD** a second and a half after opening, inside the
dialog. Both captures needed the late delay; `--disable-gpu` is the documented fix for the blank
frame and would have been faster.

### Not done

- **Nobody has typed into it in the real app.** The filtering is covered under jsdom, and the
  field is focused in the real one, but the two facts have not been joined by a keystroke.
- **The threshold is a guess with a reason, not a measurement.** Twelve is where a menu stops
  being scannable in this type at this row height, by eye.
- **Claude advertises 4 models on this machine and OpenCode advertises 34**, both read out of
  the app's own cache file, so the field is real on OpenCode and will not appear on Claude. The
  22-model list used to review the layout was fake.

## Built, 2026-08-30: what a runtime offers is remembered across launches

Filling the picker means spawning the CLI, reading the `configOptions` it volunteers and
stopping it. That is **931 ms of the user's time, measured against the real `claude` today**,
and it was being paid on every launch and thrown away with the process. The answer is now
written beside the database as `runtime-options.json`, and a second launch answers in **0 ms**.

**The keys are the executable and the version, not a timer.** A model list moves when the user
upgrades the binary, so `2.1.251` is part of what makes the remembered answer true, and it is
the same fact the dialog is already stating under the runtime picker. A different binary answers
for itself. Age is only the third check and it is stale-while-revalidate: past a day the
remembered list is drawn *now* and the spawn happens behind it, changing nothing until the next
open. A menu that stalls to be current is the thing this exists to stop.

**A failure is still never kept**, which was already the rule in memory and is now also the rule
on disk: a CLI that is not installed yet or is signed out is this machine's weather, and
remembering it would hand the next launch a wrong reason instantly. Written through a temporary
file and renamed, because two windows can ask at once and a half-written JSON file is a cache
that never hits again. One entry per runtime, replaced outright.

Nothing here is authoritative, and it does not have to be: `applyOptionChoices` already skips a
stored option the live session does not advertise and says so in the transcript. A remembered
list going stale costs a line, never a launch.

`RuntimeOptionsCache` takes its probe, its clock and its file, so seven tests in
`runtime-options.test.ts` cover it without spawning anything, and the 931 ms → 0 ms figure came
from driving the real class against the real `claude` through `tsx`.

**And the picker still waited, because the probe was never the whole bill.** The handler awaited
`detectRuntimes()` first, which locates each binary, reads its version and probes its login:
**1.5 seconds, measured, on every call**, and five handlers were calling it. It is now asked once
per launch (`known-runtimes.ts`) and started behind the window rather than in front of the first
dialog, so by the time anyone opens one the answer is usually already there.

**Detection is never persisted, and that is the difference between the two caches.** A remembered
option list is a claim about a binary and is keyed by that binary's version. A remembered
*readiness* would be a claim about right now: a tick saying *signed in* about a CLI that has since
been logged out is precisely the confident false answer ticket 11 refuses. So it is a
process-lifetime memo, refreshed by the one surface that draws it, which is also the moment the
user has gone away and installed something.

**The dialog no longer claims a runtime offers nothing before one is picked.** With detection out,
`runtimeId` is `''` for a beat, and *how it answers* was reading `nothing to choose on this
runtime` about a runtime nobody had been asked about. It says `pick a runtime first`.

### Verified

Both numbers are measured against the real binaries on this machine, and the settled dialog was
photographed: `Opus (1M context) · Medium · Off` under HOW IT ANSWERS, with no *asking what it
offers…* in front of it. The cache file the running app wrote is in `userData` and holds
claude-code at `2.1.251` (4 models, 5 efforts, 2 fast) and opencode at `1.18.4` (34 models).

### Not done

- **The refresh is silent.** A menu open at the moment a stale-while-revalidate probe lands
  keeps the old list until it is reopened. Repainting under the user's cursor is worse.
- **The first hire on a fresh install still waits**, for detection and then for one probe. Both
  are now paid once per machine rather than once per launch.
- **Detection is refreshed only by the runtime picker.** A CLI installed while a dialog is
  already open is not noticed until something reopens.


## Built, 2026-08-30: a team has an icon, and a team can be given a folder

Three asks from the author, in one pass: a team icon the user can upload, an icon detected from
the Workspace, and a folder for the user who does not want to go and find one. They are ranked
here in the reverse order they were asked, because the third is the one that removes a barrier
and the first two are the ones that could have broken a rule.

### The folder blobot makes

`prepareWorkspace(root, teamName)` in `packages/core/src/workspace/prepare.ts` makes
`~/blobot/<team-slug>`, `git init -b main`, and **one empty commit**. The commit is the whole
point rather than a detail: a `plain` Workspace gives each agent a copy with no branch, no diff
and no recovery, and a repository with nothing committed is the one state the flow genuinely
refuses. One empty commit costs a millisecond and makes the free default a Workspace with every
guarantee the picked-it-yourself path has.

It supplies `user.name`/`user.email` **only when the machine has none**, because `-c` overrides
rather than defaults and rewriting somebody's authorship for them is worse than failing. A
folder that already exists with anything in it is **refused, never adopted**: the user asked for
a new folder, and silently pointing autonomous processes at files they did not choose is the one
outcome this must not have. An existing empty folder is used.

**The creation flow's steps swapped**: the name is 01 and the folder is 02, because blobot names
the folder after the team. Picking a folder still fills an empty name in, so the user who has a
repository in mind loses nothing. `DESIGN.md` carries the reason.

### The icon

Stored as a **`data:` URL in one new column on `teams`**, not as a path and not as a file in
`userData`. The folder an icon came out of is a thing the user can move, and a team whose mark
vanished with its folder would be the bug the launch reconcile exists to report. It is a PNG
downscaled to 128px in `apps/desktop/src/main/team-icon.ts`, a few kilobytes, which is cheaper
than an asset directory with its own lifecycle to get wrong.

**It goes on the folder, never instead of it.** The faces answer who is on the team; the icon
answers which project, and the mark is also the body that animates the folded team status. The
first version drew it *contained* inside the front panel, which is the tidier idea and does not
survive the rail: at 34px that panel is about ten pixels tall and the icon read as a smudge. It
is a **sticker on the lower-left corner, over the front panel's bottom edge**, greyed —
grayscale rather than a silhouette mask, because luminance is most of what makes a logo readable
that small. Seen in the real app before this was written.

`findWorkspaceIcon` is **one walk of the tree, four levels deep, ranking every candidate it
passes** — not a list of paths it hopes exist. It took two rewrites to get there, and the reason
is worth keeping: probing the top level alone found nothing in a real repository of the author's,
where the icon lives at `apps/contapp-web/public/favicon.png`; probing one level into `apps/`
found that and would still have missed `apps/web/frontend/public/favicon.png`, which is the same
shape with one more floor. **There is no list of paths that ends**, so the search stopped being
a list.

The ranking is four ordered questions, each worth ten of the next. *Which directory* dominates,
so a `public/` anywhere beats a `docs/` at the top. Then *how deep*, so a repository that put an
icon at its own root outranks one belonging to an application inside it. Then *whether a folder
on the way is named after the repository*: `contapp-web/apps/contapp-web` is the front of the
house and the repository has said so, where alphabetical order picks `contapp-pos`. Then the
file's own name, `apple-touch-icon` down to `favicon`. Names match exactly — a repository full of
`logo-white.png` and `logo-dark-text.png` has not said which one is the mark.

`node_modules`, the build outputs and test trees are skipped, and that one list buys two things:
it is what makes the walk cheap, and those trees are also full of *other people's* marks. A
favicon out of a dependency's fixtures is exactly the wrong suggestion.

**Raster only**, which is not a limitation but the point: these are files out of a repository blobot did not write, rendered in
the app's own window, and `nativeImage` decoding nothing else keeps markup-that-is-also-a-document
out of the renderer. A project with only an SVG logo simply has no suggestion, which is a fine
answer.

**Never silent.** The flow shows the mark as it will actually be, names the file it came from,
and offers *choose an image…* and *no icon*. An icon that appears out of nowhere and is subtly
wrong is worse than none, because nothing on screen explains it. `EditTeam` offers the same
control, and re-runs detection for a team that has no icon — which is how every team formed
before this gets one without being recreated. Setting an icon restarts nothing.

### Verified

- `prepare.test.ts` (15) against the real filesystem and the real `git`: the kind, the commit,
  the slug, the no-identity machine, the refusal, the empty-folder case, the icon ranking
  including the SVG that is not offered, and five nesting cases — the monorepo, four levels
  down, the name match, top-level precedence, and the dependency whose icon is not offered.
- The search timed against real trees on this machine. 3ms for the author's monorepo
  (`apps/contapp-web/public/favicon.png`), 1ms for blobot, which correctly has none, and
  **148ms for the whole of `~/Projects`**, which is the worst case a `nested` Workspace can be
  and is already a path that spends seconds inspecting repositories.
- One test in `store.test.ts` for the round trip and for taking an icon off again.
- One in `Rail.test.tsx`: a row wears the icon **and** keeps its two faces, and a team without
  one draws no placeholder.
- The rail, in the real app, with an icon on the demo team (a temporary hack, reverted).

### Not done

- **A `nested` Workspace gets an arbitrary sibling's icon.** A folder of *repositories* is
  walked like any other, so pointing at `~/Projects` suggests the mark of whichever project
  ranks highest — which the flow names and the user can reject, but nobody chose it. Which
  sibling repository speaks for a team spanning twenty of them is a different question from the
  monorepo one, and it has not been asked.
- **An icon more than four levels down is invisible**, which is the same kind of stated limit
  `inspect.ts` has at two. Unbounded descent is how a folder picker starts taking seconds.
- **No test drives `chooseTeamIcon` or `encodeTeamIcon`.** Both need Electron's `nativeImage` and
  the OS file dialog. The refusal path is written and has not been exercised.
- **Nothing bounds how many icons a database holds.** A few KB per team, so a hundred teams is a
  few hundred KB, which is nothing — but it is unbounded by construction rather than by check.

## Built, 2026-08-30: a full clean, priced before it is chosen

Deleting a team removed the AgentWorkspaces the careful way and always had: `git branch -d`, so
a branch with unmerged commits was kept and named, and a copied workspace was kept always
because nothing can ask a directory whether it holds anything. The cost was never said out loud:
**the leftovers are unbounded and nothing in the app ever mentions one again.** A user who forms
and deletes ten teams out of the same repository has ten worktree checkouts and any number of
`blobot/<team>/<agent>` branches, and the only way to find out is `du`.

So the delete dialog now carries one tick, **full clean**, with the number attached:
`recovers about 3.1 GB · alice 2.9 GB · bob 180 MB`.

### The seam, and why it is two methods rather than a flag

`WorkspaceProvider` grew `purge` and `measure` beside `remove`. `purge` is a separate method on
purpose: `remove` is the safe default and **cannot become the destructive one by a caller passing
the wrong boolean**. Each provider answers for its own mechanism.

- **git** — `purgeWorktree` runs `branch -d` first and only reaches `-D` if that refused, so the
  forceful command is only ever run on a branch that really did still hold something.
- **plain** — the one place blobot deletes a copy. It does not contradict the rule that put
  `kept` there (never put unrecoverable loss behind a dialog people click through), because this
  is not behind a dialog people click through: it is a tick, off by default, with the size on it.
- **nested** — every repository's branch, then the mirrored tree itself, which is also the only
  way the copied loose files ever go.

`measure` is a plain walk of the directory (`workspace/size.ts`), apparent sizes, symlinks
counted as links and never followed. It is deliberately *about*: hard links are counted once per
name, which can overstate a worktree. A number rounded to a unit is what the user acts on.

### What the UI does with it

- Measured **as the dialog opens**, not when the tick is clicked: the size is the reason to tick
  it, so it has to be on screen before the decision.
- Ticking it **rewrites the paragraph above it** rather than adding a warning under it. The
  dialog's first sentence is the promise, so the promise is what changes: "work that was never
  merged goes with it. Nothing here is recoverable, by blobot or by git."
- The primary button becomes `delete and clean`, so the last thing read before the click says
  which of the two actions is about to run.
- Afterwards the dialog reports what was **actually** recovered, measured as the clean ran. The
  figure on the button was an estimate of a directory two agents were still writing to.
- The tick is drawn as a `.rosterrow`, which is the tick this app already has. A second kind of
  checkbox would be saying it is a different kind of thing.

### Verified

- `git-worktrees.test.ts` (2 new): a purge deletes a branch holding a commit that `remove` would
  have kept, and `measure` answers 0 for a workspace that is gone.
- `non-git-workspaces.test.ts` (2 new): the copy and **its marker** go, so the same agent starts
  again rather than reporting the copy it no longer has as lost work; and the mirrored tree takes
  every branch and the tree.
- `team-store.test.ts` (4 new): a clean reaches `purge` and never `remove`, an ordinary delete
  reaches `remove` and **measures nothing**, `freedBytes` is the sum measured before the removal,
  and `measureTeam` changes nothing.
- On screen with `--screen=delete-team`, which is new and exists for the same reason `--screen=agents`
  does: a dialog the screenshot harness cannot click its way to.

### Not done

- **The transcript is not part of a full clean.** It stays in the database, deliberately, and the
  dialog still says so. What these agents were told is a record; disk is not the reason to lose it.
- **Nothing measures the leftovers of teams already deleted.** This clean is offered while the
  team still exists. Worktrees and branches left behind by every delete before today are still
  only findable with `du`, and a rescue that scans the worktree root is its own effort.
- **The estimate is not live.** It is read once as the dialog opens; an agent writing during the
  seconds it is open makes the figure stale. The reported result is the honest one.

## Built, 2026-08-30: a runtime that is not ready, handled rather than reported

Ticket 11 gave the picker four honest states and no door out of any of them. *Not installed* was
a sentence, and the reader's next move was to go and find the vendor's documentation. The author
asked for the door, and was specific about its shape: **spawn the CLI and run its own interactive
sign-in, let it open a browser, let the user come back**; and installing is fine if the user
confirms it. `.scratch/runtime-readiness/spec.md` carries the decisions and the wording.

### blobot does not sign anybody in

It runs `claude auth login` or `opencode auth login` on a pseudo-terminal in a modal and gets out
of the way. Keystrokes go from the pane to that process and bytes come back, and **nothing on the
way through is read, parsed or logged**. That is the no-credential-storage rule kept by *not
participating* rather than by refusing to help, and it is the only shape in which blobot can be
useful here at all.

- **A PTY, not a pipe** (`main/runtime-step.ts`). Both commands are written for a person: on a
  pipe the CLI sees no TTY, drops to a non-interactive path, and either fails or waits forever
  with nothing on screen. `node-pty` is N-API now, so the prebuilt module loads in Electron 44
  unmodified; it is in the root's `onlyBuiltDependencies` because Linux has no prebuild and
  builds from source.
- **One at a time.** Starting a second ends the first, which is what closing the pane already
  does. A step that was replaced or killed is **silent on the way out**: its pane is gone, and an
  exit reported for it would land on the screen the next one is drawing.
- **The environment is the app's minus two lies**: `ELECTRON_RUN_AS_NODE` and
  `BLOBOT_CLAUDE_BRIDGE` are facts about *this* process, and the child has no business inheriting
  either. `cwd` is the user's home: neither command is about a repository, and an installer run
  inside somebody's project is a surprise.

### The command is core's, and the renderer never holds one

`detect/remedies.ts` is a table keyed by `runtimeId`, and `remedyFor` resolves it against
detection **as it stands right now**. The renderer sends two ids and gets back `{shown, note}` to
print. No string a user can reach becomes part of an argv, and a stale renderer cannot ask to
sign in to something that is no longer installed. `remediesFor` offers at most one thing:
`not_installed` gets the install, `needs_sign_in` and `unknown` get the login, `ready` gets
nothing, and Windows gets nothing at all — by absence rather than by a button that fails, because
no research covers it and neither install command is a Windows one.

Installing runs the vendor's own published command, quoted in full and confirmed first
(`curl -fsSL https://claude.ai/install.sh | bash`, `curl -fsSL https://opencode.ai/install | bash`;
both verified live returning 200 on 2026-08-30). Running something else would install a build the
vendor does not support, somewhere its own updater will not find. Both land in `~/.local/bin`,
already in the cascade detection searches, so a fresh install is found without a restart.

### Nothing concludes from an exit code

An installer can exit 0 having put a binary where nothing looks, and a login can be abandoned in
a browser tab with the command exiting cleanly. So the ending is `refreshKnownRuntimes()`, and
the line the screen closes on is the picker's own four words. It never says *signed in*.

### The one thing that is now refused at launch

`refuseMissingRuntimes` in `start-team.ts` stops a team whose agent's runtime is `not_installed`,
naming the runtime and the agents that need it. **This is not ticket 11's gate reopened.** That
rule is about not standing between the user and *trying*, and it still holds for `needs_sign_in`:
that probe's positive was never proof, so a signed-out runtime still starts and says so itself.
`not_installed` is the one state that is not a guess — there is no binary, the spawn fails
either way, and the only question was whether the user read `spawn opencode ENOENT`.

### The governing rule survives a terminal

xterm gets a monochrome sixteen-colour palette (`MONOCHROME_ANSI`), two luminance tiers rather
than one flat grey. Left alone it put OpenCode's greens and cyans on screen beside the blobatars,
which is the one thing `DESIGN.md` forbids outright, and the transcript already holds the same
line by rendering markdown with no syntax colour. Nothing legible is lost: the provider list
marks its selection with a filled circle against empty ones, and the dim/bold/inverse channels
carry the rest. `DESIGN.md` has the consequence, the screen and the wording rule.

Escape and an outside click belong to the terminal while a command runs, since these are TUIs and
a key the program is waiting on must not close the window. The way out says `stop and close`.

### The bug that got through, and the shape that fixes it

First run in `pnpm dev` it hung: the login printed `┌ Add credential` and then nothing, forever,
with the footer still offering `stop and close`. **React runs an effect twice in development** —
mount, clean up, mount again — and this effect owns a process. The first mount's cleanup called
an unaddressed `closeRuntimeStep()`, which landed *after* the second mount had started its own
process and killed the survivor. It was invisible in every screenshot because `electron-vite
build` ships React's production build, where the double invoke does not happen: **the harness
could not see it, and dev could not miss it.**

The fix is not to fight the double invoke. **Every step call now names the session it means**: the
pane mints a `stepId` with `crypto.randomUUID()`, sends it with start, input, resize and close,
and both streams are filtered by it on the way back. A stop that names a session which is no
longer live does nothing, so whichever order the two land in, each acts on the session it meant.
The id carries no authority — the argv is still core's — and the cleanup no longer has to await
the start it is undoing.

That silence was the second half of the bug: `stopStep` deliberately reports no exit, because a
pane that has gone away should not conclude. Correct on its own, and it is what turned a killed
process into a screen that never changed. Both halves are covered now.

### The second one: a bridge older than the window

The next run said **"blobot does not know that runtime."** It was not a detection bug. `stepId`
had just been added as the *first* of three positional arguments, and a preload only reloads when
the app restarts, so the window was sending three and the bridge under it was still sending two:
`opencode` arrived as the step id and `sign_in` as the runtime id, and main went looking for a
runtime by that name. Three strings in a row are a shape a stale bridge can still satisfy.

So `startRuntimeStep` takes **one named object**, checked on arrival (`asStepRequest`), and a
version skew now says it is one and names the fix. The check earns its place twice over: `kind`
is the only thing the renderer is trusted with, and it is now validated against the two words
core will answer to rather than passed through.

### What the author cut, once it worked

The dialog had a header: an eyebrow, `OpenCode` in the hand face, the command, and a line of
prose, stacked above a program whose own first line is `┌ Add credential` followed by what it
wants. **The terminal is the dialog.** The header is gone, the title survives for a screen
reader only, and the sheet is now a frame around the pane rather than a page with a pane on it.
The command line survives in one place, the **install confirm**, because that is consent and the
terminal has not run yet.

Two things a terminal is expected to do, added with it: a printed URL is **clickable**
(`WebLinksAddon`, opened through `shell.openExternal` in main, `http` and `https` only, because
that text came out of another program's stdout), and a selection copies with **`ctrl+shift+c`**,
never `ctrl+c`, which in a terminal is how you interrupt what is running.

### The bug the feature exposed, which was older than the feature

The author signed in to OpenCode through the new terminal, the login printed `Done`, and
detection still said **no credential on this machine**. Not a bug in any of this: ticket 11's
`parseOpencodeAuthList` had been answering `false` for **every input since it was written**.

`opencode auth list` draws its output in a box, `┌  Credentials …` / `●  GitHub Copilot oauth` /
`└  4 credentials`, and the parser tested for a heading at `^credentials`, which never matched.
The research recorded the section names and not the glyphs in front of them. It **failed closed**,
so on the machine it was written on — genuinely signed out — it was right, and it stayed right
until blobot could sign somebody in and check its own work.

Fixed by stripping the frame before reading, and by treating the closing `N credentials` as an
answer in its own right, so an unanticipated shape reads as "not understood" rather than as
"signed out". The test carries the real bytes now, copied out of the terminal. Ticket 11 has an
amendment, with the rule it suggests: **a parser over a human-facing CLI wants a captured sample,
not prose about one.**

Worth saying plainly: this is the second time in one feature that the thing which hid a defect was
the harness agreeing with the code. A screenshot could not see a development-only React
behaviour, and a probe that fails closed cannot be told from a machine that is signed out.

### Verified

- `detect/remedies.test.ts` (9): the login uses the binary the cascade found rather than the
  name, `ready` offers nothing, Windows offers nothing, an unsupported runtime offers nothing.
- `detect/runtimes.test.ts` (2 new): the boxed output `opencode` 1.18.4 really prints reads as
  credentials present, and a box closing on `0 credentials` reads as none.
- `main/runtime-step.test.ts` (8), against a **real pseudo-terminal**: the command gets a TTY,
  typing reaches it, the exit code comes back, a replaced step is silent, a killed one is silent,
  a stop naming a dead session leaves the live one alone, and a replaced pane's keystrokes and
  resizes reach nothing.
- `components/RuntimeSetup.test.tsx` (5): the button sits beside the state it answers, a ready
  runtime gets none, the picker is not disabled, and the install confirm runs nothing until it
  is told to and then sends only the two ids.
- **Live, on screen, in the app**: the real `opencode auth login` drawing its provider select,
  its search field and its arrow-key hints inside the dialog. `--screen=hire` is new, and exists
  for the same reason `--screen=agents` does: a dialog the harness cannot click its way to.

### Not done

- **`claude auth login` was never run live.** Its flags were read off `--help` on this machine and
  the subcommand contract matches OpenCode's, but running it would have started a real login and
  opened a browser on the author's machine. This is the obvious first thing for the next session
  with a spare account.
- **No remedy on a runtime that is `ready`**, so switching accounts is not reachable from here.
- **Nothing is offered from the failed-launch line.** The refusal names the runtime and points at
  the agents screen; it does not carry the button, because that line is drawn from a string and
  would need the runtime id threaded through the open error to do better.
- **macOS and Windows**, as ever. The PTY environment and the install scripts have been run on
  neither.
- **The screenshot harness reviews a production build**, so nothing it captures can catch a
  development-only React behaviour. The lesson from the hang above: a surface whose effect owns a
  process wants a `pnpm dev` pass as well as a screenshot.

## Built, 2026-08-30: the composer takes a paragraph

Raised by the author from a screenshot: a long prompt scrolled sideways out of the field as it
was typed. The composer was an `<input>`, which cannot wrap, under a `white-space:pre` highlight
layer that could not have wrapped either. Nothing was broken; multiline was never built.

It is a `<textarea rows={1}>` now, and it grows with the words up to six lines, then scrolls.

**No measuring, no resize observer.** The highlight layer is the one in the flow, so its wrapped
height *is* the field's height; `.mirror` is whatever `.hl` came out to be, and the textarea is
absolutely positioned over the whole of it. The two must wrap identically or the caret drifts
off the glyphs — same font, same width, no padding or border on either, `pre-wrap` and
`break-word` on both, because `break-word` is what a textarea does by default. The scroll box is
a separate element outside cmdk's positioning context, since `overflow` on `.mentionwrap` would
have clipped the mention menu that hangs above it.

Three consequences on screen: the pill is `align-items:flex-end`, so the send stays where the
hand left it and the last line typed is the one beside it; `.mentionwrap` carries 5px of padding,
so one line is still centred against the 32px send and the pill is the height it always was
until a second line arrives; and a trailing zero-width space gives a line ending in `\n` a line
box, so the caret on an empty last line sits over text rather than over the border.

**Enter still sends, shift+Enter opens a line** — and the two keys leave by different doors.
Send *prevents*, which is how the input claims a key from cmdk. A new line has to be left to the
browser, and cmdk's root cancels Enter whether or not shift is down and whether or not a menu is
showing, so shift+Enter *stops propagation* instead: cmdk never sees it and the textarea does
what a textarea does. Preventing there typed `first linesecond line`, which is not something
jsdom can show you — it was found by driving the running app with real key events through
`webContents.sendInputEvent`, and the test pins it on `defaultPrevented` after the event has
finished travelling.

### Verified

- `components/Composer.test.tsx` (8, up from 7): shift+Enter sends nothing and cancels nothing,
  Enter sends and cancels. The assertion was checked against the bug — it fails without the
  `stopPropagation`. The seven existing claims moved from `HTMLInputElement` to
  `HTMLTextAreaElement` and are unchanged.
- **On screen**, with the author's own sentence: two lines wrapped in a grown pill, and a twelve
  sentence draft capped at six lines and scrolled to the caret. The capture flake is unchanged —
  three blank frames before one landed at `--screenshot-at=9000`.

### Not done

- **The scroll box has no fade or edge**, so at six lines the text is simply cut by the pill's
  top. Nothing says there is more above except the scrollbar.

## Built, 2026-08-30: blobot vouches for the ordinary work on Claude too

Raised by the author from a screenshot: an agent stopped to ask permission to `Write
src/components/desk/desk-items.ts`, a file **inside its own worktree**, on its own branch.

The cause was ticket 14 taking `default` mode's own description at its word. The bridge calls it
*"Standard behavior, prompts for dangerous operations"*; what it does is prompt on every `Edit`,
every `Write` and every un-preapproved `Bash`, at any path. So a Claude agent asked about work
that ticket 14 had explicitly decided should not be asked about, and `waiting` — ticket 09's one
contrast inversion — became the normal state on one of the two runtimes. The same ticket had
rejected exactly that posture for OpenCode, in writing, and then arrived at it by accident here.

**Ticket 14 is reopened with a 2026-08-30 amendment**, and its *"Claude Code is not ours to
configure"* is narrowed. That sentence generalised from the three options the bridge discards
(`permissionMode`, `canUseTool`, `allowDangerouslySkipPermissions`). It passes `allowedTools`
through untouched, and this repo has depended on that since ticket 15, where `preApprovedTools`
pre-approves `mcp__blobot` by the same route.

`adapters/claude/permissions.ts` is the counterpart to OpenCode's `PERMISSION_POSTURE`:
`Edit`, `Write`, `MultiEdit` and `NotebookEdit` unconditionally, plus a closed list of
`Bash(<prefix>:*)` rules for inspection, local git, the test and build runners, and ordinary file
moves. It joins the mailbox entry in the one `allowedTools` array. The mode stays `default`;
nothing about `auto`, `acceptEdits`, `dontAsk` or `bypassPermissions` moves, and `mode` stays out
of `SURFACED_OPTIONS`.

### Why not the settings file, which was the first answer

Seeding `<workspace>/.claude/settings.local.json` would have worked — the bridge reads `local`
scope, and it is where **allow always** already writes. It was rejected because an AgentWorkspace
is a checkout of the user's repository on a blobot branch: a file blobot leaves there can be
staged, committed and merged home. Ticket 16 kept *blobot writes nothing into the user's
repository* on the other runtime by moving to `OPENCODE_CONFIG_CONTENT`; `allowedTools` is the
same move, per session and in memory.

The cost is that an allowlist cannot express *everything except these*, so OpenCode's `bash
{'*': allow}` minus seventeen patterns has no equivalent. Claude's list is enumerated, and an
unlisted-but-harmless command still prompts. The asymmetry runs in the safe direction.

### Two pieces of shipped copy were false, and are fixed

The permission block asserted a reason blobot cannot know — *"this reaches outside its own
workspace or cannot be undone"* — over calls that did neither. It now says the thing that is true
of every request that gets that far: blobot did not vouch for this one, so the runtime is asking
and the agent is stopped until an answer.

The creation flow's disclosure promised *"inside that copy they can read, edit and run commands
without asking you"* and that the runtime decides what counts *"not a list blobot wrote"*. The
first was true of an OpenCode agent and false of a Claude one; the second is now false on both,
since blobot writes a list for each. It says so without naming what is on it.

### Verified

- `claude-agent-runtime.test.ts` (3 new): the rules reach `_meta.claudeCode.options.allowedTools`;
  nothing that reaches the network, changes permissions or publishes is on the list, checked by
  name including bare `git`, which would have swallowed `git push`; the mailbox is still there
  beside them.
- **Live, against a real `claude`** (`live.test.ts`, 3 new, all run): asked to create a file in
  its own workspace, no permission request arrives and the file is written — which is the only
  way to know `allowedTools` is honoured rather than discarded like `permissionMode` beside it.
  Asked to run `chmod`, a request still arrives, so the allowlist is not vacuous. And with
  `{"permissions":{"ask":["Write"]}}` in the workspace's own `.claude/settings.json` the request
  comes back, so the user's settings still outrank blobot's vouching: `ask` and `deny` sit above
  `allow`, and `allowedTools` is an `allow`.
- Full suite green: core 324, desktop 207.

### Not done

- **OpenCode's list and Claude's are two lists**, maintained separately, and nothing checks that
  the seventeen patterns OpenCode asks about stay absent from Claude's allowlist. The Claude test
  hardcodes them. A shared "never vouch for this" table would be the honest shape.
- **The permission block still names `.claude/settings.local.json`** in copy shown for an
  OpenCode agent too, where an *always* goes somewhere else entirely. That is a
  provider-agnostic-UI violation that predates this change and is now the only one left in the
  block.
- **The list is still a speed bump and not a boundary**, which ticket 14 says out loud about
  both runtimes. `npm run` executes a script the agent may have just written, and `sed` writes
  whatever it is told to. `bash` and `sh` were dropped from the list for being the sharpest
  instance of it, which narrows the hole and does not close it.

## Built, 2026-08-30: the posture is a choice, per agent, in three words

The author's answer to the entry above: *"that settings should be per workspace/agent. we need a
ui for this. a simple selector or a friendly UX for noobs, no complex context."*

`WHAT IT CAN DO WITHOUT ASKING` in the hire and edit dialogs, under *how it answers*, because it
is the other half of the same question about the same agent: that one is what it says, this one
is what it does. Three rows, each a word over the sentence that says what the word costs, and the
same sentence under the closed control so a form nobody opened still says what the agent will do.

- **careful** asks before every edit and every command.
- **normal** edits and runs ordinary commands in its own copy, asks about the rest. The default,
  and what the entry above shipped.
- **trusting** also installs packages and fetches from the network. Still asks before deleting,
  publishing, or changing who can do what.

### Three positions, and the fourth that does not exist

`trusting` is the ceiling, and the copy carries it: `rm`, `sudo`, `chmod`, `chown`, `ssh`, `scp`,
`docker`, `git push` and `git remote` ask at every level on both runtimes. The step above it is
`bypassPermissions` or an unqualified allow, which ticket 14 refuses, so the menu has no fourth
row for the same reason `mode` is not in `SURFACED_OPTIONS`.

### The vocabulary is blobot's, which is new here

`core/trust.ts` holds three words and nothing else. Every other choice in the agent form is
either the provider's vocabulary passed through opaquely or a label the runtime handed us to
print; these three mean the same thing on both runtimes *because* the adapters translate them
into different things — Claude adds to an allow-nothing (`vouchedTools`), OpenCode subtracts from
an allow-all (`permissionPosture`). The renderer writes the sentence explaining each and still
cannot tell which runtime is behind it.

### Per agent, and the reason that is not arbitrary

An AgentWorkspace is per agent, so trusting Alice has never said anything about Bob. It rides the
model and the effort's path exactly: chosen on the profile, copied onto the Agent at team
creation, restated by an edit, taken by a running team at its **next start**. That last part is
not a policy choice here — `allowedTools` is a `session/new` parameter and OpenCode's posture is
the child's environment, so neither can change under a live process. ADR-0002 carries the
amendment.

### Verified

- `adapters/claude/permissions.test.ts` (4, new): careful vouches for *nothing*; trusting is a
  superset of normal; and the nine commands no level reaches, checked at all three levels.
- `adapters/opencode/config.test.ts` (4 more): careful is the object form and never the scalar
  that would make `read` ask; normal is `PERMISSION_POSTURE` verbatim; the level reaches both
  copies of the posture in the config the process is handed.
- `team-store.test.ts` (2 more): the level is copied onto the Agent, absent when nobody chose,
  and restated up and back down again.
- `components/TrustPick.test.tsx` (4, new): the closed control says what the agent will do, the
  trigger shows the word alone, and `trusting` names its ceiling in the same breath.
- `store.test.ts`: the "nowhere to put a credential" column list caught the new column, which is
  what it is for. Migration `0008`.
- **Live, against a real `claude`** (1 more, run): the same prompt and the same workspace as the
  entry above, with `careful` on the agent, and the write it did silently now stops to ask. One
  word on the agent, end to end onto the wire.
- **On screen**, `--screen=hire`: the field in the column and the menu open, two lines a row.
- Full suite green: core 332, desktop 212. Typecheck clean on both.

### Not done

- **Nothing shows what an agent may currently do** beyond the level it is set to. There is still
  no list of standing rules and no way to revoke one that **allow always** wrote, except by
  opening `.claude/settings.local.json` in the worktree. Ticket 14's out-of-scope line.
- **The level cannot be raised from the permission block**, which is the moment a user most wants
  to. Answering a request and changing a posture are different acts and the second one restarts
  nothing, so a control there would have to say "at its next start", inline, mid-turn.
- **The Radix menu cannot be screenshotted open** through the review harness: a `pointerdown` on
  a select trigger makes `capturePage` return a blank frame every time. The capture above was
  taken with the portal removed and `open` forced, then reverted. Worth a flag in `index.ts` if
  another menu ever needs reviewing this way.

## Built, 2026-08-30: the runtime picker carries the runtime's own mark

`RuntimeMark.tsx`, in the hire and edit dialogs' RUNTIME select — the trigger and every row.
`claude-code` and `opencode` have one; anything else draws nothing.

Prompted by `pingdotgg/t3code`, which ships five harness logos under MIT. **We took none of
them.** MIT covers t3code's code, not Anthropic's or SST's trademarks — it cannot sublicense a
mark it copied — so the licence bought nothing, and the actual basis for us drawing a vendor's
logo is the same either way: naming the product we speak to. Given that, the marks come from the
vendors' own origins (`claude.ai/favicon.svg`, `sst/opencode`'s brand folder), which is the same
work with provenance we can state. Three of the five were for runtimes blobot has no probe for.

### The exception this needed in DESIGN.md, and why it is an addition rather than a breach

The Icons section says Lucide and *"no other icon set, no inline SVG paths pasted into
components"*. Read flat that forbids this. But the team-icon rule already settles how blobot
shows a vendor's logo — **greyed, never coloured, never in place of the identity that matters**,
and "greyed rather than silhouetted, because luminance is most of what makes a logo readable at
that size". A runtime mark is that same question in a second place, so the clause added under
Icons applies that answer rather than contradicting it. `RuntimeMark.tsx` is named there as the
only module allowed to hold a vendor path, so the ban still bites everywhere else.

### OpenCode has no mark that survives 15px, and that is the vendor's logo not a drawing problem

OpenCode ships its logo **only as a negative**: a full-bleed plate with the box knocked out of
it, in both the light and the dark variant. Greying that plate puts a filled `--muted` square in
a select row — the heaviest thing in the sheet, and a shape rather than a mark. So it is drawn
positive at the vendor's own coordinates (240x300 canvas, box at 60..180 x 60..240, the block
its lower two thirds), with only the line weight ours.

It is still the weaker of the two at 15px: a bounded rectangle has no open structure to survive
the size, where the Claude starburst reads as itself. Four other renderings were tried and
compared at 15 and 48px — rounded corners read as a phone, the negative plate read as a block,
and a wider landscape box read clearly as a terminal but was *our* drawing rather than
OpenCode's. Faithful-and-weak was chosen over legible-and-invented. **This is the open question
if the marks are ever revisited**, and the honest alternative is no mark for OpenCode at all.

The label never leaves: the mark is a second channel onto one fact, never the only one.

### Verified

- `pnpm typecheck`, `pnpm test` (216 tests, 1 skipped) green.
- `--screen=hire` screenshot: the Claude mark sits at `--muted` beside the label, same weight as
  the chevron, nothing saturated added to the sheet.
- `RuntimeMark.test.tsx` pins the two rules that keep the exception allowed: no literal `fill="#`
  or `stroke="#` in either mark, and an unknown id renders empty rather than a placeholder.

### Not done

- The open menu was reviewed by rendering the marks standalone, not through the real Radix
  portal: there is no `--screen=` that opens a select. The rows themselves are unchanged markup.
- Codex and Gemini have no probe yet, so no mark. When they land they are label-only until
  somebody fetches their marks from origin, which is deliberate.


## The lead leads, 2026-08-30

`.scratch/team-addressing/issues/06-the-lead-leads.md`, which **reopened issues 02 and 04**.

Raised by the author while working with a team: *"messaging the lead of a team, today, means
nothing. He delegates no work, and does not operate as a lead."* Accurate, and the shape 01 and
02 left between them — 01 built the lead as pure addressing, 02 refused a coordinator and
stripped the role on the way out, so the only behaviour behind the word was saving four
keystrokes. This repo removed `to Alice ▾` from the composer because a control implied a surface
that did not exist; `WHO LEADS` was the same failure in words.

**The grounds for the reopen are the arrow, not the argument.** Every objection issue 02 raised
is about work flowing *user → lead → team*. The outbound direction, a lead you ask *about* the
team, was never weighed: it relays nobody's authority, delivers nothing, spends one turn, mutes
nothing when it fails, and accumulates only what was sent to it. And the two jobs the author
asked for are one build, because **the reporting half is the delegating half's eyes** — which is
issue 04's own finding, that a router which cannot see status hands work to a busy agent.

What holds:

- **The lead is never a pipe.** It gets the message when the user names nobody; `@bob` still
  lands on Bob and `@alice @bob` still fans out. That is what keeps 02's serialisation, single
  point of failure and context ceiling from being real here.
- **Peer authority is permanent.** Issue 03 is not reopened, and the lead is *told* this about
  itself so it asks rather than issuing orders that will be refused. Reply routing stays refused.
- **The brief is in the envelope, not the persona** — issue 02's own reason, since a persona is
  composed at session start and a persona fact would mean changing who leads restarts a team.
- **What it sees is blobot's record**, never a teammate's session or worktree. No new tool, no
  new persisted state, no cross-workspace visibility.

The pieces: `composeLeadBrief`, composed fresh per turn because it is the live status fold;
replacing the wake prompt's roster line rather than doubling it; folded onto a user prompt but
never into the `messages` row, and counted through `#lastWake` so the context gauge sees it.
`HandoffWatch.leading` drops the *"the prompt named that teammate"* clause for exactly one case,
the lead on a prompt that named nobody, and the noise that buys is accepted on the record for
that scope only. `#refundRoutingTurn` builds the exemption issue 02 decided and left unbuilt, to
its literal definition and keyed on what the turn did rather than who held it.

**Cost per user prompt: one extra turn.** 02's "three to four" assumed reply routing.

Nothing on screen changed. The headless demo team was given `leadAgentId: 'alice'` to match the
app's, and `pnpm demo` now prints Alice's brief beside Bob's persona — the whole of blobot's own
injection in one place.

Unverified: the widening has not met a real model. If a lead saying *"Bob's branch is fine"*
fires often in use, the scope narrows again rather than widening further.

## Built, 2026-08-30: a turn's steps fold, and the transcript stops losing the work

Ticket 12's third reopen, from a screenshot of one real Claude turn drawn flat: a dozen captions
(*"Now the interaction wrapper that every desk object shares."*), three wrapping shell one-liners,
and *"you allowed this, and it stops asking"* stamped once per call. The answer the turn was
leading to sat under the pile.

The defect underneath the noise was the seam, not the volume. **A finished call left the items
list on completion** and only the feed kept it, so what survived a turn was an agent's account
of the work and never the work — a list of intentions with the doing removed. The fold is what
makes it safe to keep both.

**The step is the unit**: a caption and the calls it introduces. `rowsOf` groups settled runs
into one row, drawn shut as `ran 6 tools` (`· 1 failed` when something did). What stays outside
a block is enforced by the grouping, not by a flag a render site can forget: a running or asking
call, an unanswered question, a live answer, and prose over 240 characters. Trailing prose is
trimmed, because the last thing said in a turn is the answer. A block needs two calls to be
worth folding — one call under a chevron is a line replaced by a line plus a click.

Taken from the pattern: the chevron and mono label, so the transcript has one disclosure gesture
and not two. Refused: the per-step checkmark (ticket 08 — a cancelled call reports `completed`
with `exit: null`, so a tick is that trap asserted louder) and the duration (not honest across a
permission wait). A clean completion prints nothing, which is silence and not a success claim.

Three smaller things came with it:

- **A call carries a verb.** `read` / `edit` / `run`, from the `ToolKind` both adapters already
  send and the renderer dropped on the floor. Fixed column, blank for an MCP tool.
- **The permission tail is gone.** The answered line says `allowed once` / `allowed always` /
  `rejected`. Where an *always* is written is said in the block that asks, once, at the moment
  it is a decision.
- **A call that went through a permission block no longer prints twice.** The permission item
  *is* that call's line, so the tool item is dropped on settle. Found by a test, not by eye.

New scenario, `works-through-a-list` (08), and the `many-steps` demo script. There was no
checked-in run with a *sequence* of calls, which is the one shape this feature exists for, and
without it the first twelve-step turn we met would have been in somebody's repository.
`fold-live.test.ts` drives the real mock stream through `reduce` and `rowsOf` rather than a
hand-built fixture — which is what caught the next item.

**Known gap, pre-existing, now visible.** A `snapshot` replaces `items` and does not restore
tool lines, so a snapshot landing mid-turn drops that turn's calls: the first review of this
showed `ran 3 tools` on a six-call turn. It was invisible before, because calls were transient
anyway. The fix is either a merge that keeps the open team's tool items or a recorder that
persists them, and both are decisions this change did not make. Reproduce with
`--demo-scenario=many-steps --autoplay-at=2000`; it does not happen at `--autoplay-at=6000`,
where the launch snapshot lands first.

**Overruled on the record:** diff counts beside an edit may be green and red, against the
governing rule — the author's call, two small signed numbers whose sign already carries the
meaning. Named as an exception in `DESIGN.md`. Not built: no `rawOutput` is plumbed through core,
and doing it needs a live run against both runtimes.

## Built, 2026-08-30: a restored transcript folds, and the call it used to lose

The gap the section above left open, closed. A restored pane had no tool lines at all, so nothing
in it grouped and **every past turn came back as a flat wall of captions** — permanently, not
only until the next completion. That is the ordinary case: a relaunch, a team switch. The fold
worked exactly where it was least needed.

Everything required was already in the database. `tool_calls` has the kind, the status and the
times, and `logOfTeam` already read it for the activity column. Three changes made it a
transcript:

- **`exit_reported`**, a new column and migration `0009`. Ticket 08's trap is that a cancelled
  call reports `completed` with an explicit `exit: null`, while a call with no exit code to give
  reports none — and `exit_code` stored a SQL NULL for both, so a restored line had to either
  call every second-kind call cancelled or lose every cancellation. The column records what came
  over the wire and concludes nothing; the word *cancelled* is not in it, because inferring it is
  what ticket 08 forbids. The fold's header counts failures off this, so without it a restored
  header quietly said the wrong number.
- **`startedAt` and `kind` on the log rows.** The feed orders by when a call ended; the
  transcript puts it after the line that introduced it. Both times travel rather than one.
- **The snapshot rebuilds tool items**, filtering blobot's own loopback tool exactly as the live
  path and the feed do, and taking an unknown or absent kind as `other` rather than guessing a
  verb.

**And a call was being lost outright, by both surfaces.** A six-call turn read `ran 5`, and the
activity column was missing the same entry — which it had been missing before any of this work,
unnoticed. The cause is in `App.tsx:97`: the renderer filters streamed events by
`showing.current`, which is `undefined` until the first snapshot resolves, so **every event
arriving before that is dropped**. Calls that had finished came back from the store; the one
still in flight was excluded from `logOfTeam` for having no `ended_at` and was gone from both.

Two wrong fixes were tried and backed out, and both are worth naming. Materialising the item from
its completion fails because a terminal `tool_call_updated` carries no title — the mock omits it
and ACP sends only changed fields. Preserving in-flight items across the snapshot fails because
at launch the item never existed to preserve. The fix is `logOfTeam().running`: the store knows
the call started and has not seen it end, and that is the only place it exists. Kept apart from
`tools` because they are different claims — what happened, and what is happening — and never
windowed out, since there are at most a handful and they are the newest thing the team has.

**Unfixed, and named rather than worked around:** the renderer still drops events before its
first snapshot. Everything else it would lose that way is restored by the snapshot itself, so the
hole is covered rather than closed. Closing it means the stream knowing its team before the first
round-trip, which is a change to how a team is opened and not to how one is drawn.

## Built, 2026-08-30: an edit says what it changed, and stops saying its verb twice

The two things the fold was missing, both answered by measuring the wire first rather than
guessing at it. `BLOBOT_WIRE_DUMP=1` against a real `claude`, one edit, the whole `session/update`
stream dumped — and both answers were in it.

**The counts come from ACP, not from a provider.** The bridge sends
`content: [{type:'diff', path, oldText, newText}]` on every edit, which is the protocol's own
block, so `adapters/acp/line-diff.ts` counts them in the shared half and a second runtime that
sends the block is counted without an adapter of its own knowing anything. No `rawInput` parsing,
no `structuredPatch`, no vendor shape above the adapter line.

It has to be a **real diff**, and this is the part a guess would have got wrong: the same edit
arrives twice. First narrow — `beta\n` becoming three lines — then widened with surrounding
context, where most of what is present did not change. Counting lines would make the second
reading absurd; an LCS gives `+3 −1` for both, which is what the runtime's own patch says and
what the tests assert. Common prefix and suffix are trimmed first, so a one-line edit inside a
20,000-line file measures three lines and not forty million cells. Past 1,500 changed lines on
either side it reports nothing, because a missing count is honest and a wrong one is not.

**The verb was being said twice.** The bridge titles a call `Edit notes.txt`, and blobot draws
`edit` in its own column from `ToolKind` — so a live turn read `edit  Edit src/pages/index.astro`,
the same fact in two registers with the target pushed out of the fixed column that makes a folded
run scannable. The mock's titles were bare paths, so this was invisible until a screenshot of a
real turn. `adapters/claude/tool-title.ts` takes it off, in the adapter because `Edit` and `Write`
are Claude's words, and off `_meta.claudeCode.toolName` rather than off any capitalised first
word — so `Bash` running `Edit the config by hand` keeps every word of it.

Persisted in `lines_added` / `lines_removed` (migration `0011`), so a restored fold counts what a
live one counts. Both columns or neither: half a diff is not a fact worth drawing.

The mock carries the two **texts** rather than the counts, so `works-through-a-list` exercises the
counting instead of bypassing it, and the counts land on an update *before* the terminal one —
which is where a real Claude puts them, and a consumer that only read the way out would show
nothing on every edit and still pass.

**Verified live**, both halves, in `adapters/claude/live.test.ts`: an edit's title carries no
leading verb, and the diff block reaches the vocabulary as `+3 −1`. That test is the only place
either claim can be checked, since both are claims about the wire.

**Not verified:** whether OpenCode sends the `diff` block at all. If it does, it is counted with
no further work; if it does not, its edits draw no counts, which is the same silence as a diff
too large to measure. `BLOBOT_LIVE_OPENCODE=1` still has not been run.

## Run, 2026-08-30: the OpenCode live tests, and the diff block on a second runtime

`BLOBOT_LIVE_OPENCODE=1`, against a real `opencode` 1.18.4. **All six pass on the first run** —
persona on turn 1, a tool in its own workspace with stable ids, `blobot_message_agent` found and
called over loopback HTTP, a resume across processes keeping memory and persona and tool, a
cancel mid-flight leaving the session usable, and the permission posture resolving to what ticket
14 wrote. That is the whole of what `build.md` has been listing as unrun since the adapter landed.

**And the diff block is not Claude's.** OpenCode sends ACP's own
`{type:'diff', path, oldText, newText}` on an edit, so `adapters/acp/line-diff.ts` counted it with
**no OpenCode-specific code written for it at all** — which is the argument for putting the
counting in the shared half rather than in an adapter, now measured instead of assumed.

The number is corroborated rather than asserted: OpenCode's `rawOutput.metadata.filediff` carries
its own `additions: 3, deletions: 1` for the same edit, and the LCS says `+3 −1`. Two independent
arithmetics agreeing. The live test asserts against that, and says so.

**One difference worth knowing, not fixed.** The two runtimes title an edit differently, and
neither needs the other's treatment:

- Claude titles it `Edit notes.txt` — verb plus a **workspace-relative** path, which is why
  `withoutToolVerb` exists.
- OpenCode titles it `edit` while in flight and then replaces it with the path on completion,
  **absolute and with the leading slash gone**: `tmp/blobot-oc-kAIrDZ/notes.txt`. No verb to
  strip, so the Claude-side fix correctly does nothing here — but the line in a real OpenCode
  transcript carries a long absolute path where Claude's carries a short relative one.

Making those agree means blobot rewriting a runtime's own title against the AgentWorkspace root,
which is a decision about how much of a provider's words we restate, not a bug fix. Left alone
and written down.

## Run, 2026-08-30: the composer takes an attachment

Asked for by the author with a screenshot of the composer. Grilled to a settled tree first
(`.scratch/composer-attachments/`, spec plus nine tickets, all resolved), then built end to end.
`docs/adr/0004-attachments-are-embedded-not-linked.md` carries the decision that shapes the rest.

**An Attachment is embedded, never linked.** ACP's baseline is text and `resource_link`, and
`image`/`embeddedContext` are opt-in — both runtimes advertise both, which is in the checked-in
transcripts. The cheap answer was a `resource_link` to the user's path, or to blobot's own stored
copy. Both are refused, on a fact already in this repo: `adapters/claude/permissions.ts:35` says
`Read`, `Glob` and `Grep` are absent from `allowedTools` **because Claude never prompts for
them**. A path handed to an agent is read with no gate at any trust level, so neither link can be
defended as "the user approves it". The store version is the worse of the two: one stable
directory holding every attachment from every team, and one link into it is a `Glob` away from
the rest.

What landed:

- `Prompt.attachments` and `AgentRuntime.accepts` in `runtime.ts`; `adapters/acp/attachments.ts`
  holds `acceptsOf` and `contentBlockOf`, shared because it is the protocol's shape and not a
  provider's — an image is an `image` block, a text file an embedded `resource`, attachments
  first and the text after. A pasted image carries **no `uri`**: an invented `pasted-image-1.png`
  is a filename for a file that exists nowhere under it, and the agent will repeat it back.
- Two ceilings in `orchestrator/bounds.ts` beside the peer bounds, because they are the same
  rule. 4 MB for an image (providers stop around five, and a prompt crosses as one stdin line,
  base64-inflated), 50,000 characters for a text file — an order of magnitude above
  `PEER_MESSAGE_LIMIT`, and the gap is the point: that bound stops agents dumping on each other,
  this is the operator speaking with the operator's authority. **Refused at pickup, never at
  send**, and never truncated.
- `attachments` and `message_attachments` (migration `0010`). One blob, N message rows: a fan-out
  of three is three deliveries and one copy of the bytes. Metadata rides on the Message and the
  bytes never do, so a transcript of two hundred messages is not two hundred images.
- The composer's paperclip, paste and drop. **The renderer never reads a file**: a path goes to
  main (`main/attachments.ts`) and main decides the size and the kind before any bytes cross. A
  paste is the exception by necessity and takes the same two checks. `webUtils.getPathForFile`
  in the preload, because Electron removed `File.path` in 32 and this is 44.
- A thumbnail, **in colour**, in the composer and the transcript. That is a `DESIGN.md`
  amendment and it is written there: saturation is blobot's to spend on blobatars, and content
  the user supplied is not blobot's to desaturate. Narrow — the team icon and `RuntimeMark` are
  unchanged, and a vendor's logo is still greyed.
- `attachments · 2 · 480 KB · sent this session` under the gauge. Bytes and a count, never
  tokens, because an image's cost is a function of its pixels and that function is the
  provider's. Counted cumulatively and worded apart from everything else there, since it is the
  only figure that is **not per-turn**: an embedded attachment stays in the session's history.
- `--attach=<path>` beside `--autoplay`, so the chip and the bubble are reviewable headlessly.

**Two things found while building, both left as they are and written down.**

**Attachments are kept forever.** Ticket 04 claimed they die with their team; they do not.
`SqliteStore.tombstoneTeam` marks the row and **keeps the transcript**, which is documented,
deliberate behaviour, so an attachment outlives the team it was sent to and nothing removes one.
The store only grows. If that ever needs an answer the answer is a transcript retention policy,
which is a decision about messages and not about bytes. The ticket was corrected and a store test
asserts the behaviour rather than the old claim.

**The mock is the only runtime that can say no.** Both real ones accept both kinds, so
`MockAgentRuntime` takes an `accepts` option and the composer's refusal path is exercised against
it. Without that the path would sit unrun until a fourth adapter arrived.

**Not done, deliberately:** PDFs (embedding one is protocol-legal and there is no evidence either
runtime does anything with it — a silent drop is worse than the gap); attaching a file that is
already in the Workspace, which is path completion and not an attachment, and is its own effort;
and a peer attaching anything, refused in `.scratch/composer-attachments/09`.

**Not verified live.** No real runtime has been handed an attachment yet — the adapters' halves
are covered by unit tests over the block shapes, and `BLOBOT_LIVE_CLAUDE=1` / `BLOBOT_LIVE_OPENCODE=1`
have no attachment case. That is the first thing to run next.

## Built, 2026-08-30: the two runtimes say a tool call the same way

The divergence the OpenCode live run turned up, closed. On the same edit the transcript read
`edit  notes.txt` for a Claude agent and `edit  tmp/blobot-oc-kAIrDZ/notes.txt` for an OpenCode
one — a short relative path against a long absolute one, on identical work, in a fold whose whole
value is that a stack of calls scans as a list.

**Not reconciled by comparing their titles.** That would mean a rule per vendor about which words
to strip and which slash to restore, kept up to date against two release cadences, in code that
is meant to know neither. `locations` is ACP's own field, both runtimes populate it, and a path
carries no verb — so `adapters/acp/target.ts` takes the title from there, relative to the
AgentWorkspace, and the two agree by construction rather than by string surgery.

Relative to the workspace because that is what the path *means*: every agent works in its own
checkout, and the part that differs between two agents on one team is exactly the part that says
nothing about the work. A path outside it keeps its `../`. Several locations on one call say
`a.ts +2 more` rather than naming the first, which would claim the others did not happen. A call
about no path — every command — keeps its own title, because there is nothing else to say, and
that is also why `withoutToolVerb` stays: Claude's in-flight title is `Edit` or `Read File`
before any location exists.

**Verified live on both**, asserting the same string from each: `notes.txt`. The full OpenCode
suite is green again afterwards, seven tests now.

This is the pattern for the next one of these. A divergence gets aligned where ACP has a neutral
fact that both runtimes already send — `locations` here, the `diff` block for the line counts —
and is left alone where it is genuinely the provider's own voice with no protocol-level answer
behind it.
