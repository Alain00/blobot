Type: task
Status: resolved

# Cache the available commands behind the runtime

## Problem

`available_commands_update` reaches the adapter and dies there
(`packages/core/src/adapters/claude/translate.ts:15`). Nothing above it can know an agent has
commands, so the composer cannot offer them.

It must keep dying as an *event*. Ticket 04's reason holds: it is a menu, not agent state, it is
several KB per turn, and putting it in `AgentEvent` would push it through the recorder into
SQLite. What it needs is somewhere else to live.

## What to do

Give `AgentRuntime` a way to be asked, and a way to say it changed. The adapter holds the cache;
the translator keeps returning nothing.

Two things the shape has to get right, both from ticket 04's amendment:

- **Replace, never merge.** The bridge's own comment is explicit that a `commands_changed` push
  is authoritative and the client should replace its list (`acp-agent.js:2201`). Merging would
  accumulate commands from directories the agent has left.
- **Notify only on a real change.** OpenCode resends the identical array after every prompt. The
  bridge itself compares by `JSON.stringify` before re-advertising (`:1950`); do the same, or
  every turn wakes the renderer for nothing.

The list is per session, so it belongs to the runtime instance, not to the team or the profile.
It does not survive a restart and should not be persisted: after `session/load` the provider
re-advertises, and a stale menu read from disk would be worse than an empty one.

## Boundaries

- Nothing provider-shaped may escape. The type is blobot's own — a name, a description, an
  optional argument hint — not the wire type, for the same reason core imports no ACP type today.
- Nothing new in the recorder, the store or the migrations.
- `MockAgentRuntime` gets the same surface, with commands in a scenario, or the UI has nothing to
  be built against. Ticket 08's rule applies: reproduce the traps rather than the happy path, so
  give at least one scenario a mid-session change and one an empty list that fills after the
  first turn.

## The trap worth writing a test for

On OpenCode the list arrives ~7ms *after* `session/prompt`, so a session that has never held a
turn has no commands at all. On Claude it arrives earlier. Both are correct; the consumer must
not assume a fresh agent knows its own commands. Assert the empty case explicitly rather than
letting it be an accident of ordering.

## Done when

- Typecheck, tests and build pass.
- A fake-bridge test covers: first advertisement, a `commands_changed` replace, an identical
  resend that notifies nobody, and the empty-before-first-turn case.
- `BLOBOT_LIVE_CLAUDE=1` against a real `claude` shows a non-empty list, and the count is
  recorded in the answer — issue 03 needs to know how big this really gets.
- Nothing about commands appears in `AgentEvent`, the recorder, or the schema.

## Answer

Built, 2026-08-29. The list lives on the runtime instance and never becomes an event.

**The surface.** `AgentRuntime` gained two members and one type
(`packages/core/src/runtime.ts`):

- `AvailableCommand` — `name`, `description`, optional `hint`. blobot's own shape. The wire's
  `input: {hint}` is flattened on the way in, so nothing above the adapter meets the nesting.
- `readonly availableCommands: readonly AvailableCommand[]` — the current menu, empty until
  the provider advertises one.
- `onCommandsChange(listener)` — fires only on a real change.

`sameCommands` (`packages/core/src/commands.ts`) is the comparison both runtimes share.
Order is significant: the list is a menu the user reads in order, so a reordering is a change
worth redrawing.

**Where the capture happens.** `commandsFrom` in the translator
(`adapters/claude/translate.ts`) normalizes an `available_commands_update` and returns
`undefined` for everything else. That distinction is load-bearing: `undefined` means "this
notification is not about the menu", `[]` means "the menu is empty", and only the second may
replace a full list. `translateSessionUpdate` still returns no events for it, so the recorder,
the store and the migrations are untouched.

**One thing the ticket did not anticipate.** A menu advertised during a resume's transcript
replay is kept, where every other update is swallowed. Two reasons, both in the code's comment:
a menu is current state rather than something that was said, and during `#loadSession` the
runtime's `#sessionId` is still empty, so the ordinary identity guard would drop it anyway. It
has its own test.

**The mock.** `MockAgentRuntimeOptions.commands` is the menu before the first turn, defaulting
to empty. A new scenario step, `advertises(commands)`, changes it mid-turn, which is where it
really changes. Two scenarios are checked in: `advertises-commands` starts empty, advertises,
replaces, then re-advertises the identical list to prove that one wakes nobody, and
`loses-commands` goes from a menu to none.

**Tests.** Ten new, all green: the four the ticket named, plus the resume case, the nameless
entry, the hint flattening, and both mock scenarios. Typecheck, tests (285) and build pass.

### The live count, which issue 03 needs

`BLOBOT_LIVE_CLAUDE=1` against a real `claude` in a fresh workspace, on this machine today:

> **223 commands, 97 KB normalized**, advertised during startup rather than after the first
> prompt.

That is not the 48 the research measured, and the gap is the point: **140 of the 223 (63%) come
from one plugin namespace, `posthog:`.** The naive palette is not "your own skills"; it is
mostly one plugin's skills. A single plugin install moved this by 175 entries, so the number is
not a property of blobot or of Claude, it is a property of whatever the user happened to install
last.

Claude advertises before the first turn, so the empty-before-first-turn case belongs to OpenCode
alone today. It is still asserted explicitly rather than left to ordering, per the ticket.

**Sixteen built-ins survive the bridge's own terminal-bound filter and mutate state blobot
models somewhere else.** Handed to issue 03 rather than acted on here, since hiding is a menu
decision and this ticket only carries the data:

- **Against `TeamPool`'s resume:** `/compact`, `/autocompact [auto|<tokens>]`.
- **Against ticket 14's forced posture:** `/config key=value`, `/model`, `/effort`, `/fast`,
  `/auto-mode-setup`.
- **Against ticket 15's loopback server:** `/mcp [reconnect|enable|disable [<server>|all]]`.
  `disable all` takes away the agent's only route to a teammate.
- **Against blobot's own aggregates:** `/agents`, `/list-agents` ("List subagents, teammates,
  and other Claude sessions you can message" — a second, competing roster), `/rename`.
- **Terminal-bound leftovers the filter missed:** `/context`, `/usage`, `/doctor`, `/init`,
  `/reload-skills`.
- **`/__remote-workflow`**, a double-underscore private command for server-launched sessions,
  which no user-facing menu should ever have contained.
