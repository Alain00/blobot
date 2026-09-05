Type: grilling
Status: resolved
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

## Answer

**The frame carries only what blobot measured, and the agent's words stay in the agent's voice
where they always were.** Resolved 2026-09-05, downstream of ticket 01's measurement that
`annotations` do not survive and ticket 04's split into two sources that know different amounts.
Exact wording is proposed rather than settled and is marked.

### The frame is blobot's voice, and the caption is not in it

The ticket asked what the minimum honest caption is. The answer is that **blobot writes no
caption at all.**

An agent will describe its own screenshot in prose, and that prose is the agent's claim. The
temptation is to lift it into the frame, where it would sit next to facts blobot measured and
borrow their credibility. There is no need to invent a rule against that, because the transcript
already has one: it has three voices, and this is simply two of them doing their existing jobs.
The agent's words draw in the agent's voice, above the picture, as ordinary prose. The frame is
blobot's own line and contains **nothing the agent said**.

That is also the whole answer to *what happens when the agent's words and the picture disagree*:
nothing. blobot cannot notice, must not try, and has not lent anything to the claim. A reader who
distrusts the caption is left with the picture and blobot's measurements, which is exactly the
position they should be in.

No fourth voice is invented. This is the same refusal that killed a `system` line naming blobot in
`.scratch/handbooks/` ticket 04.

### What is on the frame, under option 2

Reading the file itself, blobot knows things it can state without qualification. The frame carries
the two that defeat the actual failure:

**The file's own name**, relative to the AgentWorkspace. Not a name blobot invented, and not the
tool's name. If the agent wrote `shots/login-page.png`, that is what it is called, and the reader
can go and look at it.

**When it was written, relative to the turn.** This is the load-bearing one and it is the reason
this ticket exists. The mundane failure is a screenshot of a stale build, a dead dev server, or the
wrong route, presented as current. blobot cannot look at the picture, but it can compare the file's
mtime to when the turn started, which is a fact it holds already. A file written **during** this
turn and a file that was **already there** are different claims about the world, and only one of
them is *how your app looks*.

That comparison is the single most valuable thing in this map. It is measured, it is cheap, it
needs no inference, and it turns an unfalsifiable assertion into one the reader can weigh.

**The dimensions**, because a picture at the wrong size is the second visible tell, and because
they are free once the file is decoded.

Not on the frame:

- **Bytes.** That is a cost figure and belongs under the gauge, which is ticket 09's.
- **The branch.** Tempting, since `WORKSPACE` already draws it and it feels like the missing half
  of *which version is this*. Refused: blobot knows the branch **now**, not the branch when the
  file was written, and putting it on the frame would assert a link blobot cannot establish. It
  would be the one claimed fact in a line of measured ones.
- **Anything about what is in the picture.** blobot provides no inference.

### Option 1's frame is different, and has to be

Under an observed tool result, blobot knows the tool's name, the `toolCallId`, the agent, and the
moment the update arrived. There is **no file**, so there is no name and, decisively, **no age**.
`annotations.lastModified` was the protocol's answer and ticket 01 measured it stripped.

So that frame says which tool produced it and that it arrived during this turn, and it says
nothing else. It must **not** be the same drawing as option 2's, because a reader who cannot tell
them apart will read option 2's guarantees onto option 1.

This is the repo's existing discipline applied again: *no pull request* and *we could not look* are
separate states that never draw the same, and `measured` rides `context_compacted` for exactly this
reason. Two sources that know different amounts get two frames, and the difference is visible
without hovering anything.

### Proposed copy, for the author

Blobot's voice, mono, in the existing status register. No em dashes.

- option 2, written during the turn: `login-page.png · 1280x800 · written during this turn`
- option 2, older than the turn: `login-page.png · 1280x800 · written before this turn`
- option 1: `from playwright_screenshot · received during this turn`

The wording is the author's; the **three states** are not, and neither is the rule that the third
line never appears on an option 2 frame or vice versa. A relative age in minutes and hours was
considered and rejected for the *before this turn* case: it invites precision the reader cannot use
and it changes every time the transcript is re-read.

### The facts live on the frame, not in a detail view

Opening a picture at full size is a plain want and its layout is ticket 08's. But the measurements
are not allowed to live only behind that interaction: **a defeater you have to go and find does not
defeat anything.** The reason this ticket is first-class is that a reader forms a belief the moment
they see the picture, and the frame is the only thing that reaches them at that moment.

### Never

The word *verified*. Any phrasing in which blobot appears to vouch for content. Any frame that
merges a measured fact and a claimed one into one sentence.

## Amendment, 2026-09-05

**The author, on the frame's length: if the thumbnail is visible, nothing in the frame may explain
or expose it.** *The human is not stupid.* This narrows the proposed copy above and the narrowing
is binding.

The test is now one question per fact: **can the reader see it in the picture?** If yes, blobot
does not say it. What survives is only what the picture cannot show:

- **When it was written, against the turn.** Survives, and it is the reason this ticket exists. A
  picture cannot show its own age, and the stale-build failure is invisible by construction.
- **The file's own name.** Survives. Not visible, and it is how the reader goes and looks.
- **The dimensions.** **Cut.** They were argued in as *free once decoded* and as the second visible
  tell, and *visible* is exactly what now disqualifies them: a picture at the wrong size looks wrong
  on screen, which is the reader's job and not blobot's to narrate.
- **Anything announcing that a picture is present.** Never was on the frame and is now explicitly
  refused, for ticket 08 and ticket 10 both. A picture is not introduced.

Revised copy:

- shown, written this turn: `login-page.png · written during this turn`
- shown, older: `login-page.png · written before this turn`
- observed: `from playwright_screenshot`

The observed frame loses its arrival clause. It said *received during this turn*, and a picture
drawn inside the turn it arrived in already says that by where it sits. What remains is the one
fact the reader cannot get from looking: which tool it came out of, and that it is not the other
kind.

## Amendment, 2026-09-05: an observed Picture has no line at all

From the author against the first live run, and it is this ticket's own amendment applied one
step further than the ticket applied it. The observed frame was `from <tool>`. On screen that read
`from Read File`, and it is **not provenance**: it is the runtime's prose title for a call whose
own fold is on screen directly above the picture, so the line was repeating something already
visible rather than adding a defeater. *If the reader can see it, blobot does not say it* cuts it.

What this gives up is worth stating plainly, because it is this ticket's subject. An observed
Picture now carries **nothing measured**. That is honest rather than a loss: with `annotations`
stripped by every bridge ticket 01 measured, `lastModified` -- the protocol's own answer to the
age question -- was already gone, and a tool's name weighs no claim about the world. The frame was
poor on purpose and it turns out the poorest honest version of it is empty.

*The two frames must never draw the same* survives and is stronger for it: one carries a sentence
and the other carries none, which is a wider gap than a name against a name. And the ticket's
governing finding is untouched -- the fact that decides the map is **whether the file was written
during this turn**, which only a *shown* Picture can answer, and that line is unchanged.
