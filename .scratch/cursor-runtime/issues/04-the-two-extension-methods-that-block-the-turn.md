Type: task
Status: open

# The two extension methods that block the turn

## Problem

Cursor sends five ACP extension methods, and two of them are blocking: "the agent waits for a
response before continuing".

| Method | Type | What it wants |
| --- | --- | --- |
| `cursor/ask_question` | blocking | Multiple-choice questions put to the user |
| `cursor/create_plan` | blocking | Explicit approval of a plan |
| `cursor/update_todos` | notification | Todo state |
| `cursor/task` | notification | A subagent finished |
| `cursor/generate_image` | notification | An image was generated |

The three notifications are free to ignore. The two blocking ones are not: a client that does not
reply leaves the agent waiting forever, and blobot's transcript would show an agent that simply
stopped. This is the same failure ticket 14 already reasoned about for permission requests, where
the answer was that with nobody listening a request is **cancelled, never allowed**, and it is the
same answer here -- but only after deciding whether blobot should listen.

`cursor/ask_question` is the interesting one, because blobot has a position on it. The rail says
who the team is talking to, the composer addresses agents by name, and the most recent work
**refused a coordinator that would have decided for you**. An agent putting a genuine question to
the user is not an alien idea in this product; it is a thing the product has an opinion about.
The question is whether it arrives as a Cursor-shaped multiple-choice widget, which would be
provider-specific UI and the permanent rule forbids that outright.

## What to do

Answer both, and write the reason where the adapter can be read.

For `cursor/ask_question`, the two candidates:

1. **Answer it with a refusal, in the agent's own channel.** Reply that no user is available and
   let the agent decide with what it has. Cheap, honest, and the same posture ticket 14 takes when
   nobody is listening. It costs the user a decision they might have wanted to make.
2. **Render it as a transcript block.** blobot already has one inline decision block, with exactly
   two options, in the transcript's own voice. A multiple-choice question is a generalisation of
   it. This is real UI work, `DESIGN.md` governs every part of it, and it must be built as
   *blobot asks a question* rather than *Cursor asks a question* -- because the moment a second
   runtime grows the same idea, the block has to already be provider-agnostic.

Start with 1, because it unblocks the adapter and cannot be wrong in a way that traps anyone, and
raise 2 as its own effort if the refusal turns out to be common in practice rather than rare.

For `cursor/create_plan`, the same fork, with the added note that blobot never approves a plan
silently. An unanswered plan request must not become an approved plan.

Whatever is chosen, an unknown blocking extension method must get an error reply rather than
silence, so a future Cursor release adding a sixth method degrades into a visible refusal instead
of an agent that hangs.
