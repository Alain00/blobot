Type: grilling
Status: resolved
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

## Answer

**The objective costs the agent nothing, so nothing is drawn under the gauge. The one bound that
exists is a disk bound, and it is the first in the app.** Resolved 2026-09-05, and the ticket's
premise turned out to be half wrong in a way that makes the answer much smaller.

### The premise was written before ticket 04 split the feature

This ticket assumed a picture flows between the agent and its runtime and blobot only watches. That
is true of an **observed** Picture and false of a **shown** one, which is the objective.

Under ticket 04's option 2 the picture **never enters the agent's context at all**. The tool call
carries a path and returns a short acknowledgement. The agent pays for a filename. There is no
image in the session, no tokens spent on pixels, and nothing for a gauge to report.

So the uncomfortable framing this ticket opened with — *blobot cannot bound a cost it does not
control* — applies only to the half of the feature that is the **defect fix**, and there the cost
was already being paid before blobot did anything. One more reason option 1 and option 2 are two
features and not two stages.

### Nothing is added under the gauge

Not per turn, and not cumulatively.

- A **shown** Picture costs the session nothing, and a figure of zero is worse than no figure.
- An **observed** Picture was already in the tool result. The model consumed it, or did not
  (OpenCode), before blobot saw the update. blobot observing it adds **nothing at all** to what the
  agent pays, so a line under the gauge would be blobot reporting a cost it neither caused nor
  measured, sitting among figures it chose. The ticket asked whether to word it apart. The answer
  is not to word it apart, it is not to draw it: `attachments · 2 · 480 KB · sent this session` is
  worded apart because it is blobot's own act at a different cadence, and this is not blobot's act
  at all.

And blobot **cannot** compute the number honestly even if it wanted to: an image's token cost is a
model-specific function of its dimensions, which is the same reason attachments are drawn in bytes.
Here it is stronger, because for the objective the true answer is zero and for the other half it is
unknowable. Bytes stay the unit anywhere a size is said, and tokens are never claimed.

### The one real bound is disk, and it is enforceable

The thing blobot controls is what it writes into its own store, and that is not a context bound at
all. It is the app's **first disk bound**, and it should be named as one rather than dressed up as
a context figure.

**A shown Picture is refused at the tool boundary, in words, before anything is stored.** blobot
opens the file, so it knows the size before it commits to it, and this is the same shape as every
other refusal in the app: the peer-message bound, the Handbook bounds, an attachment refused at
pickup. Never truncated, never resized, never cropped — ADR-0004's argument survives the reversal
unchanged. The agent called a tool, so there is a boundary to refuse at and a caller to tell.

**An observed Picture cannot be refused**, because it already happened and the agent already paid.
Over the ceiling, blobot does not store it and the transcript says the picture is **not drawn**
with the reason, which is ticket 10's line and not a new state.

`IMAGE_ATTACHMENT_LIMIT` is 4 MB and its reasoning is about what a provider accepts and what fits
on one stdin line. Neither applies here: nothing crosses the wire. The number for a Picture is its
own constant with its own argument, which is *what a screenshot of a screen actually weighs*, and
it should be set generously rather than borrowed. A full-page PNG at retina width is routinely over
4 MB and refusing it would refuse the ordinary case.

**No standing total is drawn anywhere.** A *your transcripts hold 300 MB of pictures* line would be
a figure nobody asked for, on a surface with no action beside it, and whether a retention policy
exists is ticket 06's note and not this one's. Bytes therefore appear in exactly one place: the
sentence that refuses a picture, where they are the reason.

### The worktree, which is not blobot's to count either

A shown Picture leaves a file in the AgentWorkspace, and ticket 04 accepted that cost explicitly.
It is already counted where counting it is true: a full clean measures worktrees and reports what
it recovers, so a team whose agents took two hundred screenshots says so in gigabytes at the moment
the user is deciding. Nothing new is needed and nothing new should be added.

### Compaction is not affected, and blobot must not say it is

The ticket asked whether the transcript owes the user a sentence about pictures being lost across a
handoff. It does not, and the reason splits the same way everything else here does:

- A **shown** Picture was never in the session, so a fresh session loses nothing that it had.
- An **observed** Picture was in the session and does not survive a handoff. But blobot writes no
  summary, does not read the picture, and does not know whether the agent's handoff carried what
  mattered about it in words. A line saying *pictures were lost* would be blobot asserting a gap it
  cannot see, next to `context_compacted`, which already says a session was replaced and why.

That refusal is the same one this map has made three times: blobot states what it measured and
claims nothing else.

### What is actually revealed, and it is not a number

Ticket 01 measured that pictures are reaching runtimes today and blobot is discarding them. So the
honest reading of this ticket is that the cost already exists and is invisible, and what fixes the
invisibility is **the picture appearing in the transcript**, not a figure. A user who can see that
their agent took forty screenshots in one turn has been told the cost in the only unit that means
anything here.
