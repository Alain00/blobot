Label: wayfinder:map

# Agent media: a picture in the agent's voice

## Destination

A locked set of decisions for **an agent showing the user a picture**: how one arrives from a
runtime, whether blobot lets the agent make it at all, what the frame has to say for it to be
believable, where it draws, what it costs, and what happens on every path where it cannot be
shown.

The map is done when nothing is left to *decide* before someone writes that code. It plans; it
does not build.

Raised by the author, 2026-09-05: *"do agents can have the capability of sending media through
the chat? For example screenshot the app and send the screenshot?"*, then narrowed the same day
to the objective that governs this map: **a coding agent that sends me back screenshots of how
my app looks.**

## What this actually is

blobot already has an arrow for media and it points the wrong way. ADR-0004 built **user to
agent**: embedded never linked, `AgentRuntime.accepts`, refusal at pickup, a thumbnail drawn in
colour. Nothing points back.

The reverse arrow is not a symmetry of it. ADR-0004's whole argument is about **what blobot puts
into an agent's context from outside its AgentWorkspace** — an ungated `Read`, a stable directory
one `Glob` from every team's attachments, a map of the user's filesystem. Showing the user a
picture their own agent made crosses none of that. So ADR-0004 does not forbid this arrow, and it
also does not authorise it: it is silent, and the reasons it gives are unavailable in both
directions.

What makes the objective specific rather than general is the payload. *A screenshot of how my app
looks* is a **claim about the world**. A paragraph can be read and disbelieved; a picture asserts
*this is what your app looks like right now* and offers no way to check when it was taken, in
which workspace, or by what. Text has never needed provenance in this transcript. This does.

And there are two halves that look like one: **the agent has to be able to take the picture**, and
**blobot has to be able to show it**. The second is one line of code away. The first is ticket 14's
question and has never been asked.

## What is already true in the code, measured 2026-09-05

Not assumptions. Each was read out of the repository while charting, and each bounds a ticket.

- **A picture from a runtime is discarded silently, today.** `adapters/acp/session-updates.ts:76`
  takes `textOf(update.content)` and line 77 returns `[]` when it is empty. `textOf` answers `''`
  for every block that is not `{type:'text'}`. So an `agent_message_chunk` carrying an image
  produces **no event at all** — not a dropped picture with a note, an absence.
- **The same is true of tool results.** `textOfToolContent` walks `content` for text and skips
  everything else. An MCP server that returns an image block contributes nothing.
- **This is not hypothetical.** ADR-0003 loads the operator's own MCP servers on every runtime. A
  browser-driving server returns screenshots as image content blocks, and blobot is throwing them
  away right now with nothing on screen saying so.
- **The wire type cannot express a picture.** `adapters/acp/wire.ts` declares
  `ContentBlock = {type?, text?}`. Inbound has a richer shape in `adapters/acp/attachments.ts`
  (`contentBlockOf` emits `{type:'image', mimeType, data}`) and the two have never met.
- **The event vocabulary is ten members of text.** `agent_message_delta` and
  `agent_message_completed` carry `text: string`; the assembler concatenates deltas into a string
  and the whole transcript is built on that.
- **The store is the one part already neutral.** `attachments` is a blob table with a
  `message_attachments` join, and nothing in either row says the user picked it up.
- **A thumbnail in colour is already licensed, narrowly.** `components/Attached.tsx` carries the
  reasoning: saturation is blobot's to spend on blobatars, and *a file the user attached is their
  own content quoted back to them*. An agent's screenshot is not the user's content, so the yield
  does not reach it by inheritance.
- **Half of taking a screenshot is already vouched, by accident.** `import`, `scrot`, `grim` and
  `screencapture` are absent from every list, so they prompt at every level — correct, but by
  omission rather than by decision. `npx` is **not** absent: it is on `TRUSTING_BASH` in
  `adapters/claude/permissions.ts:102`, so at `trusting` and `unattended` an agent already runs
  `npx playwright screenshot ...` without stopping. That is a prefix rule hiding an arbitrary
  verb, which is precisely the reason `gh api` was pulled out of the list on 2026-08-31, and it is
  true today with no picture ever reaching the screen.

## Notes

