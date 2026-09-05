Type: grilling
Status: resolved
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

## Answer

**An eleventh member that never carries bytes, one for both sources, a table of its own, and the
store write happens before the event exists.** Resolved 2026-09-05 against ticket 01's four
measured shapes, ticket 04's split into a shown and an observed Picture, and ticket 03's word.

### An eleventh member, and not blocks on an existing one

`agent_message_completed.text` is a `string` and four things depend on that being all it is: the
assembler concatenates deltas into it, `agent_messages.text` is a `NOT NULL` text column, the
orchestrator hands it to a peer as compact context, and `bounds.ts` counts its characters. Putting
blocks on it would say *a message can contain a picture*, which is true of the protocol and false
of blobot's transcript, and it would ripple through all four for a payload none of them can hold.

The decisive argument is not the ripple, though. It is that under ticket 04's option 2 — the
objective — **there is no message to put blocks on.** A shown Picture arrives as a loopback tool
call while the agent is saying nothing at all. A vocabulary member that can only exist inside a
message could not express the feature this map was written for.

So: **`picture_arrived`**, a sibling of `agent_message_sent` and `context_compacted`, both of which
are already news that is not prose.

The name is neutral on purpose. *Shown* is the Agent's verb (ticket 03) and half of these were not
shown by anybody: an observed Picture is one blobot caught in a tool result the Agent called for
its own reasons, and naming the member `picture_shown` would assert of every row the one thing the
two sources disagree about.

### One member, not two

The two sources differ in what blobot knows, and that is a **field**, not a type:

```
picture_arrived {
  pictureId    // the store's row. Never bytes. See below.
  source       // 'shown' | 'observed' — ticket 03's two words, and ticket 07's two frames
  toolCallId   // the call it belongs to. Present on both: a shown Picture is a loopback call.
  name?        // the file's own name, relative to the AgentWorkspace. Shown only.
  width?       // measured by decoding. Absent means blobot could not, and says so.
  height?
  bytes        // the size, for ticket 09's gauge and for nothing on the frame
  writtenAt?   // the file's mtime. Shown only, and the whole point of ticket 07.
  turnStartedAt // what `writtenAt` is compared against. Carried so a replay compares the same
                // two numbers a live draw did, rather than re-deriving one of them later.
  toolName?    // the tool that produced it. Observed only, and never drawn as a filename.
}
```

Two members would double the recorder, the store, the IPC channel and the snapshot for one
discriminator, and would let a future session add a field to one and forget the other — which is
exactly how *no pull request* and *we could not look* would have drifted if they had been two
types instead of one. `source` is required and has no default, so nothing can arrive uncommitted
about which of ticket 07's two frames it gets.

`toolCallId` is on both, which is worth saying because it looked like a second discriminator while
charting. It is not: an observed Picture comes off a `tool_call_update` and a shown one comes off
the Agent calling `blobot`'s own tool, so both belong to a run. What the transcript does with that
is ticket 08's, and the author has already put a floor under it.

### The bytes never travel in the event

They are written to the store **before** the event exists, and the event carries a `pictureId`.

The event is both persisted by the recorder and streamed over IPC to a renderer that replays it on
every team switch, so bytes in it would be every picture of the session crossing the boundary
twice. `Attached.tsx` already settled the inbound version of this in one sentence — *a transcript
of two hundred messages must not be two hundred images on every re-render* — and the ticket asked
for that precedent to be tested rather than assumed. It holds, and it holds harder here: the user
picked up their own attachments and knows how many there are, while an Agent in a screenshot loop
decides how many Pictures a transcript has.

So the snapshot carries rows and the renderer fetches one picture at a time through
`pictureUrl(id)`, the exact counterpart of `attachmentUrl(id)`, undefined for an id nothing wrote.

**Who writes the bytes.** Main owns the store; core must not. That is already how inbound works —
`main/attachments.ts` reads the file, refuses by size, writes the blob and returns an id — and the
same shape answers both sources here:

- A `PictureStore` interface is declared in core (`runtime.ts`), implemented in main over SQLite,
  and handed in at construction. `Uint8Array`, never `Buffer`, because `@blobot/core/domain` takes
  no Node dependency.
- The **adapter** holds it for an observed Picture, because the adapter is the only thing that has
  the bytes and, after ticket 01, the only thing that knows where its provider put them. It writes,
  gets an id, emits `picture_arrived`.
- The **orchestrator** holds it for a shown Picture, in the loopback tool handler, where it also
  does the containment check, the read, the measurement and the mtime comparison.

This keeps the invariant the vocabulary exists for: no member carries a provider's shape, and the
four different places ticket 01 found a picture stay inside the four adapters. And it means there
is never a bytes-carrying event to forget to strip — a twelfth member was the obvious alternative
and is refused for exactly that reason.

