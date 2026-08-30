Type: task
Status: resolved

# Mock a coordinator that forgets to route

## Problem

Ticket 08's thesis is that a kind mock produces a UI that shatters on first contact with a real
runtime, which is why `MockAgentRuntime` reproduces the observed traps on purpose: ragged
deltas, a cancelled tool reporting `completed`, `used: 0` on cancel.

A coordinator has an obvious trap of its own, and it is the one from issue 02: **it reads the
user's message, answers in prose, and never calls `message_agent`.** The work silently never
happens, the transcript looks healthy, and the user finds out later.

Related and already observed live: asked to message Bob, Alice ignored blobot's tool, called
Claude's own `ListAgents`, found three unrelated sessions and reported Bob unreachable. That
was fixed for that route by `SHADOWING_TOOLS`, and it is the same failure shape.

## What to build

A checked-in scenario in `packages/core/src/mock/` where the coordinator acknowledges a request
and routes nothing, so that whatever is built for issues 01 to 04 has to face it before a real
CLI is spawned.

## What it forces a decision about

Whether blobot detects this at all. It can see that a user prompt produced a coordinator turn
with no outbound message, which is a signal it does not currently look for. Whether that is
worth surfacing, and as what, is the question the scenario is meant to make unavoidable.

## Done when

The scenario exists and the coordinator design has an answer for it that is not "the model will
remember".

## Reframed, 2026-08-30: the trap is a peer's, not a coordinator's

Issue 02 closed with **no coordinator**, and this ticket survives it — unblocked, and about a
failure that exists in the product today rather than one a coordinator would have introduced.

Alice is asked to get Bob on the API side. She answers *"I'll ask Bob to review it"*, never calls
`message_agent`, and the transcript looks healthy. Nothing about that needs a router: it is the
`SHADOWING_TOOLS` failure shape, observed live, in the ordinary two-agent case.

**blobot surfaces it, and never repairs it.** Decided in the grilling:

- **The trigger is lexical and scoped**: the turn's text names a teammate **whom the user named
  in the prompt that started it**, and no message reached that teammate. The orchestrator can
  already see this — it counts turns and owns `handleMessageAgent`, so nothing new is plumbed.
- **Scoped, because unscoped is noise.** "Bob's branch is fine" names Bob and promises nothing.
  A warning that fires on shop talk is a warning nobody reads, which is worse than silence.
- **Never inference.** Detecting a *promise* means reading prose, and blobot provides no
  inference. A name and an absence are both facts.
- **Worded as an observation, never an accusation**, and it offers no button that sends the
  message for her: blobot deciding what the message should have said is blobot doing inference.
- **Known limitation, on the record**: it cannot see a promise made about a teammate the user
  never named.

So this ticket is now two things: the checked-in scenario in `packages/core/src/mock/` where an
agent says it will message and does not, and the system line that scenario exists to produce.

## Answer

**Built 2026-08-30.** The scenario is checked in and the system line it exists to produce is on
screen. Nothing repairs anything.

### The scenario

`promises-bob-and-forgets` in `packages/core/src/mock/scenarios/index.ts`. Alice thinks, reads
`src/auth.ts`, says *"I will ask Bob to review the retry loop while I carry on with the token
store"*, and ends `end_turn`. Every event in it is healthy, which is the whole trap: there is no
error, no failed tool and no unusual stop reason, so nothing in the event stream marks it. The
only way to see it is to know what the user asked and count what was sent.

### The observation

`Orchestrator.onSilentHandoff`, next to `onBudgetExhausted` and for the same reason: this is an
orchestrator observation, not something a runtime reported, and ticket 04's nine-member event
vocabulary is the runtime's. A tenth member would have put a fact blobot inferred into the
stream a provider owns, and the recorder would then persist it as though a runtime had said it.

It fires when **all** of these hold, and each one narrows on purpose:

- The turn was started by **the user's prompt**, not by a peer. A wake is somebody else's words.
- The prompt **named that teammate**, lexically. `namesMentioned` in `orchestrator/roster.ts`:
  word boundaries, case-insensitive, `@bob` and `Bob` the same thing, `Bobbin` not Bob, and
  `bob@example.com` nobody.
- The turn's **answer** names them too. The answer only, never the reasoning: a name in
  thinking the user never sees cannot be a handoff they are waiting on.
- **No message reached them**, counted in `handleMessageAgent` where the row is committed rather
  than read back out of the transcript.
- The turn **ended `end_turn`**. A refusal or an error already says on screen that the turn
  stopped, and an absence inside a turn that never finished is not a promise anybody broke.
- They were **not themselves addressed by that same prompt**. This one is not in the grilling
  and is a judgement call worth naming: under fan-out, `@alice @bob fix this` gives Bob the
  user's own words already, so Alice not forwarding them costs nothing. Firing there would be
  the noise the scoping rule exists to prevent. Same principle, one case further.

### What it says

A `system` item in the transcript, standing where the turn ended, drawn as the hairline sysline
the stopped-turn line already uses:

    ALICE · NAMED BOB · NO MESSAGE SENT

Two facts and nothing else. No button sends the message for her, because composing the message
she did not send is blobot deciding what it should have said, which is inference. It is not a
banner: it is about one turn and belongs where that turn ended, and the team pane names who.

### Known limitations, on the record

- It cannot see a promise made about a teammate the user never named. Widening it there means
  reading intent, which is the line.
- It is **not persisted**. A reloaded transcript loses it, exactly as `turn stopped · refusal`
  is lost, because both are derived from a live stream and neither is in the durable subset.
  If it should survive a restart it becomes a recorder question, and it is not one yet.
- The shipping demo does not play it *by default*. That team's arc ends on ticket 14's
  permission block on purpose. It is a flag away instead: `demoScripts` in
  `apps/desktop/src/main/demo-team.ts` is the table of runs the demo can play, and
  `--demo-scenario=forgotten-handoff` picks this one. A run's **prompt travels with its
  scripts**, because they are only legible together: this scenario needs a prompt that names
  Bob, and picking a scenario without its prompt is how you get a run that looks like the
  feature is broken. `pnpm demo -- --scenario=<name>` reads the same table, so the headless
  loop and the app never disagree about what a name means. An unknown name is refused with the
  listing rather than quietly defaulted.

### Covered

Six cases in `orchestrator.test.ts` — it fires; it stays quiet when the message went, on shop
talk the user never asked for, on an agent the user addressed directly, on a turn that stopped
short, and on a turn a peer started. Five on `namesMentioned` in `roster.test.ts`. Three in the
renderer's `model.test.ts` on the wording, the several-name list and the double delivery. Seen
on screen against the mock.
