Type: research
Status: resolved

# What does a runtime actually emit when a tool produces a picture?

## Question

blobot has never seen an image arrive from an agent, because it deletes them before they become
events. Before anything can be decided about drawing one, somebody has to know what the wire
looks like on each of the five runtimes.

The specific unknown is **which shape a picture arrives in**, and there are at least three, which
are not equivalent and may not all exist:

1. `session/update` with `sessionUpdate: 'agent_message_chunk'` and an `image` content block —
   the agent *saying* a picture, in its own voice.
2. `sessionUpdate: 'tool_call_update'` whose `content` array holds
   `{type:'content', content:{type:'image', ...}}` — the result of a tool, which is where an MCP
   browser server's screenshot would land.
3. Neither, because the bridge stringifies it, drops it, or replaces it with a path before blobot
   ever sees it.

## What it has to settle

- **The shape, per runtime**, for Claude, Codex, OpenCode, fx and Cursor. Recorded as raw
  transcripts under `research/`, the way `.scratch/first-demo/research/` and
  `.scratch/handbooks/research/02-empty-prompt.md` did. A summary with no transcript behind it is
  not an answer this repo accepts.
- **Whether the model sees it.** A screenshot that reaches the model and not blobot is a different
  problem from one that reaches neither, and it changes ticket 09 entirely: in the first case the
  cost is already being paid and blobot is only failing to show what was bought.
- **The mime types that turn up**, and whether any runtime sends anything other than PNG.
- **How big they are.** A full-page screenshot at retina is not a small number, and every ceiling
  in this effort has to be set against a real one rather than a guess. Record the byte counts.
- **What happens on a runtime that never advertised `image` inbound.** fx says
  `{images: false, textFiles: true}` on the way in. Whether that says anything at all about the
  way out is an open question and probably not — `promptCapabilities` is about the prompt — but
  assuming it would be assuming.
- **Whether a bridge rewrites the picture into a path.** If any of them hands over a `file://` or
  a temp path instead of bytes, that is the single most consequential finding in this map, because
  it means the cheap option exists and ticket 04 has to refuse it explicitly rather than in the
  abstract.

## How

Two probes, and the second is the one that matters:

- **A browser MCP server**, which is the realistic source and the one already silently failing for
  operators today. Configured the way ADR-0003 says an operator's own servers arrive.
- **A bare tool result**, if a smaller harness can be arranged: a trivial MCP server of our own
  that returns one image block on demand, which isolates the protocol question from a vendor's
  screenshot implementation. `packages/core/src/mcp/peer-message-server.ts` is the model.

Live runs cost tokens. Use the existing flags (`--live-claude=<dir>` and the four beside it) and
follow the `BLOBOT_LIVE_*` convention for anything that ends up as a test.

## Interim findings, desk half, 2026-09-05

**`research/01-the-protocol-half.md`.** Read out of `@agentclientprotocol/sdk`'s own
`schema.json` at both versions in this tree, at zero token cost. It settles what is *legal* so the
live half only measures what each runtime *does*. Four results change other tickets:

- **Both candidate shapes are legal**, and forwarding an MCP tool's image output without
  transformation is the stated purpose of ACP's content design. Candidate 3 (the bridge drops or
  stringifies it) is now the surprising outcome rather than the expected one.
- **There is no client capability for receiving content.** `ClientCapabilities` has `fs`,
  `terminal`, `session` and nothing else. An image can arrive on any runtime at any time and
  blobot cannot decline it in protocol. `accepts` has no mirror to build, and ticket 10's silent
  drop is ungated on all five.
- **`ImageContent.annotations` already carries `audience`, `lastModified` and `priority`**, where
  `audience` distinguishes content meant for the user from content meant for the model. Measuring
  whether anyone populates these is now the most valuable thing the live half can do, and
  **ticket 07 should not design a frame until it is measured.**
- **`ImageContent.uri` is optional beside `data`.** The case to check for is a bridge that sends
  `uri` and omits `data`.

The remaining live questions are listed at the foot of that file.

## What is binding

- Findings are observations, not decisions. This ticket may not choose a shape for blobot; it
  reports what is there so that 04, 06 and 09 can choose against something real.
- `packages/core` exports no ACP type, and nothing learned here changes that. Whatever the wire
  says dies inside `adapters/acp/`.
- If a runtime's behaviour contradicts its published documentation, the measurement wins and the
  contradiction gets a live canary, the way Cursor's client-supplied `mcpServers` did.

## Answer

**Four runtimes, four different shapes, and no two put a picture in the same place.** Resolved
2026-09-05. Findings and raw wire: `research/01-the-live-half.md` and `research/transcripts/`;
the protocol half is `research/01-the-protocol-half.md`. Cursor is not installed on this machine
and is the one gap.

| runtime | reaches the client | where | copies |
| --- | --- | --- | --- |
| Claude 0.70.0 | byte-exact | canonical `content`, `rawOutput`, `_meta.claudeCode.toolResponse` | **3** |
| Codex 1.7.0 | byte-exact | **`rawOutput.result.content` only**, never `content` | 1 |
| OpenCode 1.18.4 | byte-exact | canonical `content`, plus `rawOutput.attachments[]` as a `data:` URL | 2 |
| fx 0.0.7 | **no** | stringified into a text block, **truncated at 200 chars mid-base64** | 0 |

Candidate 3 from the question — the bridge drops or stringifies it — turned out to be real, on fx,
and it is worse than dropping: the payload is cut with nothing saying so.

### The four things that change other tickets

- **`annotations` does not survive.** The `--annotate` run sent `audience: ['user']`,
  `lastModified` and `priority`; the block arrived as `{type, data, mimeType}` and nothing else.
  The protocol's provenance fields are unavailable. **Ticket 07 is unblocked**, with its answer
  narrowed: every fact on a frame is one blobot measured or one the agent claimed, and there is no
  third category.
- **The model may never see what the client is handed.** On OpenCode the picture arrived
  byte-exact and the agent then said *the image tool returned an error: this model does not
  support image input*. Ticket 09 must not frame this as revealing a cost already paid.
- **There is no one place to read from.** Ticket 06 has three readers minimum, and the Codex one
  means the shared layer learning **MCP's** `result.content` envelope rather than ACP's shape.
- **Two failure states nobody had.** A picture truncated with no notice, and a picture the model
  refused while the client got it. Both belong in ticket 10's catalogue and neither is blobot's
  fault.

### Found on the way, and not this effort's

OpenCode advertises `promptCapabilities.image: true`, which is what `AgentRuntime.accepts` is
built from, while the model behind it refused image input. If that reproduces with a pinned model
it is a defect in **shipped** behaviour: the composer will let a user attach a screenshot to an
agent that cannot read one. It is a ticket against ADR-0004's `accepts`, not against this map.

### Leftovers

Cursor; a pinned model on OpenCode; whether fx's *model* sees the full result or the same 200
characters; the `--uri-only` case, which the harness supports and nobody ran; and real byte sizes,
since everything here used a 79-byte PNG and fx's truncation is a length rule.
