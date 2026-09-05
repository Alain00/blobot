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

**Frontier: 03 and 04.** 04 is the crux: 05, 06, 07, 08 and 09 all list it. Ticket 07's
*measurement* dependency is discharged (`annotations` do not survive), but it stays blocked on 04
because what blobot knows depends on where the picture came from.

## Found on the way, and not this effort's

- **`AgentRuntime.accepts` may be lying on OpenCode.** It is built from
  `promptCapabilities.image`, which OpenCode advertises as `true`, while the model behind it
  refused image input during ticket 01's run. If it reproduces with a pinned model, the composer
  is letting a user attach a screenshot to an agent that cannot read one, which is a defect in
  shipped behaviour and a ticket against ADR-0004 rather than against this map.
- **`npx` is on `TRUSTING_BASH`.** A prefix rule hiding an arbitrary verb, which is what `gh api`
  was removed for. Ticket 05 found it and says it is not this feature's to fix quietly.

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
