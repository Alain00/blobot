Type: research
Status: resolved
Findings: ../research/03-opencode-acp-surface.md

# OpenCode's ACP session and event surface

## Question

OpenCode is the first real runtime and the one the architecture gets proven against, so its
actual behaviour — not the spec's — sets the shape of our normalized events.

Document, from `opencode@1.18.4` on the dev machine: how ACP mode is launched; the session
lifecycle; every event type emitted during a prompt turn and its payload; how tool calls
appear; how cancellation is requested and acknowledged; how errors surface; and how the
working directory is bound to a session.

Prefer observed transcripts over documentation where they disagree.

## Answer

Observed against `opencode` 1.18.4, already authenticated with 3 oauth providers, so all 8
scenarios are **real model turns**, not handshake stubs. Raw transcripts and driver scripts:
`../research/03-transcripts/`.

**Launch.** `opencode acp` — newline-delimited JSON-RPC 2.0 on stdio, no framing headers,
stdout clean from byte 0. `initialize` → `session/new` → `session/prompt`. `--pure` is worth
using. Closing stdin exits 0 cleanly; malformed JSON does *not* kill the stream.

**Sessions.** `cwd` is required and bound **per-session, not per-process** — one OpenCode
process can serve multiple worktrees, which materially changes our process model. Sessions
persist to SQLite and genuinely survive process death: `session/load` replays history as
`user_message_chunk`/`agent_message_chunk`. Verified with a codeword surviving SIGTERM.

**Events — exactly six update kinds:** `available_commands_update`, `agent_thought_chunk`,
`agent_message_chunk`, `tool_call`, `tool_call_update`, `usage_update`. Turn completion is
**not an event** — it is the `session/prompt` RPC reply carrying `stopReason`.

**Tools.** Fully visible and fully approvable: name, `kind` (`read`/`edit`/`execute`/`other`),
arguments, streaming output, result, exit code, failure reason.

**Cancellation.** `session/cancel` is a notification; the prompt **resolves** (never rejects)
with `stopReason: "cancelled"` in ~20-30ms.

**Errors come on two distinct channels.** Protocol errors are JSON-RPC with useful `data`.
Tool and permission errors are `status: "failed"` on the tool, and *the turn continues*. The
normalized vocabulary needs both.

**Custom tools.** Confirmed working end-to-end via `session/new.mcpServers`. Names namespace
as `<server>_<tool>`.

### Three findings that constrain the architecture

- **Agent-originated request IDs start at 0 in a separate ID space from the client's.** A
  naive single-Map correlation will cross-wire permission responses. Real bug, waiting.
- **A cancelled tool reports `status: "completed"`, not `cancelled`** — only `exit: null` and
  a text string reveal the abort. Never infer success from `status`.
- **Concurrent prompts on one session collapse into a single turn** — both requests returned
  byte-identical results. blobot must serialize per session. This is a hard constraint on the
  orchestrator, not a nicety.

### Unverified

A provider/API failure mid-turn could not be observed — all three providers were healthy and
credentials were not touched. This is the biggest remaining gap in the event surface.

Full findings: `../research/03-opencode-acp-surface.md`
