Type: grilling
Status: open
Blocked by: 04, 06

# What it costs, and the part blobot cannot bound

## Question

Every figure under the `CONTEXT` gauge today is something **blobot injected**: the persona and its
two parts, the wake batch, the peer-message breakdown, `attachments · 2 · 480 KB · sent this
session`. `orchestrator/bounds.ts` is the rule behind all of them, and its scope is exactly that —
what blobot is allowed to put into an agent's context.

An agent's screenshot is outside that scope, and this is the uncomfortable part of the whole
effort. A tool result flows between the agent and its runtime. blobot **observes** it. It cannot
refuse it, cannot truncate it, cannot resize it, and cannot stop an agent that screenshots forty
times in a loop from filling its own context window with pictures. `bounds.ts` has no jurisdiction
here and pretending otherwise would be the dishonest move.

So the question is not *what is the limit*. It is *what can blobot honestly say about a cost it
does not control*.

## What it has to settle

- **Whether anything is drawn at all**, and where. The gauge is observation only and has been since
  it shipped, which makes it the right home for a cost blobot can only watch — but the attachments
  line sits beside figures blobot chose, and a number that looks like the others while meaning
  something entirely different is worse than no number.
- **The wording, given the figure is not blobot's.** The attachments line is already the one worded
  apart because it is not per-turn. This is worded apart for a second, different reason.
- **Bytes or tokens.** Attachments are shown in bytes and never tokens, deliberately. An image's
  token cost is a model-specific function of its dimensions that blobot cannot compute without
  knowing things it does not know, so bytes is probably the honest unit again, and the ticket
  should say so rather than inherit it.
- **What ticket 01 measured.** If pictures reaching the model are already being paid for today,
  then this ticket is about **revealing an existing cost**, not adding one, and that framing
  changes what is worth drawing.
- **Whether blobot bounds what it puts in its own store**, which is the one thing it does control.
  A ceiling there is real and enforceable and is not a context bound at all — it is a disk bound,
  and it is the first one in the app.
- **Whether the compaction machinery is affected.** A session full of screenshots hits the working
  ceiling from `.scratch/transcript-scale/` faster, and the handoff turn asks an agent to write down what matters. A picture
  cannot travel through a handoff, which means compaction is lossy in a new way and the transcript
  may owe the user a sentence about it.

## What is binding

- The gauge advises nothing, warns nothing, and blocks nothing. Observation only, monochrome.
- No bar. A figure that knows its end is still a figure.
- blobot does not resize, recompress or crop. ADR-0004, and the argument survives the reversal.
- blobot states a cost and does not manage it — ADR-0004's own consequence, which is the closest
  precedent this ticket has.
