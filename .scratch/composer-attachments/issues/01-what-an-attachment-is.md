Type: task
Status: resolved

# What an Attachment is

## Problem

"Attach a file" covers three situations with different right answers, and deciding them
together means the isolation question in the second gets settled as a side effect of wanting
the third to work.

- **(a) A file already inside the Workspace.** `src/model.ts`, a design doc in the repo. Every
  AgentWorkspace already contains a copy. Nothing needs to travel.
- **(b) A file elsewhere on disk.** `~/Downloads/spec.pdf`. Outside every AgentWorkspace.
- **(c) Something with no file at all.** A screenshot on the clipboard — which is what the
  author's own message was. There is no path to name; the bytes are the only thing that exists.

And a second question underneath: is an attachment part of the **Message** or only part of the
**Prompt**? Those are different words in `CONTEXT.md`. A Message is committed, drawn in the
transcript, replayed after a relaunch. A Prompt is what reaches the runtime for one Turn, and
`#withBrief` already puts things in a Prompt that are deliberately not in the Message row.

## Answer

**(c) first, then (b). (a) is a different feature wearing the same word** — path completion,
not attachment — and gets its own effort. (c) is the case with no workaround, since there is no
path to type; (b) is the same machinery plus a file read.

**An Attachment is part of the Message.** Prompt-only would make the transcript lie: a bubble
reading *"what's wrong with this?"* with nothing beside it, on every relaunch. This repo has
refused that shape twice already — the activity column was rebuilt from persisted rows for
exactly this reason, and a restored turn says why it stopped rather than dropping the fact. The
price, stated rather than discovered: it makes blobot the custodian of user files, a
responsibility it has so far avoided everywhere except the team icon.

**The word is Attachment**, entered in `CONTEXT.md` under *Messaging*. *Enclosure* would rhyme
with **Envelope**, and Envelope is peer-only framing — the rhyme would connect the two concepts
that issue 09 says must never meet.

**Every addressed agent gets it.** `@alice @bob @carol` with a screenshot is three Message rows
and three deliveries of the same bytes, at three times the context cost. blobot never decides
who a message is for and never narrows the set the user typed; delivering a quietly different
message to Carol would break that in the most confusing way available. The cost is made visible
instead — issue 07 — and then it is the user's call.
