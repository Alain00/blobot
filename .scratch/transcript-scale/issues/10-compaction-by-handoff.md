Type: task
Status: resolved
Blocked by: 09

# Compaction by handoff, when the runtime's own is not enough

## Problem

A long-running agent fills its window, gets worse, costs more, and eventually stops. blobot
watches this happen and offers `/compact` in the palette, which the user has to know to type at
a moment nothing tells them about.

Proposed by the author 2026-08-30, after reading TanStack's compaction middleware
(`https://tanstack.com/ai/latest/docs/advanced/compaction`).

## Why TanStack's shape is not available to us

Their design is good and the good part is the split: `withCompaction` rewrites *provider
context* before each model call and leaves the canonical transcript untouched, so persistence
still sees the full history. Three strategies — `evictOldest`, `summarizeOldest`,
`clearToolResults` — triggered on an estimated token count crossing `maxTokens`, never dropping
the system prompt and never orphaning a tool call from its result.

All of it requires owning the array you send to the provider. We do not own it. This is the
whole of what goes out per turn (`claude-agent-runtime.ts:419`, and the same shape at
`codex-agent-runtime.ts:401` and `opencode-agent-runtime.ts:371`):

```
session/prompt { sessionId, prompt: [ ...attachments, { type: 'text', text } ] }
```

A session id and this turn's blocks. The conversation lives inside the CLI process, the API call
is made by the CLI with the CLI's credentials, and no ACP method hands us the history to rewrite.
Implementing their middleware means reimplementing the transcript and abandoning ACP sessions,
which is the third permanent rule inverted.

**And the cost argument runs the other way.** Compaction *is* cache invalidation: rewriting the
prefix guarantees a full cache miss on the next turn, by construction. It buys headroom and
quality. It does not buy cache economy, and a plan that expects it to will be disappointed by
the bill.

## What is available to us

A **session boundary**. We call `session/new`, we compose the persona, we hold the mailbox. So
the compaction blobot can do is: have the agent write a handoff, start a fresh session, and
resume from it.

blobot suits this unusually well, and the reason is architectural. **An agent's real state is a
git worktree, not a conversation.** A chat app that restarts a session loses everything. An
agent that restarts still has its branch, its commits, its working tree, and a `WORKSPACE` line
that says so. The handoff carries intent and what was learned. It does not have to carry the
work.

## What to do

**Two mechanisms, ordered, not one replacing the other.**

1. **The runtime's own compaction first.** It keeps the session id, costs one turn, and is
   written by people who can see the real message list and the real token counts rather than
   re-deriving them from outside. This is still "the CLI owns compaction" — blobot chooses only
   the moment.
2. **Handoff-restart as the fallback**, for a runtime with no compaction command, or a session
   far enough gone that compaction did not bring it under the ceiling.

**Trigger on occupancy, against ticket 09's working ceiling.** Not against the advertised window,
for 09's reasons.

**Do not trigger on time.** This was in the original proposal and it should not be built. Cache
expiry costs nothing by itself; it only means the next turn pays uncached rate for whatever
prefix exists. Restarting also pays uncached rate, for a smaller prefix, so the saving comes
entirely from **size** and time tells you nothing about size. Worse, a timer that fires on idle
teams is actively expensive: it wakes a team nobody is using, pays a full uncached read of its
whole context plus a summarize turn, to pre-pay a cost the user may never incur because they may
never open that team again. `TeamPool` holds three teams live precisely so switching is cheap. A
compaction timer turns that into a background spend nobody asked for.

**Fire with margin, because the handoff turn is the risk.** Only the agent can write the handoff,
so it costs one turn at maximum occupancy — the most expensive turn available and the one most
likely to stop on `max_tokens`. A truncated handoff plus a discarded session is worse than either
alone. Fire well below the ceiling rather than at it, and treat a handoff turn that ends on
anything but `end_turn` as a **refusal to restart**: keep the old session, say so, and let the
user decide. Ticket 04 already draws that ending.

