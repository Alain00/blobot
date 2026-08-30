Type: task
Status: open
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
