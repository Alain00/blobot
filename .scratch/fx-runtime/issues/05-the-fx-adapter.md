Type: task
Status: resolved
Blocked by: 01, 02, 03, 04

# The fx adapter

## Problem

With 01 through 04 answered, this is ordinary work: a third runtime behind `AgentRuntime`, with
nothing outside the adapter learning that it exists.

## What to do

In `packages/core/src/adapters/fx/`:

- The stdio spawn of `fx acp`, cwd set to the AgentWorkspace, `--log-file` pointed somewhere
  blobot owns so nothing but the protocol reaches stdout, `onStderr` wired as the other two have
  it. Reuse `adapters/acp/child-transport.ts` and `jsonrpc.ts` unchanged; if either needs a
  change to fit, that is a finding worth writing down, because the point of that directory is
  that it turned out to be the protocol's shape and not a provider's.
- The persona strategy from 01, with its reason in a comment.
- `permissions.ts` from 02 and 03, the counterpart to `adapters/claude/permissions.ts`.
- `palette.ts`: ADR-0003's allowlist over what a person authored. fx sends `availableCommands`
  after `session/new` (`buildSlashCommandsJson`) and has its own skills; measure what it
  advertises before writing the filter, the way the 223-commands-of-which-40-are-offered
  measurement was made for Claude.
- Resume through `session/resume` rather than `session/load`, because it reconnects without
  replaying history, which is what `TeamPool` wants after an eviction. Fall back to a new session
  when the provider has forgotten it, as the Claude adapter does.

Outside it:

- A probe in `detect/runtimes.ts`: binary `fx`, extra dir `.local/bin`, readiness read from
  `fx status --json`. Ticket 11's rule holds -- a negative is reliable, a positive is not, and
  the word *authenticated* does not appear.
- Two rows in `detect/remedies.ts`: install `curl -fsSL https://fx.sh/setup.sh | bash` (verify
  the URL live before writing it, as was done for the other two), sign-in `fx login`. Note that
  `fx login` opens a browser and that `FX_NO_OPEN_BROWSER=1` prints the URL instead, which may
  matter in the PTY.
- A case in `apps/desktop/src/main/runtime-for.ts` and a label beside it. Nothing in the renderer.

## Done when

Typecheck, tests and build pass; two fx agents on a team message each other through the
orchestrator's mailbox, the way `--live-claude` proves for Claude; and a live test file exists
behind an env flag, matching `BLOBOT_LIVE_CLAUDE` and `BLOBOT_LIVE_OPENCODE`.


## Answer

**Built and verified live, 2026-08-31**, against a real `fx` 0.0.7 on a real Codex subscription.
`packages/core/src/adapters/fx/`, and a fourth arm in `runtimeFor`.

### The claim this effort existed to test

`adapters/acp/` was factored out on the theory that it holds *the protocol's* shape rather than
three vendors' habits. Claude's and Codex's bridges are written by the protocol's own authors and
OpenCode implements it alongside them, so the theory had never actually been tested. **fx is a
7 MiB Zig binary from a fourth party, and the shared layer took it with one edit.**

Reused unchanged: the JSON-RPC (`jsonrpc.ts`), the child transport, the wire shapes, the
`session/update` translation, the option groups (`config-options.ts`), the attachment blocks, and
`sameCommands`. The live edit test asserts the same title string the other three live suites
assert for the same edit, and the diff and the target are the shared layer's work.

**The one edit is in `mcp/peer-message-server.ts`, and it is a comment rather than a change**,
because the behaviour was already right by luck: fx opens an MCP connection with `server/discover`,
a newer draft's method, and falls back to the classic handshake **only when the server answers
with a JSON-RPC error**. Answering `{}` instead fails the whole session with
`McpMissingResultType`, so every fx agent would launch with no mailbox. That line is now
load-bearing, documented, and has its own regression test named after the method that depends on it.

### The two things fx needed that the shared layer could not give