**The handoff file does not live in the AgentWorkspace.** That is a checkout of the user's
repository, and an agent running `git add -A` commits it home. This is decided ground: it is the
exact reason `adapters/claude/permissions.ts` hands `allowedTools` over the wire instead of
writing a settings file. It goes under `~/.local/share/blobot/`, beside the worktrees.

## What survives a restart, and what does not

Checked, not assumed:

- **The loopback token survives.** It is per agent, not per session — `peer-message-server.ts:100`,
  "the token is the identity" — so a new session reuses it and the mailbox never notices. The
  server is stateless and the inbound handshake is what measures readiness, so a new session
  re-handshakes and that is the normal path, not a special case.
- **The mailbox survives.** It is orchestrator-side.
- **The workspace survives**, which is the whole argument above.
- **The session id does not**, so `session/load` on the old one is gone. Whatever the pool holds
  for that agent has to be replaced, not resumed.
- **Codex changes behaviour here, and it is a real one.** `developer_instructions` is stored on
  the session, and `.scratch/codex-runtime/issues/06` records that an edited persona does *not*
  take on a resumed session. A new session *would* take it. So a handoff-restart silently applies
  a persona edit the user made hours earlier, at a moment they did not choose. Decide whether
  that is a feature or something to say out loud; do not let it happen unnoticed.

## Open questions for the author

- **Consent.** Ticket 05 shipped on "nothing fires it automatically". The amendment on 05 records
  the reversal in principle, but not the shape: is this a per-agent setting beside `how it
  answers`, a per-team one, or on by default with a way out? It is per agent everywhere else in
  this app, because a workspace and a session are per agent.
- **Whether the user sees the handoff.** A file they can read and correct is the honest version
  and the reason to prefer this over an opaque `/compact`. But it is outside the worktree now, so
  reaching it needs a surface.

## Not to do

Do not summarize with an LLM call of blobot's own. The agent writes its own handoff, in its own
session, with its own credentials. blobot providing inference is the second permanent rule.

Do not touch the transcript. The conversation the user reads is a record of what was said, and a
session restart does not unsay any of it. This is `snapshot`'s territory and 02's, and nothing
here changes what is drawn above the composer.

## Done when

- Typecheck, tests and build pass.
- `MockAgentRuntime` grows a scenario that crosses the ceiling, so the whole path is testable
  without a real CLI, in the shape ticket 08 established for the traps.
- A test proves a handoff turn that ends on `max_tokens` leaves the original session live.
- A test proves the loopback token is unchanged across a restart and a queued peer message is
  delivered to the new session.
- Verified live on at least one real runtime, with the transcript kept.
- `CLAUDE.md`'s bullet and `.scratch/first-demo/build.md:857` both say "blobot does not compact".
  Whoever lands this corrects both, and dates the correction.

## Answer

Done, 2026-08-30, with one piece deliberately left open. blobot chooses the moment and still
writes no summary of its own.

**The two mechanisms, ordered as the ticket asked.** `AgentRuntime` grew `compacts` and
`compact()` — a capability and a verb, never a name, because the command is the provider's word
and stays inside the adapter (`adapters/acp/compaction.ts`, shared because it turned out to be
the protocol's shape rather than a provider's). It is read off what a session **advertised**,
before the palette filter, because what blobot may ask for on a person's behalf and what it
offers them in a menu are two questions. Where there is no compaction, or where the one that ran
left the session still over the line, `restart()` closes the session and opens a fresh one in the
same process: the bridge is not the problem and killing it would cost a second and a half for
nothing.

**Everything a fresh session needs is re-supplied rather than inherited**, and that is per
adapter because the reasons differ. Claude re-applies ticket 14's `default` mode and the user's
`set_config_option` choices, both of which name a session id. OpenCode re-asserts its persona
agent, which is ticket 16's finding — it restores the last used mode rather than the configured
default. Codex re-asserts its posture and is fatal if it cannot, for the same reason it is fatal
at start: the bridge's default mode wrote a file into the user's home directory without asking
once.

