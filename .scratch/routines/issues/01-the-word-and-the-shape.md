Type: task
Status: resolved

# The word, and what a Routine is made of

## Problem

The author said *coroutine*. The word already means a suspendable function, and the glossary's
standing rule is that we use one word per concept and do not drift. Ten files are about to be
written; the name is cheapest to settle now.

Second half of the same ticket: **what is on a Routine.** Not the schema (issue 09) — the
concept, in the glossary, in one paragraph a person can hold.

## The proposal

> **Routine** — a named, repeatable instruction to one Agent, delivered on a schedule instead of
> by a person. It is a prompt with a clock behind it: the same words, the same single recipient,
> the same turn, the same budget. It is not a sequence, it has no steps and no output that feeds
> anything. A Routine belongs to an Agent on a Team, because a turn needs an AgentWorkspace, a
> session and a mailbox, and none of those are the Team's to lend.
>
> **Firing** — one due moment. **Run** — the turn a firing started, and everything that followed.
> A firing that starts no turn is *skipped*, and the reason is recorded.

Fields, in concept: a name, the prompt, the recipient Agent, the schedule, whether it is **armed**,
and when it last fired. Nothing else, and specifically **no owner field for "who wrote it"** until
issue 05 says an agent may write one.

## Why not the alternatives

- **Schedule** as the noun: it names the clock, not the work, and the interesting thing here is
  the work. It survives as the field name.
- **Job** / **Task**: both already mean something in every neighbouring tool, and *task* is what
  the user calls the thing they asked for, not the thing that repeats.
- **Cron**: a syntax, not a concept, and issue 02 may find blobot cannot honestly claim it.

## Resolving this

An `## Answer` here, a **Routine** entry added to `CONTEXT.md` under a new *Automation* heading,
and the effort's files renamed if the answer is not *Routine*.

## Answer

**Resolved 2026-08-30. The word is Routine**, and the concept is the one drafted above, unchanged.
`Firing`, `Run` and `skipped` come with it. `Schedule` survives as the field name only.

The glossary entry is written into `CONTEXT.md` under a new **Automation** heading, and it carries
the two facts a reader has to have before they read anything else in this effort: a Routine
belongs to an Agent and not to a Team, and it fires only while blobot is open.

`Cron` is added to the glossary's **Avoid** list, alongside *worktree* and *authenticated*, and for
the same kind of reason: it names a mechanism blobot does not implement and promises a guarantee it
cannot keep. Issue 02 settled that; this is where the word is buried.

**No owner field.** Issue 05 landed after this was drafted and adds exactly one: `proposed_by`, an
agent id, present only on a proposal. That is not *who owns this* — it is *who asked*, and the
distinction is the whole of issue 05.