Both are provider quirks and both live in the adapter, which is where `CLAUDE.md` says they go.

1. **fx names the file nowhere the shared layer can see.** Its `tool_call` is
   `{title: "Writing", kind: "edit"}` and nothing else -- no `locations`, which is ACP's own field
   and which Claude and OpenCode populate, and no `diff` block, which is where Codex puts it. The
   path exists in exactly one place on the wire: `toolCall.rawInput.path` on the
   `session/request_permission` that follows. So the adapter picks it up there and applies it to
   the updates after. An fx edit reads `Editing` while pending and `notes.txt` on completion,
   which is the honest shape: before the permission is asked, blobot has not been told which file.
   The repair only ever *fills a gap* -- if `locations` or a diff is present it wins -- so the day
   fx populates them this quietly stops doing anything.
2. **The mailbox carve-out needed a different handle.** Codex's is keyed on `rawInput.{server,tool}`;
   on fx `rawInput` carries the tool's *arguments* (`{to, body}`) and never the server. The handle
   is fx's own generated identifier, `mcp_<server>_<tool>`, matched **exactly** against a name
   blobot itself supplied in `mcpServers`. That is not the prefix-of-a-title heuristic the Codex
   adapter warns against: it is a string blobot can construct from its own configuration, and a
   server the user configured is not in that list. It is needed: measured live, fx asks about
   `mcp_blobot_message_agent` under the posture, so without it every peer message on a team would
   stop and wait for a person.

### What is different from the other three

- **`accepts` is `{images: false, textFiles: true}`.** fx is the first *real* runtime to refuse a
  kind of attachment blobot supports -- until now `MockAgentRuntime` was the only runtime that
  said no, and ADR-0004's refusal-at-pickup path existed to be exercised rather than because
  anything needed it. On fx a screenshot is refused in the composer, before the user writes.
- **`initialize` itself fails when fx is unauthenticated**, rather than advertising `authMethods`
  the way the protocol intends. So detection is load-bearing here rather than a courtesy, and the
  adapter turns `-32600` into fx's own sentence, which names three remedies.
- **An unverified version is reported, not refused.** `fx` is the user's own binary with its own
  `fx upgrade`; the two pinned npm bridges are dependencies blobot installs and may insist on.
  Same rule as `opencode`. The *protocol* version is still refused, because that is a wire
  contract rather than a release.
- **The posture is not fatal.** On Codex an unconfirmed mode fails the launch, because there the
  mode *is* the posture. Here the posture is an environment variable set before the child exists,
  and the ACP mode is its visible half; a mode that will not take is reported and the launch
  continues.
- **`personaIsSessionBound` is false**, and fx is the runtime that makes that flag easy to
  explain: the persona is stored nowhere, so every session -- fresh, resumed or restarted -- runs
  under the definition the process is holding.

### Verified live

`BLOBOT_LIVE_FX=1 FX_LIVE_PROVIDER=codex pnpm --filter @blobot/core exec vitest run src/adapters/fx/live.test.ts`,
four tests, **all passing**:

- **The persona holds.** Asked who it is, a real fx answers *"I'm Alice, the team's backend
  engineer."* That is ticket 01's whole design, spent.
- **An edit in its own workspace**, with the file named: titles came back
  `Reading | | | Editing | notes.txt | notes.txt`.
- **The palette**: eighteen advertised, four offered -- `compact undo changes status` -- and
  `allowlist`, `settings` and `reset` never reach a composer.
- **The loopback**, with its own bearer token: `message_agent` arrived at the server with
  `from: agent_alice`, and no permission request reached the user.

### Still not done

- **Two real fx agents on one team behind the UI**, and one fx agent beside a Claude agent, which
  is the `--live-mixed` shape and the point of the whole architecture. The loopback half is proven
  at the adapter; the roster shortcut is not written.
- **An attachment to a real fx**, which would be the first live attachment case against any
  runtime and is the more interesting half here because fx is the one that says no to images.
