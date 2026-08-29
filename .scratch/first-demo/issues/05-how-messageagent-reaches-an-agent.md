Type: grilling
Status: resolved
Blocked by: 01, 02, 03

# How messageAgent reaches an agent

## Question

Given what the research established about client-exposed tools, decide the actual mechanism
by which Alice can call `messageAgent` and by which Bob is woken.

Covers: how the tool is declared to each runtime; how the orchestrator intercepts the call;
what Alice sees as the tool's *result* (an ack? a message id? nothing?) given that she does
not wait for Bob; how Bob's mailbox turns into a prompt when he is idle versus mid-turn; and
whether a reply is a new message or a threaded response.

Must work for both runtimes without the orchestrator knowing which is which.

## Answer

### Transport: loopback HTTP, not stdio

The research established that **the agent spawns the MCP server process, not blobot**. A stdio
server therefore means N child processes whose only job is to forward a call back to the
process that already owns the mailbox — a delivery path of agent → MCP child → IPC →
orchestrator, with three places to lose a message.

Instead the **orchestrator is the MCP server**: it listens on `127.0.0.1:<port>`, we pass that
URL in `session/new.mcpServers`, and the tool handler is a plain function in the process that
holds the mailbox. Both runtimes advertise `mcpCapabilities: {http: true, sse: true}`.

**Bind loopback only, and require a per-session bearer token.** An open localhost port that can
message agents is a real hole.

**Risk, stated plainly:** the research verified *stdio* end-to-end and marked loopback HTTP
**advertised but untested**. This needs a spike before it is load-bearing. If HTTP fails on
either runtime, stdio is the fallback and this decision inverts. See the sibling ticket.

Also: `mcpServers` must be **re-supplied on `session/load` and `session/resume`**, not only on
`session/new`.

### The tool

Free-form recipient, validated by the orchestrator:

```ts
messageAgent({ agent: string, message: string })
  -> { delivered: true, recipient: string, status: "started" | "queued" }
```

**Why not an enum of teammates.** `mcpServers` binds at session creation, so a baked enum is
frozen for the session's life and goes *invisibly* wrong the moment the roster changes — Alice
cannot even express "message Reviewer" and will invent something else. Free-form degrades
correctly: `"no agent named 'Reviewr' on this team; try: Alice, Bob, Reviewer"` is a
self-correcting error. No `listTeammates` tool in the MVP — the roster goes in the wake prompt
and Alice's system context instead, which costs one line and no round-trip.

**Why the ack carries recipient state.** Alice needs the difference between "Bob is on it" and
"Bob is busy and will see this later" — it is the one fact that changes her next action. No
message id: there is no `getReply(id)` in an async model, so an id she cannot use is noise that
invites her to invent calls that do not exist.

### Wake policy

**Auto-wake.** A message to an idle Bob starts his turn immediately, whether or not the user is
looking at his tab. Queue-until-viewed would destroy the demo — Alice's message would be a mere
notification.

Be clear-eyed about what this means: **agents spend the user's tokens unwatched, triggered by
another agent.** That is the actual product, and it is also what will burn someone. It makes the
turn budget mandatory, and it is why the MVP needs a visible per-team kill switch.

**Mid-turn arrivals queue.** This is the common case, not the edge one. Concurrent prompts on
one session **collapse into a single turn** (observed: two requests returned byte-identical
results), so a second `session/prompt` is not an option. Rejected alternatives: a second session
gives two Bobs with divergent context — a correctness disaster, and `mcpServers` setup cost paid
repeatedly; cancel-and-redeliver throws away work already paid for. Queueing keeps Bob a
coherent single mind, and the ack already tells Alice it happened.

**Deliver the whole queue as one prompt** when his turn ends — not one prompt per message.

### Replies are explicit

Bob's final message is **not** auto-routed back to Alice. Auto-routing makes every wake a
request/response pair, which quietly reintroduces the synchronous delegation model rejected
during charting, and wakes Alice for *every* Bob turn — doubling the ping-pong risk.

The cost is real and must be mitigated in the wake prompt: Bob will sometimes finish and forget
to reply, leaving Alice waiting forever. **Tell Bob plainly that Alice cannot see this turn and
must be messaged back if he wants her to know.** That is ticket 06's to carry.

### Runaway control: a per-team turn budget

Polite agents ping-pong by default ("thanks, let me know if you need anything" / "will do").
The team gets **N total agent turns per user prompt**, default 10, then halts with
"turn budget exhausted — continue?" in the UI.

Rejected: a hop-depth counter is trivially defeated by a three-agent cycle that never repeats a
pair; a cooldown only slows the loop. A turn budget is the only mechanism that bounds **cost**,
which is the thing actually at risk, and it degrades honestly instead of silently truncating.

### Delivery is durable before the ack

The tool handler writes the message to SQLite and acks **only after commit**. One synchronous
`better-sqlite3` insert, sub-millisecond, and the call is already a network round-trip.

The failure this prevents is the worst kind: Alice believes with certainty that she told Bob
something, Bob never heard it, and neither can detect the gap — an unrecoverable divergence in a
system whose entire premise is that agents coordinate by message. **Ack means committed.**

## Amendments (from ticket 15's verification)

The loopback HTTP transport chosen above is **verified on both runtimes** — invocation, not just
discovery, with the bearer token honoured on every request including the SSE stream. The decision
stands. Four requirements it added:

- **Readiness is the inbound handshake, not `session/new`.** A dead port or rejected token still
  returns a normal `sessionId` with no error anywhere in ACP. The orchestrator must treat the MCP
  `initialize`/`tools/list` arriving *at us* as the signal the agent actually has its tool.
- **The endpoint must be stateless.** Neither runtime re-handshakes after a transport drop — both
  POST `tools/call` at a restarted orchestrator with no `initialize` and no session id.
- **`message_agent` needs an idempotency key, and the handler must never block.** A mid-turn drop
  stalls the turn for the full timeout (60s OpenCode / 120s Claude) and then fails with genuine
  at-most-once ambiguity about whether the message was delivered.
- **Naming:** server `blobot`, tool `message_agent`. Naming the tool `blobot_message_agent` makes
  OpenCode double the prefix.
