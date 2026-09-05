Type: grilling
Status: open
Blocked by: 04

# What the frame has to say for a picture to be believable

## Question

Everything in this transcript so far has been text, and text carries its own defeaters: you can
read a paragraph, disagree with it, and notice when it is describing something that is no longer
true. A picture does not work that way. A screenshot in the agent's voice asserts *this is what
your app looks like* and offers the reader no way to ask **when**, **of what**, or **taken how**.

This is the one respect in which the reverse arrow is harder than the inbound one, and it is easy
to miss because the inbound arrow needed none of it: an attachment's provenance is *you attached
it, just now, in the composer*.

The failure this ticket exists to prevent is specific and mundane. An agent screenshots, the build
was stale or the dev server was down or the page was the wrong route, and the user makes a
decision about their product from a picture of something else. blobot provides no inference and
cannot look at the picture to notice, so the frame is the entire defence.

## What it has to settle

- **The minimum honest caption**, and whether there is one at all. Candidates worth arguing:
  when it was taken, which tool produced it, which agent, which workspace, and what the tool was
  aimed at. Some of these blobot knows for certain and some it only has the agent's word for, and
  those two categories must not draw the same. That distinction is this repo's habit already:
  *no pull request* and *we could not look* are separate states, and `measured` rides
  `context_compacted` for exactly this reason.
- **What blobot genuinely knows**, per source from ticket 04. Under option 1 it knows the tool
  name, the `toolCallId`, the agent and the moment the update arrived. It does not know the URL
  unless `rawInput` says so, and `rawInput` is the provider's own and mostly unread by rule.
- **Whether a timestamp is enough on its own.** A transcript is already ordered in time, so a time
  on the frame is either redundant or it is saying something the position does not — which would
  be the case exactly when a picture is old, which is the case that matters.
- **What happens when the agent's words and the picture disagree.** The agent will caption its own
  screenshot in prose, and that caption is the agent's claim, not blobot's. The frame must not
  lend blobot's credibility to it.
- **Whether the user can get at the original.** Being able to open the picture at full size is a
  plain want; whether the frame is also where its facts live, or whether they live only in a
  detail view, is a layout question ticket 08 inherits.

## What is binding

- blobot provides no inference. It cannot describe, caption, summarise, verify or judge a picture,
  and nothing decided here may imply that it did.
- A fact blobot measured and a claim an agent made never draw the same, and the difference is
  visible without hovering anything.
- Never the word *verified*, and nothing that reads as blobot vouching for content.
- No em dashes in anything a user reads.