### The wire type, and where the four shapes live

`adapters/acp/wire.ts` gains `data?` and `mimeType?` on `ContentBlock`, which is where the two
halves of the protocol concept finally meet: `attachments.ts` has been emitting
`{type:'image', mimeType, data}` outbound the whole time. `ToolContent.content` is a `ContentBlock`
already, so tool results come free. The shape stays inside `adapters/acp/` and `packages/core`
still exports no ACP type.

The **canonical** reader is shared (`adapters/acp/pictures.ts`): an `image` block in `content`, on
either an `agent_message_chunk` or a `tool_call_update`. That covers Claude and OpenCode. The other
two are the adapters' own, because ticket 01 measured that this is the first thing the shared half
does not cover:

- **Codex** puts it only in `rawOutput.result.content`, MCP's envelope rather than ACP's.
- **OpenCode** also sends a `data:` URL in `rawOutput.attachments[]`; the canonical block already
  covers it, so that path is not read, and saying so here stops a later session adding a second
  reader that double-draws.
- **Claude** sends it three times over. The canonical one wins and the other two are ignored, which
  needs a test, because a de-duplicating reader is the difference between one Picture and three.
- **fx** stringifies and truncates at 200 characters. There is no reader for that. Whether blobot
  can even tell a picture was there is **ticket 10's question and it must not be assumed**: a
  truncated base64 fragment in a text block is a heuristic, and a heuristic that misfires draws
  *not drawn* over an ordinary sentence.

### A table of its own: `pictures`

Not `attachments`, and not `message_attachments`.

The join's whole reason is that one blob serves a fan-out — one thing typed once, three
messages, one copy of the bytes. A Picture is never fanned out; it belongs to one turn by one
agent. And the columns simply are not the same: a Picture has a `path`, a `width`, a `height`, an
`mtime`, a `source` and a `tool_name`, and an Attachment has an `ordinal` that is the user's own
pickup order. Reusing the table would put both directions in one place under a name that says one
of them, which is the thing ticket 03 exists to prevent, in the schema where this repo's comments
are load-bearing.

```
pictures(id, turn_id, agent_id, source, tool_call_id, tool_name,
         name, mime_type, bytes, width, height, written_at, turn_started_at,
         data, at)
```

Append-only and never updated, so the `events` table's retention note applies unchanged: a prune is
`DELETE WHERE at < ?` and nothing else in the schema has to care.

**Ticket 02's invariant survives.** Nothing hands an Agent a path or an id into this table. The id
crosses to the renderer and nowhere else; no tool takes one, no persona mentions one, and the
loopback tool's input is a path in the Agent's own AgentWorkspace and never a `pictureId`. That is
worth a test named for it, the way ticket 02 asked, because it is now load-bearing for two features
and a future *show me that picture again* tool would break it in one line.

### Purge, tombstone, and the figure

Deleting a team keeps the transcript, and Pictures are transcript, so the rows stay with the
messages the way attachments already do. Nothing changes there.

What does change is that a **shown** Picture exists twice: as bytes in SQLite and as the file the
Agent wrote into its AgentWorkspace. A full clean measures and deletes worktrees, so it already
recovers the second copy and the figure is already true. It must not be made to claim the first:
the copy in the store is the transcript, and the transcript is what deletion keeps.

No new figure is invented for pictures in the store. Per-turn bytes go under the gauge and that is
ticket 09's; a standing *your transcripts hold 300 MB of pictures* line would be a fifth figure
nobody asked for, and whether a retention policy exists at all is not this map's question.

### A resumed session draws what it drew

It has to, and it does, because the bytes are in SQLite and the snapshot carries ids — the same
reason a compaction's handoff survives an eviction. A shown Picture does **not** re-read the file:
the store is the record, the worktree is the Agent's, and a file that was deleted, rebuilt or
overwritten after the turn would otherwise quietly change what a past turn appears to have shown.
The name on the frame is a name, not a link.

A row whose bytes are missing on replay is **not drawn**, with the reason said, and it is the same
state as every other one — ticket 03 settled the word and ticket 10 owns the catalogue.

### The mock has to be able to produce one

`MockAgentRuntime` is a shipped demo mode and it is what ticket 08 will prototype against. A
scenario must be able to make a Picture arrive, in both sources, including the ugly ones: two in
one turn, one whose bytes fail to store, one that decodes to nothing. `.scratch/live-steps/` was
the last effort to find that a review had been conducted against a mock that could not reach the
case, and that mock could not fork a `Promise.all`. This one cannot show a picture at all.
