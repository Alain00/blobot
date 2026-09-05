# Ticket 01, the live half: four runtimes, four different shapes

Run 2026-09-05 against real accounts on this machine, one turn each. The harness is
`probe/probe.ts` and `probe/picture-server.ts`; the raw wire is in `transcripts/`, one `.jsonl`
of every inbound JSON-RPC message per run plus a `.log` of the console.

**`cursor-agent` is not installed on this machine**, so four of the five are measured and Cursor
is outstanding.

## Method, and why it does not go through blobot

The probe speaks ACP to the runtime **directly**, with none of blobot's adapter code in the path.
That is deliberate: `session-updates.ts` deletes images before they become events, so measuring
through the adapter would have measured the defect rather than the wire.

It serves a two-tool MCP server over the same loopback HTTP shape as
`mcp/peer-message-server.ts`: `show_picture` returns one `image` content block holding a **79-byte
2x2 PNG** blobot generated (CRCs verified), and `show_text` returns a line of text. The text tool
is the control. Without it, a run where nothing arrives cannot distinguish *this runtime drops
images* from *the model never called the tool*.

Not a browser server, on purpose: ticket 01 asked to isolate the protocol question from a vendor's
screenshot implementation.

## The result

**The picture reaches the ACP client on three of the four, and no two of them put it in the same
place.** The shared `adapters/acp/` layer cannot read this uniformly. This is the first thing
measured in this repo that the shared half genuinely does not cover.

| runtime | reaches the client? | where | copies on the wire |
| --- | --- | --- | --- |
| Claude (`claude-agent-acp` 0.70.0) | yes, byte-exact | ACP canonical `content`, **and** `rawOutput`, **and** `_meta.claudeCode.toolResponse` | **3** |
| Codex (`codex-acp` 1.7.0) | yes, byte-exact | **`rawOutput.result.content` only.** Never in ACP's `content` | 1 |
| OpenCode 1.18.4 | yes, byte-exact | ACP canonical `content`, **and** `rawOutput.attachments[]` as a `data:` URL | 2 |
| fx 0.0.7 | **no** | the whole MCP result JSON-stringified into a **text** block, **truncated at 200 characters**, mid-base64 | 0 usable |
| Cursor | not measured | | |

### Claude: canonical, and three times over

```json
"content": [{ "type": "content", "content": { "type": "image", "data": "...", "mimeType": "image/png" } }]
```

Exactly the shape ADR-0004's `contentBlockOf` builds for the inbound direction, arriving on the
way back. `textOfToolContent` walks straight past it.

The same bytes also appear in `rawOutput` and in `_meta.claudeCode.toolResponse`, both in
Anthropic's own `{type:'image', source:{type:'base64', media_type, data}}` shape rather than ACP's.
So **one screenshot crosses the stdio pipe three times**. At 79 bytes that is nothing; at a real
full-page screenshot it is not, and it is a fact ticket 09 should own, because it is a cost blobot
pays in IPC and JSON parsing whether or not it ever draws anything.

### Codex: not where the protocol says

```json
"rawOutput": { "result": { "content": [ { "type": "image", "data": "...", "mimeType": "image/png" } ] } }
```

`content` is absent entirely. What is in `rawOutput` is **MCP's** tool-result envelope
(`result.content`), not ACP's, leaking through unwrapped.

This is the finding with the sharpest architectural consequence. `wire.ts` says of `rawInput` that
*everything else a runtime sends here is its own and stays unread*, and `_meta` is adapter-only by
rule. `rawOutput` is neither: `session-updates.ts` already falls back to it for **text**
(`textOfToolContent(raw)`), and that fallback misses this only because the payload is an object
rather than an array. So reading it is not a new violation, but reading `result.content`
specifically means the shared layer learning an MCP shape. Ticket 06 has to decide whether that
belongs in `adapters/acp/` or in the Codex adapter.

### OpenCode: it arrived, and the model refused it

The client got the picture, byte-exact, in canonical `content`, alongside an empty text block, plus
a second copy in OpenCode's own `rawOutput.attachments[]` as a `data:` URL with `type: 'file'`.

