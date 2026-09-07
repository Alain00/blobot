# The rail: what was decided while building, and what is left

Built 2026-09-06, all eight tickets in one session, against `spec.md` and the map's execution
override. `map.md` has the decisions and each ticket the reasoning; this has the parts that are
only visible from inside the code.

## What the tickets did not have to say, and the code did

**`useTeamOpening` is deleted, not adapted.** It grew the roster's box from nothing and staggered
its rows in — one gesture with one subject, a team making room for its members. There is no
roster, so there is no subject: pressing a row switches the pane and the list does not change
shape, and an animation there would be smoothing a change the interface is not making. Its whole
test file went with it. `DESIGN.md` records this under the chevron's entry rather than as a
motion note, because it is the same removal.

**`Composer` needed a `thread` prop, and the reason is the empty case.** The `@mention` menu and
the fan-out cost line are counts of members, and both fall away on their own once a thread has one
Agent — the cost line already branches on `recipients.length > 1`. What does *not* fall away is
the send control: before the first message there is **no Agent at all**, so `recipients` is empty
and the button was closed on the one screen where pressing it is the whole point. `thread` is what
opens it, and it carries the name because the composer has nobody to read one off yet.

**`itemsFor` gained an empty branch for the same reason.** A `{kind: 'thread'}` pane is showing a
person and not a session, so filtering the open team's items by an agent id would have returned
that team's whole stream. It returns nothing, which is what an empty conversation is.

**A thread is a legitimate thing to relaunch onto, and that needed `UiTeam.threadFor`.** The
launch picks `listTeams()[0]`, and excluding threads there would put a user whose only
conversations are threads back in the creation flow. So `paneAfterSnapshot` takes a `thread` flag
and lands on the single member instead of on `{kind: 'team'}`, which is the one place the renderer
branches on the value at all.

**`removeTeam` was extracted before retiring could use it.** Retiring an agent deletes their
thread, and a thread is a Team — so the ordering bought expensively in the Machines review (every
AgentWorkspace removed *before* the rows are tombstoned, because the branch is
`blobot/<team>/<agent>` and the name has to still be true) must not have a second implementation
that could disagree with the first. `blobot:deleteTeam` is now three lines calling it.

**Two Handbook strings say *this team* and had to branch.** The Handbook itself is unchanged and
stays per Agent — it is a claim about the work, which is `02`'s test — but its empty-state line
(*"Your Handbook for this team is empty"*) and `WHEN_TO_RECORD`'s teammate clause (*"A teammate
telling you something counts as working it out"*) are both claims about members. `composeHandbookBlock`
takes a `thread` flag; the clause is dropped rather than reworded, because it exists only to settle
*told or worked out* for something a colleague said.

**`composeWakePrompt`'s roster line is now conditional on the roster being non-empty**, not on the
thread. It is unreachable in a thread — there are no peers to be woken by — and the guard is there
because the failure it prevents is a prompt reading `Teammates you can message: .`, which is the
shape of a claim about members with the members missing. Asserted all the same.

**`agentProfiles()` had to exclude threads too.** That list prints which teams an agent is on, and
a thread's Team name *is* the agent's name, so *your agents* would have read **Alice is on a team
called Alice**. One `filter` on the map it builds, not on the query.

**`Settings → Machines` needed no change at all**, which `05` predicted and the code confirms:
`configuredMachines` already filters to `machine.kind === 'box'`, and a thread is always local. The
seam that ticket was written to find does not exist.

## The one shipped defect found on the way

**`lastActiveAt` and the last line were two reads.** `teamSummaries` called `store.lastActiveAt`,
and the rail's new second line needed the words as well as the moment. Reading them apart would
let a row show a time from one message and words from another, so `lastSaidIn` is one method
doing both queries and picking the later row whole. `lastActiveAt` survives as the fallback for a
team with a row and no messages.

## What is not built, and was not asked for

- **Demo mode grows no threads.** `--demo`'s agents are a TypeScript file with no AgentProfiles
  behind them, so `snapshot.profiles` is absent there and the rail draws the one team it has. Out
  of scope on the map, and the component takes `profiles` as optional for exactly this.
- **A Routine run inside a *team* still marks its agent's seat**, which the rail folds onto the
  team's row as weight. The map's *Not yet specified* asked whether that should change now that no
  agent row belongs to a team; nothing here answers it, and the behaviour is unchanged.
- **The pin is `localStorage`**, per machine, on `useSidebarPanel`'s reasoning. A stale id — a
  pinned team since deleted — matches nothing when the list is assembled, so there is no
  reconciliation pass and there is a test saying so.

## What has not been run

Nothing here has been in front of a real runtime. A thread's persona, its missing `message_agent`
and its Handbook copy are asserted as strings; the folder-making path is tested against an
injected `prepare` rather than against `git init` under `~/blobot`. **The first real thread is the
thing to do next**, and the cheapest way to be wrong is the collision case: `~/blobot/<name>`
taken by something unrelated should land in `<name>-2` silently, with the typed message intact.

## Found on the way, and not fixed

