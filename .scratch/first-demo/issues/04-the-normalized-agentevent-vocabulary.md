Type: grilling
Status: resolved
Blocked by: 02, 03

# The normalized AgentEvent vocabulary

## Question

`sendPrompt` returns `AsyncIterable<AgentEvent>`. What is `AgentEvent`?

This is the seam the whole "UI is provider-agnostic" rule rests on: every provider quirk has
to die inside an adapter and emerge as this vocabulary. Decide the event set and each
payload — text deltas, reasoning, tool call start/end, permission requests, agent-to-agent
messages, status transitions, turn end, error.

The test for each candidate event: can both OpenCode and Claude Code produce it faithfully,
and does the UI need it? An event only one provider can emit is a leak; an event nobody
renders is speculation.

## Answer

### The premise that shaped everything

**OpenCode's live event set is a strict subset of the Claude bridge's.** OpenCode emits 6
update kinds during a prompt turn; the bridge emits 11, and the 6 are among them. There is no
reconciliation problem in the MVP — the intersection *is* OpenCode's set. Claude-only kinds
(`plan`, `current_mode_update`, `session_info_update`, `config_option_update`) are dropped by
this ticket's own test: an event one provider cannot emit is a leak.

`user_message_chunk` is **not** Claude-only — both runtimes emit it, but only when
`session/load` replays history, never during a live turn.

### `AgentEvent` is our own type

Not an ACP passthrough. Same members and near-identical payloads where they overlap, but our
names, because `MockAgentRuntime` must emit this vocabulary with no ACP anywhere, and the
Agent SDK fallback would otherwise have to synthesize ACP-shaped events it cannot naturally
produce.

The discipline that makes this real is narrow and checkable, not an abstraction layer:
**`packages/core` never exports an ACP type in its public surface.** One lint rule.

### The members

| Event | Source | Notes |
|---|---|---|
| `agent_message_delta` | both, live | ragged — 3 fragments observed in the same millisecond |
| `agent_message_completed` | **synthesized by core** | emitted when a `messageId` closes |
| `agent_thought_delta` | both, live | deltas only; no completed counterpart |
| `tool_call_started` | both | stable `toolCallId` |
| `tool_call_updated` | both | carries argument refinements, and terminal `completed`/`failed` |
| `agent_message_sent` | **synthesized by the orchestrator** | a peer message, Alice→Bob |
| `usage_updated` | both | context gauge and running cost |
| `turn_ended` | **synthesized** from the RPC reply's `stopReason` | `end_turn`/`cancelled` observed on OpenCode; Claude adds `max_tokens`/`max_turn_requests`/`refusal` |
| `error` | fatal only | protocol errors and process death |

Every event carries the agent and session identity — the orchestrator multiplexes many agents
into one stream.

### The decisions behind it

**Turn end is a synthetic event.** Neither runtime emits one — turn completion is the
`session/prompt` RPC *reply*. But `for await` silently discards an async iterator's return
value, and "did it finish, get cancelled, or hit a limit?" is the single most important fact
about a turn. `refusal` and `max_tokens` must reach the UI; `cancelled` drives the status
machine.

**Tool failure is not an error.** `status: "failed"` on a tool update is a normal thing that
happened — the model sees it and adapts, and the turn continues. It stays inside the tool's own
lifecycle. Flattening it into `error` would make the UI shout about a `grep` that found nothing.
`error` is reserved for what actually ends a turn, and is an **event, not a thrown rejection**,
so a partial turn's transcript survives intact.

**`available_commands_update` is dropped.** It is a slash-command menu, not agent state, and in
this environment it carried ~40 entries scraped from the user's global skill config — several
KB *on every turn*. Capture it once at session start for a command palette; pass `--pure` to
suppress the config scrape. It never enters the event stream.

**`usage_updated` is kept**, because a live context meter per agent is what explains why Bob got
worse on his fourth message — a real failure mode for async teams. Trap: on cancel it reports
`used: 0`, a gauge reset that renders as a bug. Suppress the trailing one when a turn ends
`cancelled`.

**Peer messages are first-class.** `messageAgent` is an MCP tool, so Alice→Bob already surfaces
as a tool-call pair — but making the UI pattern-match `mcp__blobot__messageAgent` to render it
is the provider leak wearing a different hat. The **orchestrator** (never the adapter) emits
`agent_message_sent` alongside the tool lifecycle, so the UI renders a peer message without
knowing a tool exists.

**Permission requests are not events.** `session/request_permission` is agent→client
request/response and blocks the turn until answered; events are fire-and-forget. Modelling it as
an event would bolt a correlation id and a response channel onto the vocabulary. It is a
separate callback on the runtime interface. This also sidesteps the research's ID-space trap —
agent-originated request ids start at 0 in their own space and will cross-wire a naive
single-Map client.

**Core concatenates, and emits both.** Deltas *and* a completed-message event when `messageId`
closes. Raw-deltas-only would make persistence and UI each reimplement concatenation and drift;
completed-only would throw away the streaming that makes the demo feel alive. Cost is one buffer
in core keyed on `messageId`. Second payoff: the completed message is the natural unit both to
persist and to hand Bob as compact context.

**Replayed events are not tagged.** `session/load` replays history as the same chunk events a
live turn produces, but we persist messages ourselves, so replay is redundant *for display* —
its real value is restoring the **agent's** context, not ours. The orchestrator calls it and
drops the replayed events on the floor; the consumer knows which call site it is, so no
`replayed` flag is needed. Flagged for the SQLite ticket: this presumes **our store is the
transcript of record**, which that ticket must confirm rather than contradict.

### Implementation traps carried forward

- Both runtimes share **one `messageId` between thinking and answer chunks** — the thinking pane
  must key on event kind, never on message identity.
- A cancelled tool reports `status: "completed"` with `exit: null` (OpenCode). Never infer
  success from status.
