# Build status: an agent showing the user a picture

What is built, what was decided while building that no ticket covers, and what the next session
picks up. The map is `map.md`; the reasons are on the tickets.

## Built, 2026-09-05

**The posture fix first** (`ba0bb5e`), which is not this feature and is ticket 05's. See that
ticket's *Built* section: the display-server class is on OpenCode's `BASH_PERMISSIONS` as `ask`,
and it is also on Claude's `REFUSED_AT_UNATTENDED`, which the ticket had not asked for and which
its own reasoning requires.

**Then the pipeline**, which is build-order items 1 and 2 together rather than one after the
other. See *Why 1 and 2 shipped together* below.

- `pictures.ts` in core: `PICTURE_LIMIT`, the five `PictureNotDrawn` reasons and their sentences,
  and `measurePicture` -- a header reader for PNG, JPEG, GIF and WebP. That last one is what makes
  `its bytes did not arrive whole` a **measurement**: a truncated PNG keeps its signature, so
  believing the signature is exactly the mistake, and the JPEG walk to the frame header answers
  `undefined` when it runs off the end.
- `picture_arrived`, the eleventh member, exactly as ticket 06 shaped it. It never carries bytes.
- `PictureStore` in `runtime.ts`, **synchronous**, which is a decision the ticket left open: the
  events it sits between are ordered, and an await in the middle of translating one
  `session/update` would let a later update overtake this one and put a picture under the wrong
  tool call.
- `adapters/acp/pictures.ts`: the canonical reader, plus `PictureWatch`, which is the four
  adapters' one seam. It has memory for one reason -- the tool's name arrives on the `tool_call`
  that opens a run and the picture on the `tool_call_update` that closes it, so `from
  playwright_screenshot` is impossible without keeping the first.
- The three exceptions ticket 01 measured: `adapters/codex/pictures.ts` reads MCP's envelope under
  `rawOutput.result.content`; OpenCode's `data:` URL is deliberately **not** read, with the reason
  in the code; fx has no reader, with ticket 10's open question in the code.
- The `pictures` table, migration `0022_big_whirlwind`, `SqliteStore.keepPicture` and `.picture`.
  **The measuring is the store's, not the adapter's** -- what the bytes are has one answer whatever
  runtime asked, so no two runtimes can disagree about what blobot will draw.
- The recorder appends `picture_arrived`, `logOfTeam` reads it back, and the renderer rebuilds the
  items from the snapshot. A Picture that was **not** drawn comes back too, which is the half that
  matters: that event is the only record it ever happened.
- The renderer: `Picture.tsx`, the `picture` item, the counting fold, `blobot:pictureUrl`, and the
  CSS. Two `DESIGN.md` amendments, as ticket 08 asked.
- `MockAgentRuntime` can produce one, in both sources, through the **real store** in demo mode, so
  a scripted picture is measured and refused by the code a real one goes through.
  `shows-a-picture` has all three cases in one turn: one drawn, one refused, and a burst that has
  to collapse to a count.

## Amended after the first live run

**A turn's Pictures are one row, where there is more than one.** The author's, against a real
transcript: two screenshots drew two column-width pictures with a face and a caption between
them. The gathering is a pass over `rowsOf`'s output rather than a fold in the item list, because
the two were not adjacent -- each came off its own run with a shut fold between. Ticket 08 carries
the amendment and the three refusals that came with it.

**An observed Picture has no line at all**, and the row's boxes are one aspect ratio. Both the
author's, from the same run. `from Read File` was the runtime's prose title for a call whose fold
was already on screen above the picture, so the line repeated something visible rather than
weighing the claim -- ticket 07's amendment, which is the frank version of what that ticket
already knew: with `annotations` stripped, blobot measures **nothing** about an observed Picture.
The two frames still never draw the same, more widely than before. The row's uniformity is a
constant **height** and not a constant box: a fixed box pays for its tidiness in letterboxing, and
a portrait screenshot in a landscape cell wastes horizontally exactly what the row was saving
vertically. Nothing is cropped and nothing is padded.

## Decided while building

- **Why 1 and 2 shipped together.** The map's build order puts ticket 10's silent drop first and
  ticket 04's observed Picture second, and they are genuinely different features. They were built
  in one change anyway, because item 1 alone produces a `picture_arrived` event that nothing
  draws, which is the same absence one screen further along. The order still shows in the code:
  every failure path is finished, and the *shown* Picture -- the objective -- is untouched.
- **The reason is a code, and the sentence is core's.** Five reason words travel on the event and
  in the `events` row; `pictureNotDrawnBecause` turns one into blobot's words at the draw. Same
  shape as `stoppedBecause`, and it is what lets the store refuse without composing product copy.
  A row written by a later blobot whose reason this one does not know is **skipped**, never drawn
  with the raw word in it, because the raw word is the protocol enum the transcript bans.
- **`turn_id` is not on the `pictures` table**, which ticket 06's sketch had. The restore path is
  the `events` row, the way a compaction's is, because a Picture that could not be kept has no
  `pictures` row at all and would otherwise be unrestorable. The table is the bytes and nothing
  else, and `DELETE WHERE at < ?` still prunes it.
- **The not-drawn line names the agent in the team pane and not in its own**, where ticket 10
  wrote `a picture from bob` unconditionally. The name is in the sentence rather than a header
  because there is no picture for a header to introduce, and it is dropped in the agent's own pane
  for the reason every other per-agent line in that column drops it: the pane is the agent.
- **The fold is shallow on purpose.** A not-drawn Picture collapses only into the item immediately
  before it, so a refusal from before the agent said something is not absorbed into a later run.
  Two reasons stay two lines, and a Picture that *was* drawn never folds.

## Not built, and next

1. **Ticket 04's option 2, the shown Picture** -- the loopback tool taking a path inside the
   agent's own AgentWorkspace, the containment check, the mtime against the turn's start. This is
   the objective. Everything it needs is in place: `source: 'shown'`, `name`, `writtenAt`,
   `turnStartedAt` and `writtenThisTurn` are all carried and drawn already, and nothing sets them.
2. **fx's truncated block**, still the map's one open measurement. Deliberately unanswered.
3. **`AgentRuntime.accepts` may be lying on OpenCode**, from ticket 01. Needs a live run against a
   pinned model. Not this feature's, and still open.
4. **Nothing here has met a real runtime.** Every shape is asserted against the transcripts in
   `research/transcripts/`, which is not the same as a live turn with a browser MCP server
   installed.