**Fired against `WorkingCeiling.tokens` at 80%, and the `measured` flag is drawn.** Ticket 09's
note asked for exactly that, and the line says `of 120k estimated` where nobody looked at the
model. The scenario that exercises this is the argument for the whole of ticket 09: 110,000 of
the mock's 200,000 window is 55% and a bar with room to spare, and it is 92% of the ceiling a
200,000 window actually gets. A trigger on the advertised window would not fire there at all.

**The refusals are the part that took the care.** `HANDOFF_STOPPED`, `HANDOFF_EMPTY`,
`handoffTooLong` and `RESTART_FAILED`, each leaving the agent as it was and each drawn in the
transcript. The last one is the honest half-truth and is written down as one: the old session is
already closed by the time an adapter finds out, so *"the session was kept"* is not quite true
there, and what is true is that nothing was compacted and the agent needs a relaunch.

**The three open questions, answered by the author 2026-08-30.**

- **Consent: per agent, on by default.** `compaction` on `AgentDefinition`, the profile row and
  the agent row; `auto` or `off`; NULL is `auto`. `CompactionPick` is `TrustPick`'s twin, built
  as one deliberately — the two controls in that form whose words are blobot's own should not
  need two shapes to read. On by default because a setting somebody has to go and find helps
  exactly the people who were already going to type `/compact`.
- **The user sees the handoff.** It opens inline under the line, and the archived path is drawn
  under the note rather than in the sentence. Not correctable before the fresh session takes it:
  that would make the restart a blocking prompt, which is a different feature and a much larger
  one. The archive is under `~/.local/share/blobot/handoffs/<team>/<agent>-<at>.md` with the ids
  in front matter, and a failure to write it is **not** a failure to compact — the note travels
  in the fresh session's first prompt and is in the transcript either way.
- **The Codex persona change is said out loud.** `AgentRuntime.personaIsSessionBound` is blobot's
  word for the provider fact, true on Claude and Codex and false on OpenCode, and the line reads
  `standing instructions re-read` only where the persona could actually have moved. A clause that
  is always there is a clause nobody reads on the day it matters.

**One thing changed after it worked, and it was found by looking at the screen.** The first run
drew three of blobot's own turns as three paragraphs in Alice's own voice, in a conversation
where nobody had asked her anything. A compaction turn is now published and recorded for what it
**did** and never for what it **said** — tool calls, occupancy and ending land as usual, and the
words go where they were addressed. That is a narrowing of *"do not touch the transcript"* rather
than a breach of it: the conversation the user reads is unchanged, and what was removed from it
was never part of that conversation.

**The done-when list, item by item.**

- Typecheck, tests and build pass.
- `MockAgentRuntime` grew `restart()`, a `restartFailure` option and two scenarios.
  `fills-up-and-keeps-going` ends **ordinarily** over the trigger, which is the case a kind mock
  would never produce — every other full-context scenario here ends on `max_tokens`, and a
  threshold that only fires on a turn that already failed fires too late. It advertises no
  compaction, so it is the only runtime in the repo that takes the handoff path at all.
- A handoff turn ending on `max_tokens` leaves the original session live: asserted, along with an
  empty handoff, an over-long one, and a restart that could not open.
- The loopback token and the mailbox across a restart: asserted as the behaviour that matters
  rather than as the field — a peer message queued during the compaction is delivered to the
  fresh session and answered there.
- `CLAUDE.md` and `.scratch/first-demo/build.md` both corrected and dated.

**Not done: the live run.** Neither `--live-claude` nor `--live-codex` has been pointed at this,
so `/compact`'s real cost, a real handoff's real length against `HANDOFF_LIMIT`, and whether a
real `session/close`-then-`session/new` behaves as the fake bridge does are all unmeasured. That
is this repo's usual standard and it is not met here yet. It belongs with the other live work in
`build.md`'s *Next session*.

