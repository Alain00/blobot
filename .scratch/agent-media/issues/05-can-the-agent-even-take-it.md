Type: grilling
Status: resolved
Blocked by: 04

# Can the agent take the picture at all, and who says so?

## Question

Half of this feature is invisible from the transcript: before blobot can show a screenshot, the
agent has to be allowed to produce one, and nothing in ticket 14's posture has ever considered it.

The current state is half right by accident and half wrong by accident. `import`, `scrot`, `grim`
and `screencapture` are on no list, so they prompt at every level: the correct outcome, arrived at
by omission, which means it is not a decision and will not survive the first person who finds it
annoying. But `npx` **is** on `TRUSTING_BASH` (`adapters/claude/permissions.ts:102`), so at
`trusting` and `unattended` an agent already runs `npx playwright screenshot ...` unprompted. A
prefix rule that hides an arbitrary verb is the exact defect `gh api` was pulled from the list for
on 2026-08-31, and this one is live today.

The question is whether taking a picture is ordinary work blobot vouches for, and the answer
splits hard depending on **what is being photographed**:

- A **browser under the agent's control**, rendering the app the agent just built in its own
  worktree, is as ordinary as running the test suite.
- The **user's screen** is not ordinary at any level. It photographs whatever is in front of the
  person, including windows that have nothing to do with this team, and there is no trust word in
  blobot's vocabulary that should reach it.

Those are different verbs wearing the same word, which is exactly the split ticket 14 made for
`git` and had to make again for `gh` on 2026-08-31.

## What it has to settle

- **Whether the screen is off limits at every level, permanently**, the way `rm`, `sudo` and
  `git push` are. The case for yes is strong and should be written down as an argument rather than
  a preference, because it is the first entry on that list that is about *privacy* rather than
  destructiveness or reach.
- **Whether a browser screenshot is vouched, and from which level** — and, separately, **whether
  `npx` should stay on `TRUSTING_BASH` at all**. That is a live defect this ticket found rather
  than a hypothetical, it is not this feature's to fix quietly, and if it is not fixed here it
  needs its own ticket rather than a mention.
- **What an MCP browser server means for all of this.** `Mcp(blobot:*)` is vouched at every level
  so a peer message never waits on a human. A browser server is the operator's own and is not
  blobot's to vouch for, so a screenshot arriving through option 1 of ticket 04 asks a permission
  question every time — which is correct, and is also the reason this feature may feel broken.
- **Whether that prompt should be answerable once and remembered.** `allow_always` exists and
  writes into this one agent's own workspace. A screenshot loop that prompts on every frame is the
  case that makes it obvious, and it should be reasoned about here rather than met live.
- **What happens in a Routine run**, where a permission expires because nobody is watching. A
  screenshot Routine is the most attractive version of this feature and the one most likely to
  produce nothing at all.

## What is binding

- `bypassPermissions` and its equivalents stay unoffered. There are **four** levels, not three —
  `careful`, `normal`, `trusting`, `unattended` (`core/trust.ts`) — and `unattended` takes
  `trusting`'s list unchanged on purpose. Anything this ticket adds to a list is therefore added to
  the unattended case too, where nobody is watching, and it has to be argued in that light.
- Four words of blobot's own, translated by each adapter from its own end. Nothing added to
  `core/trust.ts` may only make sense on one runtime, and two of the five runtimes answer every
  word with one mode (`CODEX_EXPRESSES_TRUST`, `FX_EXPRESSES_TRUST`) rather than pretending to a
  gradation they do not have.
- Per agent and never per team. An AgentWorkspace is per agent.
- blobot never widens what an agent may do as a side effect of a turn — the `/allowlist` refusal.

## Answer

**blobot adds nothing to enable this, adds one permanent refusal, and the `npx` defect is not a
defect.** Resolved 2026-09-05. Two of the three things this ticket believed were true turned out to
be wrong when read against both postures rather than one, and the correction is the substance of
the answer.

### The screen is off limits at every level, permanently

The first entry on the never-list that is there for **privacy** rather than for destructiveness or
reach, and it is argued rather than assumed.

Every other permanent refusal is about the agent doing something the user would have to undo:
`rm` deletes, `sudo` escalates, `git push` publishes, `chmod` changes who may act. A screen capture
undoes nothing. What it does is photograph **everything the person has open** — another team's
work, a password manager, a message from somebody who is not in this conversation, a bank tab —
and hand it to a model. There is no `git restore` for that. A frame that entered a context window
cannot be recalled, and the person whose privacy was spent is frequently not the person who typed
the prompt.

