Type: task
Status: open
Blocked by: 01

# Hermes compacts itself, and blobot chose the moment

## Problem

`.scratch/transcript-scale/10` settled a rule that reads, in short: blobot writes no summary of
its own and never rewrites an agent's history, but it owns the **session boundary**, so at 80% of
the working ceiling it asks the agent for a handoff and opens a fresh session with it. That rule
was reasoned against Claude and Codex, where the CLI's own compaction is something a person types.

Hermes compacts on its own. `agent/context_compressor.py` runs a batch compaction when the
transcript crosses a threshold, and `compression.micro_compact` folds one exchange per turn into a
running summary at the end of every turn (`docs/micro-compaction.md`, off by default). Neither is
something the agent decided to do and neither is visible over ACP as anything but a `usage_update`
that suddenly reports a smaller `used`.

So on this runtime there are two owners of the same decision, and blobot's is the outer one. Three
ways that can go wrong:

- **Both fire.** Hermes compacts at its threshold, `used` drops, blobot's 80% trigger never fires,
  and the agent quietly loses fidelity in exactly the way the author's live run rejected: a
  self-compacted agent came back having lost too much, and that is *why* blobot stopped trying the
  runtime's own `/compact` first.
- **blobot fires first** and asks for a handoff, which is the intended behaviour, but the handoff
  turn itself is the most expensive one available and it is being asked of a transcript Hermes may
  already have half-summarised. The handoff refusal path (stops, empty, or over 6,000 characters
  keeps the old session) still protects it, but the margin is now measured against unknown content.
- **The gauge lies.** `_build_usage_update` estimates `used` with `estimate_request_tokens_rough`
  over history plus system prompt plus tool schemas, and `size` from `compressor.context_length`.
  It is honest about being an estimate. blobot's `context-ceiling.ts` clamps to the reported window
  and that arithmetic still holds, but the trigger is now reading an estimate rather than a
  provider's count.

## What to decide

1. **Can Hermes' own compaction be turned off for a blobot agent?** If the compressor's threshold
   is a config key under the agent's `HERMES_HOME` (ticket 01), setting it out of reach makes
   blobot the only owner, which is the arrangement the whole of transcript-scale/10 assumes.
2. **If it cannot, does blobot's handoff still apply on this runtime?** A defensible answer is
   *no*: `compaction` is already a per-agent switch on the profile (`on`/`off`, under *starting
   over when it runs out of room*), and a runtime that compacts itself is a runtime where blobot's
   default should be `off` with a reason on screen. That is not a retreat, it is the same rule
   -- blobot owns the boundary only where the boundary is blobot's to own.
3. **Micro-compaction stays off**, whatever else is decided. It rewrites already-sent history every
   turn, which breaks the provider prompt-cache prefix every turn, and blobot is not going to spend
   the user's tokens on a tuning option they did not choose.

Whatever is decided, the transcript must say it. A turn that ends short already says
`turn stopped · the context window is full` rather than naming a protocol enum, and an agent whose
history was compacted by something other than blobot is in the same category: the user should not
have to infer it from a gauge that moved.