**Domain.** blobot is a local-first Electron desktop app that assembles teams from the coding
agents a user already has installed. It provides no inference and stores no credentials. See
`CLAUDE.md` for the permanent architectural rules and `CONTEXT.md` for the glossary. They bound
every ticket here and are not up for renegotiation inside one. `DESIGN.md` is binding for
anything a user sees, and this effort spends against its governing rule, so read it first.

**Skills every session should consult:** `/grilling` and `/domain-modeling` by default.
`/research` for ticket 01. `/prototype` where the question is how it looks, which is ticket 08.

**Settled while charting, 2026-09-05.** The first is the author's; the rest are the scope it
implies. Premises, not decisions to revisit.

- **The objective is agent to user, and the payload is a screenshot of the user's own app.** Not
  media in general, not a gallery, not a file the user then has to open somewhere else.
- **Destination is locked decisions**, executed by later build sessions, the way `.scratch/handbooks/`
  and `.scratch/routines/` went. Plan, don't do.
- **Agent to agent is out**, and it is out on a real argument rather than on scope alone — see
  ticket 02. It would be blobot itself carrying bytes across the AgentWorkspace boundary ADR-0004
  exists to defend, and it needs its own ADR, not a corner of this one.
- **blobot screenshotting itself is not this feature.** `--screenshot=<path>` already exists for
  review without a human at the screen. An agent asking blobot for a picture of blobot answers a
  different question than *how does my app look*, and it is listed out of scope below.
- **blobot provides no inference**, so it can never describe, caption, summarise or judge a
  picture. Whatever the transcript says about an image is either the agent's words or a fact
  blobot measured.

## Decisions so far

<!-- one line per resolved ticket -->

- [Which arrow is this, and what does ADR-0004 actually say about it?](issues/02-the-arrow.md) —
  **agent to user is in scope and ADR-0004 is silent on it**: all three of its reasons are
  inapplicable to the reversal, one at a time, in a table on the ticket. Future sessions should not
  cite it against this map. The isolation question turns out to be the wrong worry — an
  AgentWorkspace isolates agents from each other, never an agent from the user who owns the
  repository — and the real finding is that **the risk of this arrow is credibility, not
  confidentiality**, which is why ticket 07 is first-class rather than a detail of 08. One
  invariant is handed to ticket 06 with a test asked for: *nothing hands an agent a path into
  blobot's store*, which is now load-bearing for two features. **Agent to agent is deferred, not
  refused**, and blocked on 07 rather than on scope: the reflex reason (blobot carrying bytes) is
  recorded as *insufficient*, because the mailbox already carries content and `bounds.ts` would
  actually have jurisdiction. What holds is that the character bound cannot transfer, and that a
  peer has no frame to read a provenance answer off. One recommendation left for the author: one
  clause in `message_agent`'s description saying the body is text, since an agent that tries a
  picture today is refused for *length* and told to commit its work.

- [What does a runtime actually emit when a tool produces a picture?](issues/01-what-a-runtime-actually-emits.md)
  — **four runtimes, four different shapes, and no two put a picture in the same place.** Claude
  sends it in ACP's canonical `content` **three times over** (also `rawOutput`, also
  `_meta.claudeCode.toolResponse`); Codex sends it **only** in `rawOutput.result.content`, which is
  MCP's envelope rather than ACP's and never in `content`; OpenCode sends it canonically plus a
  `data:` URL in its own `rawOutput.attachments[]`; **fx stringifies the whole result into a text
  block and truncates it at 200 characters, mid-base64, saying nothing.** So the shared
  `adapters/acp/` half does not cover this — the first thing measured in this repo that it does
  not. Two findings reach further than their own ticket: **`annotations` does not survive**, so
  `audience` and `lastModified` are unavailable and every fact on a frame is one blobot measured or
  one the agent claimed (**ticket 07 unblocked**); and on OpenCode the picture arrived byte-exact
  while the *model* refused it, so blobot can be handed a picture nobody's model ever saw. Cursor
  is uninstalled here and is the one gap. Findings `research/01-the-live-half.md` and
  `research/01-the-protocol-half.md`, raw wire in `research/transcripts/`, harness in
  `research/probe/`.