It is also the one verb that reaches **outside the AgentWorkspace entirely**. Everything blobot
vouches for at `normal` acts on the agent's own copy of the user's repository; that containment is
the whole reason editing is vouched unconditionally. A screenshot of the display server is not in
any workspace, is not per agent, and is not something an AgentWorkspace can isolate. Ticket 02
settled that the risk of this map's arrow is credibility rather than confidentiality **because the
recipient owns the repository**. The screen is the one place that argument stops working: the user
owns their screen, but they do not own everything visible on it.

So it never reaches `trusting`, and therefore never reaches `unattended`, which takes `trusting`'s
list unchanged and is the level where nobody is watching.

The class is **anything that reaches the display server**, not screenshots specifically. Capture
and input injection are the same reach: `import`, `scrot`, `grim`, `maim`, `spectacle`,
`screencapture`, `gnome-screenshot`, `flameshot`, `wayshot`, `xwd`, `xdotool`, `wmctrl`,
`ydotool`. `ffmpeg` goes with them, at every level, for `gh api`'s reason exactly: `-f x11grab` and
`-f avfoundation` are invisible to a prefix rule and the verb cannot be split on the head of the
command.

### The correction: on OpenCode they are allowed today

The ticket said these commands are on no list and so prompt at every level, correct by omission.
**That is true of Claude and false of OpenCode**, and the difference is the shape of the two
postures, which is exactly what `CODEX_EXPRESSES_TRUST` and `FX_EXPRESSES_TRUST` exist to keep
visible.

Claude's is an **allowlist**: `vouchedTools` returns a closed list, an unlisted command prompts,
and absence is the safe outcome. OpenCode's is a **denylist**: `BASH_PERMISSIONS` is `'*': allow`
minus about twenty patterns, and absence is the *unsafe* outcome. `grim` is not in that list. So on
OpenCode, at `normal` — the default, what an agent is when nobody has chosen — **an agent runs
`grim /tmp/screen.png` with no prompt, today.**

That is a live defect and it is this ticket's to fix, not a mention: the whole class above is added
to `BASH_PERMISSIONS` as `ask`, and to `TRUSTED_ANYWAY` never. Cursor is an allowlist with an empty
`permissions.deny`, so an unlisted verb prompts and it is already correct; Codex answers every trust
word with `read-only` and fx with `ask`, so neither can reach it either. OpenCode is the only one,
and it is the only one because it is the only denylist.

#### Built 2026-09-05, and Claude was a second instance

The fix landed as written, and finding the second one is the lesson above turned on this ticket's
own claim. **Claude is not correct by omission at `unattended`.** `permissions.ts` already carries
the measurement that says why: under `auto`, three live runs had the classifier approve `chmod 777`,
a `git push` to a real remote and a reach for `sudo`, with these commands absent from `allowedTools`
exactly as designed and **no permission request ever reaching blobot**. *Absent from an allowlist is
not refused* -- it is the classifier answering. So at that one level the display class is on
`REFUSED_AT_UNATTENDED` beside the nine verbs, which is the only shape that refuses anything there.

At the three attended levels it stays absent and therefore asks, which is what this ticket wanted
and what the copy promises: denying it there would turn *still asks before* into *cannot*, silently,
for every agent already hired -- the same argument that file already makes for `rm`.

The general lesson survives with a wider edge than it was written with. It is not *allowlist safe,
denylist unsafe*: it is that **absence means whatever the runtime decides it means**, and on Claude
that answer changes with the trust level. A second test asserts the class is vouched at no level on
either runtime, because a later session adding an `ffmpeg` or `playwright` convenience to
`TRUSTING_BASH` is how this widens again and it would widen silently.

The general lesson is worth writing on the ticket rather than only fixing the instance: **a rule
that is safe by omission on one runtime is unsafe by omission on the other**, and every future
"this is already handled because it is on no list" has to be checked against both ends.

### `npx` is not the `gh api` case, and it stays

The ticket carried this as a live defect and the map repeated it. It does not survive being written
out.

`gh api` was removed because it reached a capability **nothing else vouched for**: writing to
GitHub. Every writing `gh` verb is refused at every level, and `gh api -X POST` walked around all
of them behind a prefix a rule cannot see past.

`npx` reaches nothing that is not already vouched at the same level. At `trusting`, `npm install`
is vouched and, at `normal` already, so are `node`, `python` and `npm run`. `npx playwright
screenshot` is `npm install playwright` followed by running it, and both halves are vouched
separately at that level. Removing `npx` would remove a keystroke, not a capability, and it sits on
the list whose stated axis is *the network and the installers*, which is precisely what it is.

