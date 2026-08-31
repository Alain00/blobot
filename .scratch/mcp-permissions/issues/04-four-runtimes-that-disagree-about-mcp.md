Type: grilling
Status: open
Blocked by: 01

# Four runtimes that disagree about MCP, and one word that has to mean one thing

## Question

`first-demo/14`'s rule: **a claim that holds on one runtime and not the other is worse than no
claim.** MCP breaks it on both axes at once, and the breakage is currently invisible because
blobot has never surfaced anything about MCP.

On what is on record before ticket 01 measures it:

| runtime | inherits the user's servers | prompts on an MCP call |
|---|---|---|
| Claude | yes, and by design (`first-demo/07`) | yes, under forced `default` (observed) |
| Codex | unknown | yes, **every** call (observed) |
| fx | **no**, by vendor documentation | yes (precautionary, unobserved) |
| OpenCode | unknown | **no**, ungated (`first-demo/03`) |

## What to establish

- **Whether a vouch list can mean the same thing on all four.** On OpenCode it would mean
  nothing, because nothing asks. Making the word true there means blobot **adding** prompting it
  currently does not impose -- the opposite direction from every other posture decision, and a
  regression in capability sold as a feature. Establish whether `OPENCODE_CONFIG_CONTENT` can
  even express an MCP permission, and what the word says if it cannot.
- **Whether the honest answer is `AgentRuntime.accepts` again.** The precedent is exact: blobot's
  own word for what a runtime takes, so the renderer names the decision and still cannot tell
  which runtime is behind it, and `MockAgentRuntime` being the only one that says no is why the
  refusal path is exercised at all. `CODEX_EXPRESSES_TRUST` and `FX_EXPRESSES_TRUST` are the same
  shape a second time: *three words answer one mode, and the adapter says so rather than letting
  the picker imply otherwise.* A third instance of that pattern is not a smell -- it is the
  architecture working. Establish what the flag is called and what the UI does with `false`.
- **The inheritance asymmetry is the bigger half.** Prompting can be equalised by blobot
  answering on its own side (ticket 03). **Capability cannot.** If a Claude agent can reach
  meta-ads and an fx agent cannot, no permission design fixes that, and it is a fact about the
  team the user builds rather than about the posture they choose. It may belong on the hire
  dialog beside the runtime picker, where the four detection states already live.

## The honest failure mode

That this ticket concludes "state it and move on" for the fourth time, and blobot accumulates a
set of runtime capability disclaimers that are each individually honest and collectively read as
a product that does not know what it is. `accepts`, `CODEX_EXPRESSES_TRUST`, `FX_EXPRESSES_TRUST`
and now this. Somewhere there is a number of these that is too many, and this ticket is a
reasonable place to ask whether it has been reached.
