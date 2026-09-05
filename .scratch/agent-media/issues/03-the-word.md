Type: grilling
Status: resolved
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

## Answer

**The word is Picture, the verb belongs to the agent, and the user performs none.** Resolved
2026-09-05. The author was asked for the naming call, declined to spend a decision on it, and
handed back a constraint for ticket 08 instead (recorded there). The noun below is therefore the
charting session's, taken so the frontier moves; one word from the author replaces it, and nothing
downstream depends on which of the three candidates won.

### The noun: **Picture**

A **Picture** is something an Agent shows the user in the transcript. It is not an Attachment, and
the contrast is the whole of the word: **an Attachment is picked up, a Picture is shown.** Nobody
attached a Picture, there is no composer anywhere near it, it cannot be refused at pickup, and the
one who decides it exists is the Agent.

The two rejected candidates lost for reasons worth keeping, because both will be proposed again:

**Screenshot** is the honest domain word and it is what the objective actually says. It is refused
as *the type name* because blobot cannot see inside a Picture. Under ticket 04's option 1 the bytes
are whatever an operator's MCP server returned, which may be a chart, a diagram or a rendered
graph, and blobot has no inference with which to tell. Calling that a screenshot is blobot making a
claim about content, in a map whose entire finding is that blobot states only what it measured.
*Screenshot* stays available to the **agent**, in the agent's own voice, where a claim about
content is exactly what it should be.

**Exhibit** is the right register for ticket 02's finding that the risk of this arrow is
credibility. It is refused because blobot's vocabulary is plain English throughout (folder, face,
mark, handbook, entry) and *exhibit* is borrowed from a courtroom. It also implies the Picture is
being entered into an argument, which is one degree more than *the agent is showing you something*.

**Media does not survive.** It is a category name, not a thing a person says about a screenshot of
their own app, and it would put *media* in a sentence beside *message* and *attachment* where it
sorts them rather than joining them. `.scratch/agent-media/` keeps its path because a directory
name is not vocabulary; nothing in the app, the code or the copy uses the word.

### The verb: the agent **shows**, and the user does nothing

Inbound has *attach*, and the user performs it. Outbound has **to show**, and the **Agent** performs
it. There is deliberately no user verb: the person is shown something and does not act on it. That
is a real answer rather than a gap, and it is the reason no control appears beside a Picture in the
base feature. Saving one out of the transcript stays in the map's Fog; if it is ever built, its verb
is *save* and it is the user's, which is a different sentence than this one.

### Two sources, and each is named

Ticket 04 split the feature in two and ticket 07 ruled their frames must never draw the same. They
need names, or 06, 08 and 10 will each invent one:

- A **shown Picture** is one the Agent handed blobot deliberately, as a path inside its own
  AgentWorkspace, through the loopback tool. blobot opened the file, so it knows the name, the
  dimensions, the size, the mtime and the containment.
- An **observed Picture** is one blobot lifted out of a tool result it was merely watching. The
  Agent did not hand it over and its model may never have seen it (ticket 01, OpenCode). blobot
  knows the tool's name and the moment it arrived, and nothing else.

The collision with the verb is deliberate and load-bearing: a shown Picture was shown, and an
observed one was not. That is precisely the difference the two frames exist to carry.

### The state when there is one and it cannot be drawn

Ticket 10 asked this ticket for the word. There is no new noun: it is still a Picture, and the state
is **not drawn**, always with the reason in the same line, in blobot's own words. The whole
discipline is that an absence is never acceptable, so the sentence is the answer and a noun would
only let a future session ship the noun without the reason.

`a picture from bob · not drawn · its bytes are gone` is the shape. Ticket 10 owns the catalogue and
the exact wording; what is settled here is that every one of them says *picture*, says *not drawn*,
and names why. Refused as words for this state: *failed*, *error*, *unsupported*, *invalid*, and any
protocol enum. A Picture whose bytes are gone on a later replay is **not drawn** for that reason and
is not a fifth concept.

### What blobot must never call it

- **Never an attachment.** One word, one direction. This is the whole reason the ticket exists.
- **Never media.** See above.
- **Never after the tool that made it, as though that were its name.** `Attached.tsx` already holds
  this line for the inbound direction: it says *pasted image* for a file with no name and refuses to
  invent `pasted-image-1.png`. An observed Picture has no filename, and blobot says so by naming the
  tool as its **source** (`from playwright_screenshot`) and never as its title.
- **Never a word that implies blobot knows what is in it.** No *diagram*, no *chart*, no *preview*,
  no *result*. blobot provides no inference, and the noun must not smuggle any in.
- **Never *image* as the user-facing noun.** `image` stays a mime kind and an ACP block type, which
  is where it is true. On screen it is a Picture.

### CONTEXT.md

Written under **Messaging**, beside **Attachment**, so the contrast is where a reader meets it.
