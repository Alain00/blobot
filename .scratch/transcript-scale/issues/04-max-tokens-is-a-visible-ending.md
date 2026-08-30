Type: task
Status: needs-triage

# `max_tokens` is a visible ending

## Problem

blobot does not manage the agent's context and should not: `turnBudget`
(`orchestrator.ts:341`) bounds turns per user prompt, which is a cost guard, and compaction
belongs to the CLI behind the adapter. That is the rule and it is the right rule.

What is ours is the ending. The adapter already translates `max_tokens` through rather than
swallowing it (`adapters/claude/translate.ts:139`), with a comment saying exactly why: a
refusal that renders as a silent stop is a bug report waiting to happen. The same is true of a
turn that stopped because the agent ran out of room.

Unverified: what the pane actually *draws* when a turn ends that way. The stop reason reaches
the UI; whether the reader can tell the difference between "finished" and "ran out" has not
been checked.

## What to do

Check it first, then decide whether there is work here at all. `MockAgentRuntime` already
exists to reproduce endings like this, so a scenario that stops on `max_tokens` is the
instrument.

If the ending is invisible, give it a mark. Monochrome, in the transcript's own vocabulary,
saying that the turn ended early and why. `DESIGN.md` governs what that looks like and what it
may say; read it before writing the string, and no em dashes in copy the user reads.

Do not add a remedy. Suggesting compaction, or offering to continue, is a product decision
nobody has made and would put blobot in the business of managing a context it has said it does
not manage.

## Done when

- A mock scenario ends a turn on `max_tokens`, and a test asserts what the pane shows.
- The same for `refusal` and `max_turn_requests`, which arrive down the same path and have the
  same failure mode.
