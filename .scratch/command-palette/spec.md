# The command palette

Typing `/` in the composer should offer the agent's slash commands and skills, the way `@`
already offers the roster.

The data already arrives and we already drop it on purpose. What is missing is a place to keep
it, a way for the composer to ask, and a decision about what the menu is allowed to contain —
which is the only hard part.

## What is already true

- **Both runtimes emit it, in the same shape.** `available_commands_update`, carrying
  `{name, description, input?: {hint}}`. Claude's bridge and OpenCode both send it, so this is
  shared ACP surface rather than a provider quirk, and a palette built on it does not strain the
  rule that nothing outside an adapter knows which provider an agent is.
- **We drop it deliberately**, at `packages/core/src/adapters/claude/translate.ts:15`, because
  it is a menu rather than agent state and it is several KB per turn.
- **Ticket 04 sanctioned this feature when it made that call:** *"Capture it once at session
  start for a command palette. It never enters the event stream."* The palette was anticipated;
  only the plumbing was deferred. That ticket now carries an amendment: it is not *once*, it is
  cache-and-replace.
- **Skills and commands are one list.** OpenCode's transcript shows skill names sitting in
  `availableCommands` beside everything else, so there is no second feature hiding here.
- **Invoking one is free.** A slash command is prompt text beginning with `/`, parsed by the CLI
  (`acp-agent.js:995`). blobot passes the user's text through verbatim — `promptFromUser` commits
  it unchanged (`orchestrator.ts:265`) and the adapter sends `[{type:'text', text: prompt.text}]`
  (`claude-agent-runtime.ts:332`). Nothing wraps a user prompt, so `/foo` arrives as the first
  characters. **The composer only has to insert text.**

That last point is what makes this small. No new RPC, no new prompt shape, no change to the turn
path, and the `@mention` suggestion list (`Composer.tsx:47`) is already the mechanism, pointed at
a different prefix.

## Where it landed

**223 commands and 97 KB became 5 commands and 1.9 KB**, measured against a real `claude` before
and after. The route was not a better filter; it was deciding what an agent is. ADR-0003 drops
the operator's config scope, and what remains is an allowlist the repository owns rather than a
denylist against a vendor's release cadence. `03`'s answer carries the whole argument.

## What was not decided, before the grilling

The list is scraped from the *user's own* global skill and plugin config. Research measured 48
entries from the author's personal setup (`.scratch/first-demo/research/02-claude-code-acp.md:341`),
and found `settingSources: []` did not fully suppress them. So the honest description of the
naive version is "the composer shows you your own Claude Code skills", several of which are
actively wrong for a team agent. Whether that is the feature is issue 03's question, and it is
the one that decides whether this is good or a mess.

## Issues

- `01-cache-available-commands.md` — **resolved 2026-08-29.** The runtime side is built:
  `AgentRuntime.availableCommands` and `onCommandsChange`, cached in the adapter, nothing in the
  event stream. Its answer carries the live measurement 03 was waiting for.
- `02-the-slash-affordance.md` — **ready.** What the composer does with it. Most of its weight
  moved: the list arrives curated at five entries, and the control itself is another session's
  cmdk work on the `@` suggestion list.
- `03-which-commands-may-be-advertised.md` — **resolved 2026-08-29**, by grilling the author
  through eight questions. It produced **ADR-0003**, an allowlist the repo owns, and a new
  effort at `.scratch/runtime-posture/` for the three hazards a menu filter cannot fix.
- `04-say-that-the-operators-skills-are-not-loaded.md` — ADR-0003's consequence, in the
  disclosure that closes team creation. Unbuilt: it touches a file another session holds.
