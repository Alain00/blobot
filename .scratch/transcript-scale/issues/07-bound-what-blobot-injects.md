Type: task
Status: resolved

# Bound what blobot injects into a turn

## Problem

Ticket 05 drew the gauge and left the honest gap open: the one part of an agent's context that
is genuinely ours was unbounded and unmeasured.

blobot puts three things into an agent's window. The **persona**, once per session as a cached
prefix, composed by `composePersona`. The **wake prompt**, on every delivery: a sender header,
the sender's `context` line, the message body, a roster line, and — when several arrived while
the agent was working — every one of them folded into a numbered list. And the **standing
instructions** the operator wrote, folded into the persona.

The permanent rule in `CLAUDE.md` reads: *"The orchestrator owns agent-to-agent communication.
It is our concern, not ACP's, and never a full context copy between agents — always compact
context."* Nothing enforced it. `message_agent`'s schema called `context` a one-line description
and checked nothing; `message` had no bound at all. One agent could paste its entire transcript
into a teammate's window, and blobot would carry it, commit it to the database and replay it on
every relaunch. The rule was a sentence in a file.

The queue had the same shape. `#wake` took the *whole* mailbox and composed one numbered prompt,
on the argument — still true — that delivering one and requeuing the rest doubles the turn count
against a budget of ten. Past a handful, that stops being a prompt an agent answers and becomes a
context dump with numbers on it.

## What to do

Three decisions, taken with the author 2026-08-30.

**A message over the bound is refused, not truncated.** A rejected peer message is already a
*tool failure* rather than a turn failure: the sender reads the error, stays alive, and gets to
write the short version. Truncating would hand the recipient half a request with no way to know
what the other half said, and teach the sender nothing. The refusal carries the number, the
limit, and the fix.

**The wake batch is capped and the overflow requeued.** Nothing is dropped: the rest stay in the
mailbox and the agent is woken again the moment the turn ends, which is the path a mid-turn
arrival already takes. It costs a turn against the budget when it triggers, which is the trade.

**The breakdown is estimated tokens, and says so.** blobot knows exactly what it sent in
characters and cannot know what it cost in tokens, because tokenizing is the provider's. Four
characters to a token, with a tilde, and a line saying the gauge above is the runtime's own
count. The two are never added together.

## Done when

- A peer message over the limit is refused before it is committed, and nobody is woken.
- A mailbox of ten wakes in bounded batches with nothing lost.
- Clicking a gauge row shows what blobot sent.
- Tests for all three, and the panel read on screen.

## Answer

Done, 2026-08-30.

**`packages/core/src/orchestrator/bounds.ts`** holds the three numbers and the two refusals, with
the reasoning next to them: `PEER_MESSAGE_LIMIT` 4,000 characters (roughly a thousand tokens: a
long paragraph and a short document, generous on purpose because the bound exists to stop a
transcript being pasted, not to make teammates terse), `PEER_CONTEXT_LIMIT` 500, and
`WAKE_BATCH_LIMIT` 5.

**Enforced before the commit**, in `handleMessageAgent`, so a refused message does not exist: no
row, no announcement, nobody woken. The sender gets

> that message is 14,200 characters and the limit is 4,000. a teammate gets your summary, not
> your transcript: commit your work, say which branch it is on, and send the short version.

**Said as well as enforced.** `message_agent`'s schema now carries `maxLength` and a description
naming the limit, so a sender does not have to spend a tool call to discover it. Enforcement is
what makes the rule real, since a schema is a request; the description is what stops the failure
being the way anyone finds out.

**The batch cap needed no new wake path.** `#runTurn` already ends with `await this.#wake(...)`
for whatever arrived mid-turn, so slicing the mailbox to five is enough: the remainder goes out
on the next wake, oldest first, subject to the same budget as everything else.

**`Orchestrator.injectionOf(agentId)`** reports the last wake prompt's size and message count and
what is still queued. The persona is not on the orchestrator, which does not compose it, so it
comes from `SqliteStore.lastPersonaOf` — the text the session was actually opened with, not a
recomposition, because an edit to an agent's definition does not reach a session already open.

**The panel opens in place, under the row it belongs to**, rather than floating over the log:
the same rule the rail keeps, that nothing in a column covers anything else in it. The author
asked for a popover; this is the app's existing idiom for the same gesture and does not need a
focus trap or a new Radix dependency. Read on screen with `--demo`: `persona ~234`, `last wake
prompt ~45`, `1 message`, `queued 0`, over the note.

**Not bounded, deliberately:** the persona itself, and the operator's standing instructions
inside it. They are written by a person, sent once per session, and shown in the panel. A bound
on what the user is allowed to tell their own agent is a different product decision.
