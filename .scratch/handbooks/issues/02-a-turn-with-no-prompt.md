Type: research
Status: resolved

# Will the four runtimes take a turn with no words in it?

## Question

The interview control sends **nothing** into the transcript. That was the author's own
correction and it is binding: there is no third party in the room, so no blobot-composed prompt
may appear in the conversation. The agent opens because its persona says it is unbriefed.

Mechanically that is a turn with an empty prompt, and blobot has never run one. Every turn in the
app so far carried at least one content block: the user's words, a peer message, a Routine's
stored prompt, or the handoff request. This ticket finds out what actually happens, against real
CLIs, before anything is designed on top of it.

## What to find out, per runtime

Claude Code, OpenCode, Codex and fx, in that order, since the first is the one `--live-claude`
already exercises:

1. Does `session/prompt` with an **empty `prompt` array** return, stream, or error? ACP's schema
   may not even permit it — check the type before spending a token.
2. If it is refused, what is the cheapest thing that is *not* refused and still puts no blobot
   words on screen? Candidates: a single empty text block; a block carrying only whitespace; a
   prompt that exists but is **not rendered** by the renderer, the way `composeLeadBrief`
   replaces the wake prompt's roster line and never enters the `messages` row.
3. **fx is the one to watch.** Its persona has no channel at all and rides the prompt on every
   turn, so an "empty" prompt on fx is already not empty — it is the persona. Whether that alone
   makes the agent open is worth measuring rather than assuming.
4. Codex stores `developer_instructions` on the session. Confirm the empty-state sentence is
   present on turn 1 there, since that is where the interview has to come from.

## Why this is research and not design

Every design downstream of it has a different shape depending on the answer. If a wordless turn
is impossible on any of the four, then the third option above — a prompt that exists on the wire
and is never drawn — becomes the mechanism, and that has its own consequence: it is blobot's
words in the agent's context even though nobody can see them, which is a thing to decide
knowingly rather than discover in an implementation.

## Deliverable

A findings file under `.scratch/handbooks/research/`, with raw transcripts alongside, in the shape
`.scratch/first-demo/research/` uses. Cite it rather than re-deriving it.

## Answer

**A wordless turn is not available. The control sends a minimal instruction on the wire that is
never drawn.** Resolved 2026-08-31, measured against all four real runtimes on this machine.
Findings and versions: `../research/02-empty-prompt.md`.

### What was measured

`initialize` → `session/new` → `session/prompt` with `prompt: []`, spoken directly over stdio.

The schema permits it: `PromptRequest.prompt` is `type: array` with **no `minItems`**. So all four
behaviours below are the agent's own choice rather than a validation the protocol forced.

- **Claude Code** (bridge 0.70.0) — accepted, `end_turn`, 17 output tokens, *"I'm ready — what
  would you like me to work on?"*
- **Codex** (bridge 1.7.0) — accepted, `end_turn`, 16 output tokens, *"What would you like me
  to..."*
- **OpenCode** (1.18.4) — accepted, and **confabulated**: invented a task nobody asked for, called
  `read` twice, raised two permission requests for paths outside the cwd, and had not returned
  after 90 seconds.
- **fx** (0.0.7) — **refused**, `-32602 "Empty prompt"`, a parameter validation before any model
  call.

### Why that settles it

**One hard refusal is enough.** fx rejects the empty prompt before inference, so no persona, no
config and no adapter trick can rescue it there, and blobot does not ship a mechanism that three
runtimes support and the fourth cannot. The governing rule cuts the same way: a control whose
behaviour depends on which runtime is behind it is provider knowledge above the adapter.

**And it would be the wrong mechanism even where it works.** Claude and Codex both did the graceful
thing with no persona at all, which is a good sign for the design. OpenCode shows what an undefined
prompt actually is: a vacuum the model fills. Its persona was absent in the probe and would very
likely have guarded it — that is exactly what ticket 04's conditional is for — but the measurement
stands on its own. **An empty prompt carries no instruction, and a model with no instruction does
not reliably wait.**

### What the control sends

**A minimal instruction, on the wire, never drawn.** Blobot's words reach the agent's context; they
do not enter the `messages` row and they do not appear in the transcript.

This is `composeLeadBrief`'s arrangement exactly — composed by blobot, carried on the turn, and
invisible — which is already accepted for the lead. The author's binding rule is that **there is no
third party in the room**, and that rule is about the conversation the user reads. Nothing here
appears in it: the first words on screen are still the agent's own.

Rejected:

- **A visible prompt**, in the user's voice or under a `system` line. That is the third party the
  author threw out, and the reason has not changed.
- **A single space, or a whitespace-only block.** It satisfies the letter of *no words* while
  passing fx's validation on a technicality, and it leaves OpenCode in precisely the vacuum
  measured above. The worst of both.

**Ticket 04's conditional stays the real mechanism.** The persona already knows what to do with a
turn that arrives with no work in it; this prompt is only the knock on the door.

### Two findings for other tickets

**An empty turn is not a free turn.** Claude reported **36,451 total tokens and $0.21** for
seventeen output tokens, because a turn pays for the whole cached system prefix whatever the prompt
contains. Anything that reasons about what briefing costs should start from that, not from the
output.

**The persona is what keeps a runtime on the rails**, and this is the first direct evidence of it.
The confabulating run had no persona; the two graceful ones had none either and behaved anyway.
That is not a guarantee, and it is the argument for ticket 04's conditional being explicit rather
than trusting a model to wait politely.
