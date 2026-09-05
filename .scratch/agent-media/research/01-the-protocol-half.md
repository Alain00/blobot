# Ticket 01, the desk half: what the protocol says, before anything is run live

Read 2026-09-05 out of the pinned bridges' own dependency, at zero token cost. Source:
`@agentclientprotocol/sdk` `schema/schema.json`, checked at **both** versions present in this
repo's tree (1.3.0 and 1.4.0), which agree on every point below. The bridges themselves are
`claude-agent-acp` 0.70.0 and `codex-acp` 1.7.0.

This does not resolve ticket 01. It settles *what is legal* so the live half only has to measure
*what each of the five actually does*, which is a much smaller and cheaper question.

## Both shapes are protocol-legal, and one of them is the protocol's stated purpose

`ContentBlock`'s own description names all three places it appears:

> - User prompts sent via `session/prompt`
> - Language model output streamed through `session/update` notifications
> - Progress updates and results from tool calls

So ticket 01's candidate 1 (an image in `agent_message_chunk`) and candidate 2 (an image in a tool
call's content) are both the protocol working as designed, not an edge case.

The next sentence is the one that matters most for this map:

> This structure is compatible with the Model Context Protocol (MCP), enabling agents to
> **seamlessly forward content from MCP tool outputs without transformation.**

A browser server's screenshot arriving as an image block in `tool_call_update` is not a thing that
might happen. It is the case ACP's content design was written for. `ToolCallContent`'s `content`
variant is `Content`, which is a `ContentBlock`, and its own description says *standard content
blocks (text, images, resources)*.

**Consequence for ticket 04.** Option 1 is on much firmer ground than it looked while charting. It
is not blobot scavenging something incidental off the wire; it is the wire's intended payload.

## There is no client capability to receive content, and that is not symmetric with the inbound side

`ClientCapabilities` carries `fs`, `terminal`, `session` and nothing about content. There is **no
negotiation for what a client can be shown.**

Inbound, blobot reads `promptCapabilities.image` and turns it into `AgentRuntime.accepts`, so the
composer can refuse a picture before the user types. There is no counterpart, and there cannot be
one: an agent may send an image block at any time, on any of the five runtimes, and blobot has no
protocol-level way to decline it or to signal that it will not be drawn.

**Consequence for ticket 10.** The silent drop is not gated behind anything. It is reachable on
every runtime today, and the "what does a runtime with no picture support do" sub-question has a
flat answer: the question does not exist in this direction. Every runtime can send one.

**Consequence for ticket 06.** `accepts` has no mirror to be built. Do not invent one.

## The protocol already carries two of the facts ticket 07 wants

`ImageContent` is `{data, mimeType, uri?, annotations?, _meta?}`, and `Annotations` is:

- **`audience`** — *"Intended recipients for this content, such as the user or assistant."* The
  protocol itself distinguishes a block meant for the person from one meant for the model. If a
  runtime populates this, blobot has a first-class answer to *is this picture for me to look at*
  rather than a guess.
- **`lastModified`** — *"Timestamp indicating when the underlying resource was last modified."*
  Directly the provenance fact ticket 07 is trying to establish, if it is ever set.
- **`priority`** — *"Relative importance of this content when clients choose what to surface."*

Whether any of the five populates any of these is exactly what the live half must find out, and it
is now the most valuable thing it can find out. **Ticket 07 should not design a frame before this
is measured**: if `audience` and `lastModified` are populated, part of the frame is a protocol
field rather than an invention; if they are always absent, that absence is itself the finding, and
it means every fact on the frame is one blobot measured or one the agent claimed, with nothing in
between.

`_meta` is present and reserved for vendor extension. Per this repo's own rule, **only an adapter
may read it**.

## `ImageContent.uri` exists

*"URI associated with this resource or media payload."* Optional, alongside `data` rather than
instead of it.

**Consequence for ticket 04.** The feared collapse of option 1 into option 2 has a specific shape
now: a runtime that sets `uri` to a local path while still sending bytes. That is not the dangerous
case, because the bytes are there and blobot can simply ignore the `uri`. The dangerous case is a
bridge that sends `uri` and **omits** `data`, and the live half should check for it explicitly.

Note that blobot's own inbound code already refuses to invent a `uri`: `contentBlockOf` gives a
pasted image no name, because *an invented `pasted-image-1.png` is a filename for a file that
exists nowhere under it*. The same discipline applies to reading one.

## The full list of `session/update` variants, for the record

`user_message_chunk`, `agent_message_chunk`, `agent_thought_chunk`, `tool_call`,
`tool_call_update`, `plan`, `plan_update`, `plan_removed`, `available_commands_update`,
`current_mode_update`, `config_option_update`, `session_info_update`, `usage_update`,
`compaction_update`, `compaction_summary_chunk`.

blobot's `session-updates.ts` handles a subset of these, which is by design. Worth noting only
because `user_message_chunk` also carries a `ContentChunk`, so an image can in principle arrive
attributed to the *user* on a resumed session's replay, which the transcript would have to place
in the user's voice rather than the agent's.

## Two things for the map's fog

- **`AudioContent` is in the protocol**, beside `ImageContent`, with the same shape. The fog entry
  about video and PDF should say audio too.
- **`CompactionSummaryChunk` is a first-class update variant.** Unrelated to this map, but
  `.scratch/transcript-scale/` decided compaction by handoff at a time when this may not have
  existed. Not this effort's business; noted so it is not lost.

## What the live half still has to measure

Unchanged from the ticket, minus the legality question:

1. Which of the five actually emit an image block, and in which of the two positions.
2. Whether `annotations.audience`, `annotations.lastModified` or `priority` are ever populated.
3. Whether any bridge sends `uri` without `data`.
4. Whether the model sees the picture when blobot drops it (it should, since blobot is only a
   client, but confirm rather than assume).
5. Real byte sizes and mime types.
