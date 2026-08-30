Type: task
Status: resolved
Blocked by: 02, 03

# The runtime seam

## Problem

`Prompt` is `{text, from}` and both adapters send `[{type:'text', text}]`. Three things have to
cross the boundary without the renderer learning which provider is behind an agent: the bytes,
the fact that a runtime will take them, and the shape they arrive in.

## Answer

### `AgentRuntime` advertises what it accepts, in blobot's own words

`accepts: {images: boolean, textFiles: boolean}`, each adapter deriving it from its own
protocol's answer — `promptCapabilities` on both of today's, whatever the next one offers — and
the composer refuses at attach time: *"Bob's runtime does not take images."*

Not assumed-and-fail-at-send. Both current runtimes accept both, so assuming would work today
and rot silently: `.scratch/` already holds three efforts for further runtimes (codex, cursor,
fx). This is the same shape as `TrustLevel` — blobot's vocabulary, translated by each adapter
from its own end — and it is the only version where issue 03's *refuse at attach, not at send*
survives contact with a runtime that says no. It also puts one honest use to a capability field
blobot currently ignores entirely.

**A fan-out where one runtime refuses is refused whole**, not delivered to two of three. Issue 01
says blobot never narrows a set the user typed, and quietly dropping Carol is narrowing it.

### What the agent receives

**Attachments first, then the text.** Providers do better with the image first and the question
after, and it matches the user's own mental model: here is a thing, now here is what I am asking
about it.

**A real filename travels as the block's `uri` where there is one; a paste carries none.**
`ImageContent` has an optional `uri` and no name field, and a pasted screenshot has no filename
to put in it. Inventing `pasted-image-1.png` would put a name in an agent's context for a file
that exists nowhere under it, and the agent will repeat it back. An embedded text resource's
`uri` is **required** by the schema, and a `.ts` arriving anonymous is a wall of code with no
context, so a text attachment always carries its name.

**blobot adds no prose.** No sentence injected into the prompt saying a file was attached: the
runtime sees the block natively, and `#withBrief` already draws this line — what the user typed
is what the Message holds.

### What the mock reproduces

Ticket 08's rule is that `MockAgentRuntime` reproduces observed traps on purpose, because a kind
mock produces a UI that shatters on first contact.

- **A runtime that accepts**, letting a scenario assert what actually arrived.
- **A runtime whose `accepts.images` is false.** There is no such runtime on this machine, which
  is exactly why the mock has to be the one that says no — otherwise the refusal path is never
  exercised until a fourth adapter appears and someone finds it was never wired up.
- **No demo scenario that attaches anything.** A scripted run has nothing to paste, and an image
  checked in to make the demo prettier is the kind mock ticket 08 refuses.