And then the agent said, in its own voice:

> The image tool returned an error: this model does not support image input.

**The client-side arrival and the model's ability to consume are independent.** blobot can be
handed a picture the model behind the agent never saw. That inverts an assumption in ticket 09,
which supposed that if a picture reaches blobot the cost is already being paid and blobot is merely
failing to show what was bought. On this run the opposite happened: the transport cost was paid,
blobot could have drawn it, and the model got an error.

It also surfaces a defect in **shipped** behaviour that has nothing to do with this map. OpenCode
advertises `promptCapabilities.image: true`, which is what `AgentRuntime.accepts` is built from, so
blobot's composer will happily let a user attach a screenshot to an agent whose model cannot read
one. The probe did not pin a model, so the exact model is this machine's OpenCode default
(`opencode models` lists `opencode/big-pickle` first). **Pinning a model and re-running is the one
follow-up this file leaves open**, and if it reproduces it is a ticket against ADR-0004's
`accepts`, not against this effort.

### fx: stringified, then truncated mid-payload

fx does not forward content blocks at all. It serialises the entire MCP result to JSON and puts it
in a **text** block, then cuts it at exactly 200 characters:

```
{"server":"picture","tool":"mcp_picture_show_picture","result":{"content":[{"type":"image","mimeType":"image/png","data":"iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mO4Y2NjU3GH4cMJGw0NDQ
```

Unterminated, unparseable, and the base64 is cut in half. There is no recoverable picture here by
any means, and nothing in the payload says it was truncated — the string simply stops.

Whether the *model* also gets the truncated version, or gets the full result by another channel,
this probe cannot see. That is worth knowing and is a second follow-up.

fx also has a two-step MCP dance visible in the transcript: a `Selected dynamic MCP tool ... its
executable schema will be available on the next model step` call precedes the real one, which is
why fx spends two tool calls per tool.

### The permission path, incidentally

Codex asked for permission on **every** MCP call and the probe answered `allow_session`; fx asked
and the probe answered `allow_always`. Claude and OpenCode asked nothing. This is ticket 05's
territory and it confirms its premise from the other side: a screenshot arriving through a server
the operator installed asks a permission question every time on two of the four runtimes.

## What this settles, and for which ticket

- **Ticket 04.** Option 1 (observe the tool result) works on three of four runtimes today and is
  irrecoverable on fx. Any answer that says *observe the tool result* has to say what fx does.
- **Ticket 06.** There is no single place to read a picture from. At minimum Claude/OpenCode
  (canonical `content`), Codex (`rawOutput.result.content`) and fx (nothing usable) are three
  different readers. Whether that lives in `adapters/acp/` or per adapter is now a real decision
  with evidence under it.
- **Ticket 07.** `annotations` **does not survive**. A second run with `--annotate`, sending
  `audience: ['user']`, `lastModified` and `priority`, arrived at the client with the annotations
  stripped: the block was `{type, data, mimeType}` and nothing else. So the protocol's provenance
  fields are not available, at least on Claude, and every fact on the frame is one blobot measured
  or one the agent claimed. There is no third category. **Ticket 07 is unblocked.**
- **Ticket 09.** Three copies per picture on Claude. And the model may never see what blobot is
  handed, so *revealing an existing cost* is not a safe framing.
- **Ticket 10.** The catalogue gains two states nobody had: **a picture that arrived truncated and
  says nothing about it** (fx), and **a picture the model refused while the client got it fine**
  (OpenCode). Neither is blobot's fault and both are blobot's to draw.

## What is still outstanding

1. **Cursor**, uninstalled here.
2. **A pinned model on OpenCode**, to confirm the `accepts` defect above.
3. **Whether fx's model sees the full result** or the same 200 characters.
4. **The `uri` without `data` case.** The probe supports `--uri-only` and it was not run.
5. **Real byte sizes.** Everything here used a 79-byte PNG. Nothing in this file says what a real
   screenshot does to any of these paths, and the fx truncation in particular is a length rule
   that a real payload meets differently.
