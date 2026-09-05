Type: grilling
Status: open
Blocked by: 01, 04

# How a picture travels, and what is left behind

## Question

The event vocabulary has ten members and all of them are text. `agent_message_delta` and
`agent_message_completed` carry `text: string`, the assembler concatenates deltas into a string,
and the transcript, the recorder, the store and the snapshot replay are all built on that. A
picture does not fit anywhere in it.

There is also a wire problem underneath: `adapters/acp/wire.ts` declares
`ContentBlock = {type?, text?}`, while `adapters/acp/attachments.ts` already builds
`{type:'image', mimeType, data}` for the inbound direction. Two shapes for one protocol concept
that have never been introduced.

## What it has to settle

- **An eleventh member, or blocks on an existing one.** The two are not close. Blocks on
  `agent_message_completed` say *a message can contain a picture*, which is true of the protocol
  and would ripple into the assembler, every consumer and the persisted shape. A separate member
  says *a picture is its own kind of news*, which keeps text exactly as it is and makes the picture
  a sibling of `agent_message_sent` and `context_compacted` — both of which are precedents for
  news that is not prose.
- **Whether it is one member or two**, given ticket 01 may find pictures arriving in two places
  (the agent's own voice and a tool result). A tool result belongs to a `toolCallId` and folds
  inside a run; a picture in the agent's voice does not. If the transcript treats them differently
  then the vocabulary probably should too, and if it does not, say why.
- **Where the bytes live between the adapter and the screen.** They must not travel in the event
  if the event is persisted and replayed, because a team switch would then carry every picture of
  the session through IPC. `Attached.tsx` already solved the inbound version: the snapshot carries
  an id and the picture is fetched per chip, *because a transcript of two hundred messages must
  not be two hundred images on every re-render*. That precedent looks decisive and should be
  tested rather than assumed.
- **Whether the `attachments` table is reused.** It is a blob plus a join and nothing in it says
  the user picked it up, so it fits. What does not fit is the join's name and the assumption behind
  `message_attachments` that a picture belongs to a message the way an attachment belongs to a
  prompt. Decide it deliberately.
- **What ticket 02 handed over.** blobot's store is safe only because nothing links to it. Storing
  agent-produced pictures in the same table is fine under that rule and stops being fine the moment
  anything hands an agent a path into it. Whatever is decided must not create the first link.
- **Purge, tombstone and the recovered figure.** Deleting a team reports what it recovers. Pictures
  in SQLite are not in an AgentWorkspace and are not in that figure, and a session's worth of
  screenshots is not a small number. Whether they are counted anywhere is a decision.
- **What a resumed session shows.** A team that was evicted and comes back must draw what it drew
  before, or must say it cannot.

## What is binding

- `packages/core` exports no ACP type. The wire shape stays inside `adapters/acp/`.
- The vocabulary is blobot's, normalized, and no member may only make sense on one runtime.
- `@blobot/core/domain` has no Node dependencies. Nothing added here may pull SQLite into the
  renderer's entry point.
- The bytes are in SQLite and never on disk — ADR-0004's rule, and ticket 02's reason for it
  survives the reversal.
