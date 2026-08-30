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

1. **A screen for *your agents*.** They are still only visible inside team creation, and
   editing a profile — rename, change of role or runtime — is the open question ADR-0001 named
   and did not answer.
2. **Surface a resumed session.** `runtime.resumed` knows whether an agent came back knowing
   the conversation or started again under a transcript it cannot remember, and nothing says
   so. Observed live: Mara silently started fresh.
3. **A backgrounded team that is working says nothing.** Three teams stay live and a team the
   user is not looking at can keep taking turns.
4. **Renaming a team**, which needs a decision about the branches first.

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
