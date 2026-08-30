# Attaching a file in the composer

Raised by the author, 2026-08-30, with a screenshot of the composer: *"check how do we do to
attach files in the composer"*. Grilled to a settled tree the same day; every decision below
has a ticket carrying its reasoning.

Today: nothing. The composer sends a string. `blobot:prompt` takes `(agentIds, text)`,
`promptFromUser` commits one `messages` row whose `body` is that string, and both adapters send
`prompt: [{ type: 'text', text }]`. There is no paperclip, no paste handler, no drop target, and
no column an attachment could live in.

## What the protocol already allows

ACP's prompt is an array of content blocks, and the baseline every agent must accept is **text
and `resource_link`**. `image`, `audio` and `embeddedContext` are opt-in and advertised on
`initialize`. Both runtimes on this machine advertise the two that matter, observed in the
checked-in transcripts rather than assumed:

- `@agentclientprotocol/claude-agent-acp` 0.70.0 — `promptCapabilities: {image: true, embeddedContext: true}`
  (`.scratch/first-demo/research/15-transcripts/`)
- OpenCode 1.18.4 — `promptCapabilities: {embeddedContext: true, image: true}`
  (`.scratch/first-demo/research/03-transcripts/`)

`packages/core/src/adapters/acp/wire.ts` declares `AgentCapabilities` with `loadSession` alone,
so blobot reads neither today. That is the seam issue 05 opens.

## What is binding

- **Agents are isolated by AgentWorkspace, never by convention.** `CLAUDE.md`. An attachment
  the user drags in from `~/Downloads` is in no agent's worktree, and handing over a `file://`
  path to it is blobot granting reach outside the copy. Issue 02 is exactly this, and it is
  sharpened by a fact from `adapters/claude/permissions.ts:35` — *"`Read`, `Glob` and `Grep` are
  absent because Claude never prompts for them"*. A path handed to an agent is read with **no
  permission gate at any trust level**. There is no version of "link to it and let the user
  approve the read".
- **blobot writes nothing into the user's repository.** The reason `permissions.ts` hands
  `allowedTools` over the wire instead of writing a settings file, and the reason OpenCode's
  persona travels in `OPENCODE_CONFIG_CONTENT`. It rules out copying an attachment into the
  workspace without further argument.
- **Never a full context copy; always compact context.** Enforced at `orchestrator/bounds.ts`.
  An attachment is the largest thing a user can put into an agent's window, and it arrives with
  no bound at all unless one is written. Issue 03.
- **The UI is provider-agnostic.** Whatever the composer knows about what a runtime accepts is
  blobot's own word, the way `TrustLevel` is. Issue 05.
- **A message lands in exactly one agent's session**, N times on a fan-out (ticket 05, and
  `team-addressing/02`). One file attached once, addressed to three agents, is three rows and
  three deliveries. blobot never narrows a set the user typed. Issue 01.
- **The blobatars are the only saturated thing on screen.** `DESIGN.md` — **amended by issue 07**,
  which is the one rule this effort changes rather than obeys.
- **Every control descends from the composer.** `DESIGN.md`, *Controls*.

## Out of scope

- **Attaching a file that is already in the Workspace.** `src/model.ts` is already in every
  AgentWorkspace; the honest mechanism is naming the path so the agent opens it itself, which is
  a composer *completion* feature (`@`-for-files, like the `/` palette) and not an attachment.
  Its own effort. Folding it in here would let *"the agent can already see it"* quietly justify
  handing over outside paths too. See issue 01.
- **Attaching to `message_agent`.** Issue 09, written as a refusal rather than left open.
- **Audio.** Advertised by neither runtime here.
- **blobot reading, resizing or summarizing what was attached.** No inference, and no image
  processing: what is attached is what is sent. Issue 02.
- **Per-team drafts.** The composer's draft already follows the user between teams, undecided
  rather than designed. Named in issue 06 and left as its own ticket.

## Issues

- `01-what-an-attachment-is.md` — the case, the aggregate it belongs to, the word, the fan-out.
- `02-embed-never-link.md` — the pivot, and why blobot does not resize.
- `03-what-may-be-attached-and-how-big.md` — the kinds, two ceilings, and the refusal.
- `04-where-the-bytes-live.md` — a blob in SQLite, shared across a fan-out, and `VACUUM`.
- `05-the-runtime-seam.md` — `Prompt.attachments`, `accepts`, block order, and the mock.
- `06-getting-a-file-in.md` — paperclip, paste, drop, and who reads the bytes.
- `07-the-chip-and-the-bubble.md` — the DESIGN.md amendment, and saying what a fan-out costs.
- `08-what-the-gauge-says.md` — accounting for something that has no characters.
- `09-a-peer-cannot-attach.md` — the refusal, and the reason it is not a limitation.