## Fixed the same day, from the author's first live run

The compaction itself worked on a real Claude agent — `context compacted · 223k of 200k
estimated`, the runtime's own command, session kept. Two things went wrong around it, both mine,
both now fixed with tests.

**A prompt sent during a compaction was refused and lost.** The terminal read
`a turn is already in flight — the orchestrator's mailbox exists so this cannot happen`, thrown
by `ClaudeAgentRuntime.sendPrompt` out of `promptFromUser`, and the agent never answered.

`promptFromUser` had never checked `#busy`. It did not need to: until this ticket the only turns
were ones the user or a peer began, and the composer is downstream of the status those produce,
so a second user prompt could not overlap one. **A compaction turn is neither**, so a person
typing a perfectly ordinary next message — their agent had just finished answering, as far as
they could see — reached an adapter that correctly refused it. The message had already been
committed *and marked delivered*, so it sat in the transcript with nothing left that would ever
answer it.

The fix is not new machinery: the mailbox is exactly this queue and always was. A prompt for a
busy agent is committed and drawn and simply **not marked delivered**, and `#runTurn`'s own tail
drains it — the path a mid-turn peer message has always taken. The comment on that line says why
it was safe to omit for so long, because the next person to read it will wonder.

**And `#maybeCompact` now refuses to start while a turn is in flight.** `#runTurn` clears `#busy`
before it asks whether to compact, so there is a microtask between that clear and the
compaction's first turn where a user prompt can slip in. Skipping is right rather than waiting:
the check runs after every turn, so the next one asks again.

**A third fix, defensive.** `#runTurn` deleted `#busy` in a `finally` whether or not that call had
set it, so the refused prompt above cleared the flag the live compaction turn was holding, and
everything that asked about the agent afterwards got a wrong answer. It now only clears what it
claimed. That turns a caller's mistake into a loud failure instead of a quiet corruption.

**What this says about the ticket.** The mechanism was right and the tests covered it; what they
could not cover was a person typing at a moment blobot had invented. That is the argument for the
live run this answer already listed as outstanding, and it is still outstanding for the handoff
path — the run above exercised only the runtime's own compaction.

## Amendment, 2026-08-30: the handoff is the only mechanism

**Reversed by the author, on the evidence of the run above.** This ticket said "two mechanisms,
ordered, not one replacing the other", and put the runtime's own compaction first. That ordering
is now gone: blobot asks for a handoff and starts a fresh session, always, and never reaches for
`/compact` on somebody's behalf.

**The reason is quality, and it was measured rather than argued.** The live run compacted a real
Claude agent at 223k with the runtime's own command, and the author's verdict on the result was
that it loses too much. The case for going first was cost — one turn, and the session id
survives. The case against it is that a cheap compaction which leaves an agent unable to continue
is not cheaper than an expensive one that leaves it able to. Quality is the whole reason this
ticket exists; the ordering was optimising the wrong axis.

**What this ticket got right and what it got wrong.** Right: that blobot owns a session boundary
and that a handoff is survivable *because an agent's real state is a git worktree*. Wrong: the
assumption, never tested when it was written, that a runtime's own compaction is better because
its author can see the real message list. Being able to see the messages is not the same as
knowing which of them mattered, and the agent itself is the only thing that knows that. That is
the argument the handoff was always making and it turns out to apply against the alternative too.

**What went with it.** `AgentRuntime.compacts` and `compact()`, `adapters/acp/compaction.ts`, the
per-adapter command lookup, and the `fills-up-and-can-compact` scenario. `how: 'command'` stays in
the event vocabulary and in the transcript's words, because rows written before this exist — the
author has one — and a stored line must still draw.

**`/compact` stays in the composer's palette.** What changed is what blobot reaches for on
somebody's behalf, not what a person may choose to type. Ticket 05's rule is untouched: the gauge
still advises nothing.