**`--demo --screenshot` cannot find the migrations, and has not been able to for a while.**
`main/index.ts` builds the folder as `join(app.getAppPath(), '../../packages/core/migrations')`,
and `app.getAppPath()` is the *script's* directory when Electron is launched with a file — so
running the documented `electron out/main/index.js` from `apps/desktop` resolves it to
`apps/desktop/packages/core/migrations`, which does not exist, and the demo database never opens.
Verified pre-existing by stashing this branch and rebuilding: the baseline fails identically. Not
touched here, because it is a launch-path bug in a flag rather than anything this effort owns, and
the fix is somebody's decision about how the app is meant to be started.

**The rail was reviewed through a fixture instead**, `research/rail-fixture.cjs` and its synthetic
preload beside it — the same shape as Machines' `45`, a built renderer with a fake `window.blobot`
and no production main, no providers and no IPC. `research/rail.png` is six rows of both kinds
with a waiting team, a `+1`, an unread thread and two agents nobody has spoken to;
`research/rail-pinned.png` is the same list with two rows pinned, which is where the block's
hairline was found drawing in a token (`--rule`) that does not exist.


## Two follow-ups from the author, 2026-09-06

**1. The unbriefed notice card is gone, in both panes.** Not a rail change, but it arrived in the
same message and the reason belongs to the whole app: briefing is a conversation, so it happens in
the conversation. The card announced *Mara has not been briefed* directly above the agent's own
first words saying the same thing better — blobot speaking first, which is the third party ticket
02 was written to keep out of the room. The amendment and everything that went with it are on
`.scratch/handbooks/issues/06-the-screen.md`; `DESIGN.md` carries it too. The tray's door is now
drawn at `handbook · 0`, because it is the only way into an empty Handbook once the card is gone.

**2. The power dot went out when you opened another team, and the cause was two things.**

The visible half was this file's: `Rail.tsx` read the dot off `agents`, the **open team's roster**,
matched against `team.threadFor` — so the dot could only ever be drawn on the one thread being
read, and switching teams put out a light on an agent that was still awake. Every rail row saying
`STOPPED` was this same failure a month earlier: a row asserting something about a team from a
value that only describes the open one. `railRowsOf` carries `power` on an agent row now, off
`UiTeamMember.machinePower`, which `teamSummaries()` fills for **every loaded team** from the
pool's own `powerOf`. Absent still means *not loaded*, and is drawn as no dot rather than as a
false `asleep`.

The invisible half was real and the author guessed it: `LIVE_TEAM_LIMIT = 3`, hard-coded, so a
fourth team genuinely did stop the third's agents. Three was chosen for the shape of a laptop with
a handful of teams and the cost of being wrong about it was never a slower switch — it was a
Machine stopped behind the user's back with nothing on screen explaining it. It is
`DEFAULT_LIVE_TEAM_LIMIT = 20` now and a **setting**: Settings → Machines → *Loaded teams*, stored
beside sleep in `machine-preferences.json`, 1 to 100. `TeamPool.limit` is settable while the app
runs — raising it takes at the next start, lowering it collects the excess at once, under the
eviction rule that never takes the active team, one mid-turn, or one held for a Routine.

The two settings are deliberately separate forms in the same section: sleep is what an **idle
agent** does, this is what happens to a team you **looked away from**. A file written before today
has no `liveTeamLimit` key, and that is a default rather than a corrupt file — the missing-key case
has a test, because `load()` treats an unreadable duration as a reason to disable sleep entirely
and this setting must not inherit that.


## The right sidebar, same day

Four asks from the author, in one session, all built.

**1. Open by default, and shut is what is remembered.** `useSidebarWidth` keeps a
`blobot.sidebarOpen` key beside its width, on `useSidebarPanel`'s reasoning. It shipped closed on
the ordinary rule that a flank should be asked for, and asking every launch is a chore rather than
a question — and this is the panel `DESIGN.md`'s own amended flanks rule lets in *because* it is
the only rendering of which files an agent touched. `--screen=files` still forces it, which is now
a redundancy rather than a lever.

**2. A head, and one head slot.** The team's name in the chooser, the agent's name with the back
arrow once one is picked. **No hover ground on the team head** — the author's own correction the
same hour: it is a header, and only the `+` at its right edge answers a pointer. The `+` is the
rail's own add glyph rather than a new shape, because it is the same act in the same app.

**3. The `+` opens the creation flow's *who* step, pointed at a team.** `AddMember` is the
`pickbar` again — cmdk, badges, `hire an agent` at the foot — with the current members as badges
that carry no ×. It is **add-only** at the author's direction, and it **hands the roster over and
goes**: `editTeam` awaits a full team restart in its `finally`, so a bar that waited for the call
sat over the window for seconds looking stuck. That is `startTeam`'s shape and its reason, and a
failure lands in the strip above the panes where every other team-level failure already lands.

**4. Removing is a right-click on the face in the chooser.** `RemoveMember` in `TeamEdits.tsx`,
beside `EditTeam` and reusing `whatHappensTo` and `RemovalNotes`. A dialog and not a menu item
that acts, because a departure ends a session and leaves a branch or a copy behind: it says what
happens to the work before, and what happened to it after. Unlike the add bar it **does** wait,
because there is a report to deliver. Two guards, both in `App.tsx` where the roster is composed:
never the last member, since a team of nobody is not a team, and never on a team whose members
have no `profileId` — the wire takes profile ids, so dropping the ones without would take
everybody off.

Reviewed through the rail fixture extended into `sidebar-preload.cjs` (not checked in; it is the
rail fixture plus `listAgents`, `workspaceTree` and `profileId`s on the members).