- [Where does the picture come from, and does blobot ever take it itself?](issues/04-where-the-picture-comes-from.md)
  — **option 3 is impossible and the other two are both taken, because they are two different
  features.** The envelope cannot be filled: an MCP tool's arguments are generated by the model, so
  a 500 KB screenshot would have to be emitted as ~680,000 base64 output tokens. Not expensive,
  *not possible* — a structural fact, recorded so nobody proposes it again. So an agent can only
  ever hand blobot a **reference**. **Option 1 (observe the tool result) is the silent drop fixed,
  not the feature**: it needs a server the operator installed, it is irrecoverable on fx, the model
  may never have seen it, and with `annotations` stripped blobot knows only the tool name and the
  arrival time. **Option 2 (a path in the agent's own AgentWorkspace, through one loopback tool) is
  the objective**: a deliberate act rather than a side effect, working on all five runtimes because
  the picture never touches the ACP wire, sidestepping the model that refused one, and **the only
  option that can answer ticket 07** — reading the file itself, blobot measures the path, the size,
  the mtime, the dimensions and the containment, where option 1 has the runtime's word for
  everything. The containment check protects **not confidentiality but the permission posture**:
  blobot must not become a read primitive that goes around ticket 14. The accepted cost is named
  rather than dodged — screenshots pile up as untracked files in a checkout that can be committed
  home, and every escape from that (a temp dir, a blobot-owned directory) destroys the containment
  argument. Whether blobot deletes the file after reading it is left to the author as its own
  ticket. Build order: 1 then 2, never as stages of one thing.

- [What the frame has to say for a picture to be believable](issues/07-provenance.md) — **the frame
  carries only what blobot measured, and the agent's caption is not in it.** No new rule was needed:
  the transcript already has three voices, so the agent's words draw in the agent's voice above the
  picture and blobot's line contains nothing the agent said. That is also the whole answer to *what
  if the caption and the picture disagree* — nothing, because blobot never lent anything to the
  claim. Under option 2 the frame is the **file's own name**, the **dimensions**, and the fact that
  decides the map: **whether the file was written during this turn or was already there**, from the
  mtime against the turn's start. The mundane failure is a screenshot of a stale build presented as
  current, and that comparison turns an unfalsifiable assertion into a weighable one with no
  inference. Option 1's frame is deliberately **different and poorer** — the tool's name and the
  arrival time, and no age at all, because `annotations.lastModified` was the protocol's answer and
  ticket 01 measured it stripped — and the two must never draw the same, which is *no pull request*
  versus *we could not look* applied again. Bytes go to the gauge; **the branch is refused**,
  because blobot knows the branch now and not the branch when the file was written, and that would
  be the one claimed fact in a line of measured ones. The measurements may not live only behind a
  click: a defeater you have to go and find does not defeat anything.

- [What is this thing called, and what is it not?](issues/03-the-word.md) — **it is a Picture, the
  Agent shows it, and the user performs no verb at all.** *Attachment* cannot be reused because one
  word would then mean two directions, which is the mistake *memory* is banned for. *Screenshot* is
  the honest domain word and is refused as the **type name** on the map's own governing finding:
  under option 1 the bytes are whatever an operator's MCP server returned, so calling them a
  screenshot is blobot claiming something about content it has no inference to check — it stays the
  **agent's** word, in the agent's voice, where a claim about content belongs. *Exhibit* fits ticket
  02's credibility framing and loses on register. **Media does not survive** and appears nowhere in
  the app; the directory keeps its path because a path is not vocabulary. The two sources are named,
  because 06, 08 and 10 would each have invented one: a **shown** Picture was handed over
  deliberately as a path in the Agent's own AgentWorkspace and is measured, an **observed** Picture
  was lifted out of a tool result blobot was watching and its model may never have seen it. The
  collision with the verb is the point. Ticket 10's state is **not drawn**, always with the reason
  in the same line and never a noun on its own, because a noun would let a session ship the noun
  without the reason. `CONTEXT.md` written, beside **Attachment**, where the contrast is.

- [How a picture travels, and what is left behind](issues/06-how-a-picture-travels.md) — **an
  eleventh member that never carries bytes, one member for both sources, and a table of its own.**
  Blocks on `agent_message_completed` are refused on a stronger ground than the ripple through the
  assembler, the `NOT NULL` text column, compact context and `bounds.ts`: under option 2 **there is
  no message to hang them on**, since a shown Picture arrives as a loopback tool call while the
  agent is saying nothing. So `picture_arrived`, beside `agent_message_sent` and
  `context_compacted`, named neutrally because *shown* is the agent's verb and half of these were
  not shown by anybody. One member with a required `source`, not two, because the difference is a
  field and two types drift; `toolCallId` is on both, since a shown Picture is a call too. **The
  bytes are written to the store before the event exists** and the event carries an id, which is
  `Attached.tsx`'s precedent tested rather than assumed and harder here, because the agent decides
  how many Pictures a transcript has. A `PictureStore` interface declared in core and implemented
  in main is held by the **adapter** for an observed Picture and by the **orchestrator** for a shown
  one, so no bytes-carrying event exists to forget to strip. `ContentBlock` gains `data`/`mimeType`
  inside `adapters/acp/`; the canonical reader is shared, Codex's and OpenCode's are their own,
  Claude's three copies need a de-duplication test, and **whether fx's truncation is even
  detectable is handed to ticket 10 as a question rather than an assumption**. A `pictures` table
  rather than `attachments`, because the join's whole reason is a fan-out that never happens here
  and the columns are not the same; ticket 02's *nothing hands an agent a path into the store*
  survives, with the test it asked for. Deletion keeps the transcript, a full clean already recovers
  the agent's own file, and no new figure is invented. A resumed session draws from the store and
  **never re-reads the file**. And `MockAgentRuntime` has to be able to produce one, in both
  sources, including the ugly cases.

- [Where it draws, and saturation spent a second time](issues/08-where-it-draws.md) — **the
  picture, then one mono line, and nothing else.** Prototype at `prototypes/08-picture.html`. Two
  instructions from the author govern it: the **thumbnail must be shown**, and **nothing may explain
  or expose what the thumbnail already shows** — *the human is not stupid* — which narrows ticket 07
  in an amendment there. The test is now one question per fact, *can the reader see it in the
  picture*, and it **cuts the dimensions** that ticket argued in as free. What is left is
  `login-page.png · written during this turn` and `from playwright_screenshot`. **Saturation is
  spent a second time**, on the picture's own pixels and stopping at its edge: the content is the
  user's own work, blobot emits no signal by drawing it, and grey defeats the only question the
  picture exists to answer. **An observed Picture is in colour too**, on a rule rather than a shrug:
  colour must not carry provenance when the two frames already carry it in words. Not a chip, full
  column width, scaled and **never cropped**, click for natural size and no other control. **The
  fold needed no new rule**: *what the principal said to you is never in the block* already lifts a
  Picture out, and the shut line keeps counting only the calls. Team pane draws it **identically**,
  because a Picture folds into nothing and is false about nobody — the opposite of `WORKSPACE`'s and
  a Handbook's answers, and for a stated reason. It does not animate. Two `DESIGN.md` amendments,
  the second wider than this feature: **blobot does not caption what the reader can see.**

- [Can the agent take the picture at all, and who says so?](issues/05-can-the-agent-even-take-it.md)
  — **blobot adds nothing to enable this, adds one permanent refusal, and two of the ticket's three
  premises were wrong.** The **screen is off limits at every level, permanently**, and it is the
  first entry on that list argued from **privacy** rather than destructiveness or reach: it undoes
  nothing and photographs everything the person has open, a frame in a context window cannot be
  recalled, and the person whose privacy is spent is often not the one who typed the prompt. It is
  also the one verb that reaches **outside the AgentWorkspace entirely**, which is where ticket 02's
  *the recipient owns the repository* stops working — a user owns their screen and not everything on
  it. The class is anything reaching the display server, capture and input injection alike, with
  `ffmpeg` among them for `gh api`'s reason. **The correction: on OpenCode they are allowed today.**
  The ticket said they prompt everywhere by omission; that is true of Claude's **allowlist** and
  false of OpenCode's **denylist**, where `'*': allow` minus twenty patterns makes absence the
  unsafe outcome and `grim` runs unprompted at the default level. A live defect, this ticket's to
  fix, and the general lesson with it: *safe by omission on one runtime is unsafe by omission on the
  other*. **`npx` is not the `gh api` case and stays**: `gh api` reached a capability nothing else
  vouched for, while `npx` composes from `npm install` and `node`, both vouched at the same level.
  The real thing of that shape is `node` and `python` at `normal` running arbitrary code, which is
  deliberate and stated — *a speed bump, not a boundary*. **Nothing is added for a browser
  screenshot**, because `node` and `npm run` already run one and a `playwright` prefix would put a
  vendor's CLI in blobot's posture. The operator's MCP browser server keeps prompting, correctly,
  which is the second argument that option 1 is the drop fixed and not the feature. `allow always`
  is named as the one route past the refusal and is the user's own act, per agent and revocable.
  And a Routine lands right way round: the in-scope version runs at 3am on vouched verbs, the
  out-of-scope one expires unanswered.

- [What it costs, and the part blobot cannot bound](issues/09-what-it-costs.md) — **the objective
  costs the agent nothing, so nothing is drawn under the gauge.** The ticket's premise was written
  before ticket 04 split the feature and is half wrong: under option 2 the picture **never enters
  the agent's context**, the tool call carries a path and the agent pays for a filename. An observed
  Picture was already paid for before blobot saw the update, so blobot observing it adds nothing.
  The ticket asked how to word a figure apart; the answer is not to draw one, since
  `attachments · 2 · 480 KB` is worded apart for being blobot's own act at a different cadence and
  this is not blobot's act at all. Tokens are never claimed: for the objective the true answer is
  zero and for the other half it is unknowable. **The one real bound is disk, the app's first**,
  refused at the loopback boundary in words for a shown Picture and, for an observed one that cannot
  be refused, drawn as *not drawn*. Its constant is its own with its own argument, not
  `IMAGE_ATTACHMENT_LIMIT`, whose reasoning is about a wire nothing here crosses. No standing total
  anywhere; bytes appear only in the sentence that refuses. **Compaction is untouched and blobot
  must not say otherwise** — a line saying pictures were lost would assert a gap blobot cannot see.
  What was actually invisible was never a number: it is the picture, and the transcript showing it
  is the disclosure.

- [The silent drop, and every other way this fails](issues/10-the-silent-drop.md) — **one state, one
  sentence, one line per turn per agent, and the fx case is a measurement nobody has made.**
  `a picture from bob · not drawn · <reason>`, in the agent's own column, the one case in this
  feature that is text alone because there is nothing to see. It **counts** rather than repeating,
  collapsed by turn, agent and reason, so a screenshot loop is `4 pictures from bob` and not four
  apologies; two reasons are two lines, because an averaged reason is not a reason. The catalogue is
  **five** states and the first merges three mechanisms deliberately, since a reader cannot act
  differently on *truncated* than on *corrupt* and the mechanism would be the banned protocol enum.
  **fx is left open on purpose**: ticket 04 assumed blobot can tell a truncated base64 fragment from
  prose, nothing has measured it, and a heuristic that misfires draws a false claim over an ordinary
  sentence — worse than the silence. If it is not detectable, fx keeps the silent drop on that path
  and it is a written gap. A shown Picture is refused in words at the tool boundary; an observed one
  **cannot be**, so the agent carries on believing the user saw something they did not — a second
  reason the two sources must never draw the same. No apology, no control, no retry. `accepts` needs
  no counterpart, confirmed: blobot never asks for a picture. Three canaries, and **it ships first**,
  because it is the only part of this map that is a defect.

**The map is complete. Ten tickets, all resolved, frontier empty.** Nothing is left to decide
before this code is written; do not run `/wayfinder` on it.

**Build order**, and the three are not stages of one thing:

1. **Ticket 10's silent drop**, which is a defect and true today. It needs ticket 06's event and
   store and nothing else.
2. **Ticket 04's option 1**, the observed Picture, with its own poorer frame.
3. **Ticket 04's option 2**, the shown Picture through the loopback tool, which is the objective.

**Two things a build session must not wait for this map to start.** Ticket 05 found that screen
capture is **unprompted on OpenCode** at the default trust level, which is a live posture defect and
not this feature's. And ticket 01 found that `AgentRuntime.accepts` may be lying on OpenCode, which
is a defect against ADR-0004.

**One question is deliberately left open**, on ticket 10: whether fx's truncated block is detectable
at all. It is a measurement, not a decision, and guessing at it would put a false line in the
transcript.

## Found on the way, and not this effort's

- **`AgentRuntime.accepts` may be lying on OpenCode.** It is built from
  `promptCapabilities.image`, which OpenCode advertises as `true`, while the model behind it
  refused image input during ticket 01's run. If it reproduces with a pinned model, the composer
  is letting a user attach a screenshot to an agent that cannot read one, which is a defect in
  shipped behaviour and a ticket against ADR-0004 rather than against this map.
- ~~**`npx` is on `TRUSTING_BASH`.**~~ **Withdrawn by ticket 05, 2026-09-05.** It is not the
  `gh api` case: `gh api` reached a capability nothing else vouched for, and `npx` composes from
  `npm install` and `node`, both vouched at the same level. Removing it would take a keystroke and
  no capability. Left here struck through rather than deleted, because it was charted as a finding
  and a later session should meet the correction rather than the claim.
- **Screen capture is unprompted on OpenCode**, at `normal`, today. Found by ticket 05 while
  checking the opposite claim. `BASH_PERMISSIONS` is `'*': allow` minus a list and the whole
  display-server class is absent from it, so `grim`, `scrot` and `import` run with no prompt. The
  fix is written on that ticket and belongs to a build session, ahead of this map's own feature.

- **`vercel-labs/agent-browser`**, raised by the author 2026-09-05. Apache-2.0, a native Rust CLI
  that is both an MCP server and a plain `agent-browser screenshot <path>` command. It is the first
  concrete tool offering **both** of ticket 04's options at once, and the CLI half wins on every
  axis that ticket already used, which is a confirmation rather than a change. Notes on tickets 04
  and 05. It is **not** a dependency this map takes on: blobot builds nothing, installs nothing and
  names no browser. One idea it raises is genuinely new and is **a separate effort**: whether blobot
  should ever offer to *install* a browser tool the way `detect/remedies.ts` offers a runtime's own
  `auth login` on a real pty.

## Fog

Named because it is unresolved, not because it is out of scope. A ticket may pull one of these
in if it turns out to be blocking.

- **Video, audio and PDF.** ADR-0004 refused PDFs inbound on the grounds that the failure is
  silent. The outbound direction has no such argument available, because blobot is the renderer.
  `AudioContent` is in the protocol beside `ImageContent` with the same shape, so it is reachable
  on the same path with no extra work by any runtime that wants it. Left alone until a still
  picture works.
- **A picture in a Routine run.** A run gets three turns and nobody is watching. A screenshot
  produced at 3am is the strongest case for this feature and the weakest case for a permission
  prompt, and it is downstream of ticket 05.
- **A picture the user then wants to keep.** Saving one out of the transcript is a plain want with
  a real objection: the artifact viewer's usual rules do not apply here, but a *save as* dialog is
  a new surface.
- **Whether a picture belongs in a Handbook.** An entry is text and bounded in characters. A
  screenshot of the app as it looked in week one is exactly the durable-and-not-in-the-files test
  ticket 09 of that effort wrote, and it fails the bound by three orders of magnitude.

## Out of scope

Ruled beyond this destination while charting. These do not graduate; they return only as a fresh
effort.

- **Agent to agent media.** Ticket 02 records the argument.
- **An agent screenshotting blobot itself.** It means an agent driving the user's display server,
  wholly outside its AgentWorkspace, to photograph the app that is supervising it. Whatever the
  answer is, it is not reached from *how does my app look*.
- **blobot resizing, cropping or recompressing a picture.** ADR-0004 refused this inbound with an
  argument that survives the reversal unchanged: a downscaled screenshot of a stack trace is a
  wrong line number with no visible cause.
- **blobot taking a picture of the user's app on its own initiative.** The app blobot can see is
  its own window. Anything else means driving a browser, which is an agent's job.
- **A media panel, gallery, or any second place a picture lives.** The transcript is where the
  agent speaks.