**The cost, stated plainly.** Every compaction is now two turns and a discarded session rather
than one turn that keeps it. The refusal path matters more than it did, because there is no
cheaper thing to fall back to: a handoff that stops, is empty, or runs long leaves the agent
exactly where it was, and the transcript says so.

## The handoff path, run live, 2026-08-30

**The one outstanding item on this ticket is closed.** The handoff path had never touched a real
runtime: the live run above exercised the runtime's own compaction, and the amendment then deleted
that mechanism, which left the surviving path the untested one.
`packages/core/src/orchestrator/live-compaction.test.ts` runs it end to end against a real
`claude` under `BLOBOT_LIVE_CLAUDE=1`, and it passes.

**No source was edited to make it fire.** `contextCeilings` is already an `OrchestratorOptions`
field, so the test injects a 1,000-token ceiling for the agent and the first real turn trips
`overCompactionThreshold` on its own — 26,970 used against it. Lowering `COMPACTION_TRIGGER` by
hand, which the previous handoff note suggested, is a source edit somebody has to remember to
undo. The map is read at check time, so raising the entry after the compaction is how the test
says *stop now* and avoids paying a second handoff turn to ask one question.

**What it asserts, and why each one needed a real agent.** That a real Claude handed
`HANDOFF_PROMPT` at occupancy answers with a handoff at all rather than stopping on `max_tokens`;
that it comes in under `HANDOFF_LIMIT`; that `restart()` really closes the conversation, so the
fresh session has genuinely lost it; and — the only part a mock cannot approximate — that what the
agent wrote is **enough to carry the work across**. The successor is asked what it is doing, and
the only route from the closed session to that answer is the handoff.

**The measurement.** 1,473 characters, against a 6,000 limit. Firing with margin is not the
binding constraint it was feared to be; the refusal path is real but it is not the common case.

**The specimen, which is the thing nobody in this repo had seen.** Verbatim, first person, and
notable for what it does *not* do — it does not retell the conversation, which is what
`HANDOFF_PROMPT` spends three sentences trying to prevent:

> Handoff — ZUCCHINI-42 (widget cache never expires)
>
> Where I am: essentially at the start. I have not written any code, and I have not yet read the
> source. The user explicitly told me to hold off on writing code, so if you pick this up, don't
> start editing until they say go.
>
> What I've established: only the decision that the fix belongs in `src/cache/widget.ts`, and that
> the intended shape of the fix is adding a TTL so entries expire. That's it — I reached that
> conclusion before this conversation and I did not verify it against the file in this session.
> Treat it as a working hypothesis, not a finding. Nothing has been ruled out, because I haven't
> tried anything yet.
>
> What I have not done, and you should not assume: I haven't read `src/cache/widget.ts`, haven't
> looked for other callers or a second cache layer, haven't checked whether there's an existing
> TTL/expiry helper elsewhere in the repo to reuse […] I don't know the branch state beyond "same
> branch, same working tree" — check `git status` and `git log` yourself rather than trusting me
> on it.
>
> What I was about to do next: read `src/cache/widget.ts` in full, find its callers, and confirm
> the TTL belongs there rather than at the call sites or in a shared cache utility. […]

**The finding worth keeping.** The agent separated *what it established* from *what it assumed*
unprompted, and told its successor not to trust it on the branch state. That is the behaviour the
whole mechanism is betting on and it was not asked for by name. The prompt's three deliberate
choices — the successor **is** this agent, the worktree survives, no summary of the conversation —
each show up in the output: first person throughout, no transcribed code, and an explicit
instruction to go and re-read `git status` rather than a remembered version of it.

**And the successor used it.** Asked in a fresh session what ticket it was on, which file it had
chosen and what it was about to do, it answered with all three and kept the hedge:

> ZUCCHINI-42 (widget cache never expires) — the fix is **hypothesized** to belong in
> `src/cache/widget.ts` via a TTL, and I was about to read that file in full and find its callers
> to confirm the TTL belongs there rather than at the call sites or in a shared cache utility.
