Type: grilling
Status: resolved
Blocked by: 06, 08

# The silent drop, and every other way this fails

## Question

The defect that started this effort is not that blobot cannot show a picture. It is that blobot
**deletes one without saying so**. `session-updates.ts:76` takes the text of a content block, and
line 77 returns `[]` when there is none, so an image arrives, is measured as empty, and produces no
event. Not a placeholder, not a note, not a gap: an absence, in a transcript whose entire job is to
be an accurate record of what happened.

That is happening today, to any operator with a browser MCP server installed, and it will keep
happening on every path this effort does not cover — a mime type nobody planned for, a picture too
big for whatever ceiling ticket 09 sets, a runtime that does something ticket 01 did not see, a
blob the store failed to write.

This repo has a house answer for this shape and it is worth applying deliberately: a turn that
stops early says `turn stopped · the context window is full` rather than naming a protocol enum,
and *no pull request* and *we could not look* are separate states that never draw the same.

## What it has to settle

- **The line for a picture that arrived and was not drawn**, in blobot's words, naming why. This is
  the smallest useful piece of the whole map and it should be extractable and shippable on its own,
  ahead of every other ticket here.
- **Whether it is drawn once per picture or once per turn.** An agent in a screenshot loop would
  otherwise produce a column of identical apologies.
- **The catalogue of failures**, each with its state: a kind blobot will not draw, a size over the
  ceiling, a decode that failed, a store write that failed, a picture whose bytes are gone on a
  later replay, and a runtime shape ticket 01 never saw. Some of these are the same state and
  saying so is part of the answer; drawing six different sentences for one fact is the other
  failure mode.
- **What the agent is told, if anything.** Every other refusal in this app is answered at the tool
  boundary, in words, to the agent — the peer-message bound, the Handbook bounds, an attachment
  refused at pickup. A tool result blobot merely observed has no boundary to refuse at, so the
  agent may carry on believing the user saw something they did not. That gap is real and this
  ticket has to name it even if it cannot close it.
- **What a runtime with no picture support does.** `accepts` exists so the composer can refuse
  before the user types. There is no counterpart for the reverse arrow and there may not need to
  be, since blobot never asks for a picture; confirm rather than assume.
- **What the tests are.** The `-32602` canary in `.scratch/handbooks/` and the Cursor
  client-supplied `mcpServers` canary are the pattern: a behaviour blobot depends on, asserted, so
  a vendor's release does not remove it quietly.

## What is binding

- Never a protocol enum in front of a user. blobot's own words.
- An absence is not an acceptable failure mode anywhere in the transcript.
- A refusal is refused in words and never truncated silently.
- No em dashes in anything a user reads.

## Answer

**One state, one sentence, one line per turn per agent, and the fx case is a measurement nobody has
made.** Resolved 2026-09-05. The word is ticket 03's and was settled there: a Picture that arrived
and could not be shown is **not drawn**, always with the reason in the same line.

### The line

```
a picture from bob · not drawn · <reason>
```

Mono, `--muted`, in the agent's own column at the agent's altitude, where the picture would have
been. Not a `system` line, because no third party is in the room, and not an inversion, because
nothing is waiting on a human.

It is the **one case in this feature that is text alone** (ticket 08), and that is the exception
the author's rule implies rather than one against it: blobot does not caption what the reader can
see, and here there is nothing to see.

### One line per turn per agent, not one per picture

An agent in a screenshot loop would otherwise draw a column of identical apologies, which is the
failure this repo already refuses in `.scratch/live-steps/` for a different reason.

So the line **counts**, and the count is the only number on it:

```
4 pictures from bob · not drawn · their bytes did not arrive whole
```

Collapsing is by turn, by agent **and by reason**, in that order. Two different reasons in one turn
are two lines, because a reason that is averaged away is not a reason. The pluralisation is the
whole of the difference and there is no *+3 more* control: they are the same fact, not a list.

### The catalogue, and it is five states wearing one word

The ticket asked for the catalogue and warned against six sentences for one fact. Most of these are
the same fact. What the reader needs to know is only ever *whether the picture is gone or whether
blobot chose not to show it*, so the reasons collapse to five:

| what happened | the reason said |
|---|---|
| the bytes were truncated, corrupt, or would not decode | `its bytes did not arrive whole` |
| a kind blobot does not draw (a PDF, a video, anything not an image) | `it is not a picture blobot can draw` |
| over ticket 09's ceiling, observed and so unrefusable | `it is larger than blobot will keep` |
| the store write failed | `blobot could not keep it` |
| the row is here on a later replay and the bytes are not | `its bytes are gone` |

A shape ticket 01 never saw is not a sixth entry: it produces no event at all, which is the current
defect, and the honest position is that blobot cannot report what it did not notice. That is stated
below rather than papered over with a sentence that would never fire.

The first row deliberately merges three mechanisms. A reader cannot act differently on *truncated*
than on *corrupt*, and naming the mechanism would be the protocol enum this repo bans in the same
breath as `turn stopped · the context window is full`.

### The fx case is a measurement, not an assumption

Ticket 04 said fx's truncation is drawn as a picture that arrived and could not be read. **That
assumes blobot can tell**, and nothing has measured it.

fx stringifies the tool result into a text block and cuts it at 200 characters mid-base64. What
blobot receives is a text block. Deciding it was a picture means recognising a base64 fragment
inside prose, which is a heuristic, and a heuristic that misfires draws `not drawn` over an ordinary
sentence an agent wrote — a false claim about what happened, in the transcript whose job is to be
accurate, which is worse than the silence it was meant to fix.

So this is the one thing on this map that is **open and honest about being open**: the shape of
fx's truncated block has to be looked at before anything decides it is detectable. If it carries a
reliable marker, the first row of the table applies. If it does not, **fx keeps the silent drop for
that path**, and that is written down as a known gap rather than guessed at. The `.scratch/fx-runtime/`
finding that fx writes its own diagnostics into the message stream is the precedent and it went the
same way: not filtered, because guessing at a vendor's wording is how a real answer disappears.

### What the agent is told, and where it cannot be

- **A shown Picture is refused in words**, at the loopback tool, to the agent that called it. There
  is a boundary and a caller, so the ordinary discipline applies: the reason is stated, nothing is
  truncated, and it is the same refusal shape as `bounds.ts`'s others.
- **An observed Picture cannot be**. blobot watched a result flow between an agent and its runtime;
  there is no boundary to refuse at and no call to answer. The agent will carry on believing the
  user saw something they did not.

That gap is real, it cannot be closed, and the ticket asked for it to be named even so. It is
named here and it is a **second reason the two sources must never draw the same**: under option 1
the user is being told something the agent does not know.

### What blobot never says

- Never a protocol enum, never a mime type, never a status code, never a stack.
- Never *failed*, *error*, *unsupported* or *invalid*. Ticket 03 settled this.
- Never an apology. The line reports; it does not perform regret.
- Never a control. There is nothing to retry: the bytes are gone or were never blobot's, and a
  *try again* that re-runs an agent's turn is a spend nobody asked for.

### `accepts` has no counterpart, and does not need one

Confirmed rather than assumed, as the ticket asked. `AgentRuntime.accepts` exists so the composer
can refuse before the user types, and it answers *what will this runtime take*. There is no reverse
question, because blobot never asks a runtime for a picture: it draws what arrives. A runtime that
never sends one produces no line, which is correct — an absence of pictures is not a failure to
show one.

### The tests

Three, in the canary pattern the repo already uses:

1. **The silent drop, asserted gone.** An `agent_message_chunk` and a `tool_call_update` carrying
   an image block produce an event, not `[]`. This is the whole defect and it is the first test.
2. **Claude's three copies produce one Picture.** Ticket 06 named the de-duplication; a runtime
   that stops sending two of them must not silently change the count.
3. **Codex's `rawOutput.result.content` still carries it.** It is the one runtime that puts a
   picture nowhere in ACP's own envelope, so a version that starts sending it canonically would
   otherwise double-draw, and one that stops sending it at all would go silent again.

### It ships first

This is the smallest piece of the map and the only one that is a defect rather than a feature. It
needs ticket 06's event and store and nothing else: no loopback tool, no permission decision, no
gauge, no frame beyond `from <tool>`. It should go in ahead of everything, because the drop is true
today for any operator with a browser MCP server installed.
