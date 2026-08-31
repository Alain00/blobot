# Does a turn with no words in it work? Measured, 2026-08-31

Probe: `initialize` → `session/new` → `session/prompt` with `prompt: []`, spoken directly over
stdio, no persona, no MCP servers, cwd a scratch directory. Script kept at
`prototypes/` sibling in the session scratchpad; it is twenty lines and reproducing it is cheaper
than storing it.

## The schema permits it

`PromptRequest.prompt` in `@agentclientprotocol/sdk`'s `schema.json` is `type: array` with **no
`minItems`**. An empty prompt is protocol-valid, so anything below is the agent's own choice
rather than a validation the protocol forced.

## What the four actually did

| runtime | version | result |
|---|---|---|
| **Claude Code** | bridge 0.70.0 | **Accepted.** `stopReason: end_turn`, 17 output tokens. Said *"I'm ready — what would you like me to work on?"* |
| **Codex** | bridge 1.7.0 | **Accepted.** `stopReason: end_turn`, 16 output tokens. Said *"What would you like me to..."* |
| **OpenCode** | 1.18.4 | **Accepted, and confabulated.** Invented a task nobody asked for, thought about *"the consumer, start() method, and how consumePackets is called, especially the reconnect flow"*, called `read` twice and raised two `session/request_permission` calls for paths **outside the cwd**. Had not returned after 90 seconds. |
| **fx** | 0.0.7 | **Refused.** `-32602`, `"Empty prompt"`. A parameter validation, before any model call. |

## What this settles

**A wordless turn is not available.** fx rejects it at the protocol boundary, before inference, so
no persona and no configuration can rescue it there. One hard refusal out of four is enough: blobot
cannot have a mechanism that three runtimes support and the fourth cannot.

**And it would be a bad mechanism even where it works.** Claude and Codex both did the graceful
thing unprompted, which is encouraging, but OpenCode shows what an undefined prompt actually is: a
vacuum the model fills. It invented a task, went reading, and asked for permissions. The persona's
conditional would very likely have prevented that — it had none here — but the measurement is that
*an empty prompt carries no instruction, and a model with no instruction does not reliably wait*.

**An empty turn is not a free turn.** Claude reported 36,451 total tokens and a cost of $0.21 for
seventeen output tokens: the turn pays for the whole cached system prefix whatever is in the
prompt. Relevant to what a briefing turn costs, and to the ticket that picks the bounds.

## Incidental observations, not blobot defects

- Both Claude and OpenCode advertised the operator's own `~/.claude` skills in
  `available_commands_update`. That is ADR-0003's `user` scope, working as decided.
- OpenCode's reads reached outside the cwd it was given. The probe supplied **no**
  `OPENCODE_CONFIG_CONTENT`, so ticket 14's permission posture was absent. This is what an
  unconfigured OpenCode does, not what blobot's does.
