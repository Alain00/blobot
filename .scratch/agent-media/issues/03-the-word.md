Type: grilling
Status: open
Blocked by: 02

# What is this thing called, and what is it not?

## Question

`CONTEXT.md` has **attachment**, and it means something precise: a file the user picked up in the
composer, embedded in a prompt, refused at pickup if it is too big. The word is load-bearing
inbound and every sentence in ADR-0004 leans on it.

A picture that comes back the other way is not that. Nobody attached it. It was not picked up, it
cannot be refused at pickup, there is no composer anywhere near it, and the person who decides it
exists is the agent. Reusing *attachment* for it would make one word mean two directions, and this
repo has already paid for that mistake once: *memory* is banned in blobot's mouth for the same
reason.

## What it has to settle

- **The noun.** What the agent produced, in blobot's vocabulary. Candidates worth grilling rather
  than a list to pick from: it is a thing *shown*, not a thing sent; it is evidence more than it is
  a file; and the domain word people already use is *screenshot*, which is honest and narrow and
  might be too narrow the first time a runtime hands back a chart.
- **The verb**, if there is one, and whether the user ever performs it. Inbound has *attach*.
  Outbound may have no verb at all, which is a real answer: the agent shows you something, and you
  do not do anything.
- **What the state is called when there is one and it could not be drawn.** Ticket 10 needs a word
  for this and it should come from here, not be invented there.
- **Whether *media* survives.** This map's own directory is called `agent-media` and that is a
  placeholder, not a decision. *Media* is a category name, not a thing a person says about a
  screenshot of their app.
- **What blobot must never call it.** Inbound already has this discipline: `Attached.tsx` says
  *pasted image* for a file with no name, and refuses to invent `pasted-image-1.png`. The
  equivalent trap here is naming a picture after the tool that made it and implying that is its
  filename.
- **`CONTEXT.md` written**, with the word, its scope, and what it is not — the way ticket 01 of
  `.scratch/handbooks/` wrote *Handbook*, *entry*, *to brief* and *unbriefed*.

## What is binding

- One word, one direction. Whatever is chosen must not also describe an inbound attachment.
- No em dashes in anything a user reads.
- blobot never says *memory*, and the same instinct applies to any word that promises the app
  understands what is in the picture. It does not; it provides no inference.