The real thing of that shape is one line up and is deliberate: **`node`, `python` and `npm run` at
`normal` execute arbitrary code the agent may have just written.** That is not an oversight either.
The list's own comment says it: *a speed bump, not a boundary*. What blobot claims is prompting,
and it stays true. If anybody wants to revisit that, it is a ticket against ticket 14 and not
against this map.

The map's *Found on the way* entry is corrected accordingly.

### Nothing is added to vouch for a browser screenshot

A headless browser rendering the app the agent just built in its own worktree is as ordinary as the
test suite, and **it already runs**: `node`, `python3` and `npm run` are vouched at `normal`, so an
agent with a browser dependency in its own workspace takes a screenshot with no prompt and always
could.

So blobot adds no `playwright` prefix, no `puppeteer`, no `chromium`. Adding one would put a
vendor's CLI in blobot's own posture, which is the coupling this repo refuses everywhere else, and
it would buy nothing.

That is the ticket's real answer and it is worth stating plainly: **for the objective in scope,
blobot widens nothing.** The half of this feature that looked like it needed a permission decision
needed one refusal and no permission.

### The operator's MCP browser server keeps prompting, and that is correct

`Mcp(blobot:*)` is vouched at every level because a peer message must never wait on a human. A
browser server is the **operator's own**, blobot did not install it and cannot vouch for what its
tools do, so a screenshot arriving through ticket 04's option 1 asks every time.

This is the reason option 1 will feel broken, and it is not blobot's to fix. It is also the second
argument for why option 1 is the silent-drop fix rather than the feature.

### `allow always` is the user's, and it is the one path around the never-list

A screenshot loop prompting on every frame is the case that makes the third button obvious, and
nothing here special-cases it: the button already exists, it writes `permissions.allow` into this
one agent's own `<workspace>/.claude/settings.local.json`, and the block says where it goes in the
same sentence that offers it.

It should be known rather than discovered that this is also the one route past the permanent
refusal above: a user who answers *allow always* to `grim` has widened their own agent. That is
their act, per agent, visible in a file they can read and delete, and blobot does not block it.
**blobot never widens what an agent may do; the user may.** The `/allowlist` refusal is the rule
that this does not contradict, because that one is about an *agent's turn* widening the next
agent's reach.

### A Routine run lands the right way round

A permission a Routine raises expires, because nobody is watching. The consequence here is neat
rather than awkward:

- A Routine that screenshots **the app in the agent's own workspace** runs on vouched verbs, raises
  no permission, and works at 3am. That is the feature.
- A Routine that reaches for **the user's screen** raises a permission, nobody answers it, it
  expires, and the run produces nothing. That is the refusal, holding at the exact hour it matters
  most.

No new rule was needed for either, which is the sign the refusal was drawn on the right line.

## Note, 2026-09-05: agent-browser, and the cost of refusing vendor prefixes

Raised by the author after this ticket resolved. `vercel-labs/agent-browser` is a native CLI
(`agent-browser screenshot <path>`), so it is the concrete case for *nothing is added to vouch for
a browser screenshot*, and it shows what that refusal costs.

**Nothing above changes.** A `agent-browser` prefix in `VOUCHED_BASH` would be a vendor's CLI in
blobot's own posture, which is what the answer refused for `playwright` and `puppeteer`, and it
would be worse here: the same binary also does `click`, `fill` and `open`, so a prefix rule would
vouch for driving a browser through arbitrary pages under the agent's control, and only the head of
the command is visible to the rule. That is `gh api`'s shape exactly.

What it costs, stated rather than discovered later:

- On **Claude**, a bare `agent-browser` is unlisted, so it prompts every time. The ways through are
  the ones that already exist and are the user's: a project script (`npm run shot`, vouched at
  `normal`), `npx agent-browser` at `trusting`, or answering *allow always* once.
- On **OpenCode**, `'*': allow` means it runs unprompted at `normal` with no decision by anybody.
  That is the same denylist asymmetry this ticket found for screen capture, arriving benignly this
  time, and it is one more reason the fix above is worth making on its own.

Two things it raises that are **not this map's**:

- Whether blobot should ever **offer to install** a browser tool the way `detect/remedies.ts`
  offers a runtime's own `auth login` on a real pty. It is a coherent idea with a real precedent
  and it is a new effort, not a corner of this one. It would mean blobot naming a vendor, which is
  the whole of the argument in both directions.
- Whether the palette should offer anything here. It should not: ADR-0003's allowlist is built from
  what a person authored, and a browser CLI is neither a skill nor a command.
