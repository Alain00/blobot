Type: grilling
Status: resolved
Blocked by: 04

# MockAgentRuntime's fidelity contract

## Question

The mock exists so the UI can be finished for $0 — but a mock that is too kind produces a UI
that shatters on first contact with a real agent.

Decide exactly what it simulates and, more importantly, what it simulates *badly on purpose*:
streaming with realistic chunking and latency, tool calls, agent-to-agent messages, and the
ugly cases — a turn that errors halfway, a runtime that dies, a cancellation that arrives
late, an agent that takes ninety seconds to say anything.

Decide also how it is driven: scripted scenarios, deterministic seeds, or live control.

## Answer

### It ships, as a demo mode

Not dev-and-test only. For an OSS project this is disproportionately valuable: the README's
screenshot becomes something people can **run in thirty seconds** without installing Claude Code
or authenticating anything — the honest way to show what blobot is before asking for trust. The
mock is being built regardless; shipping it is a menu entry.

Not the first-run default, though: defaulting to fake agents risks someone concluding the product
is a toy, or worse, not noticing the agents are not real.

### Faithful by default — it reproduces the traps on purpose

**A mock that is too kind produces a UI that shatters on first contact.** Every ugly behaviour the
research observed is now a *known* hazard, and reproducing it is free insurance. Each one omitted
is a bug deliberately deferred until it happens in front of someone.

Reproduce, by default:

- **Ragged deltas** — bursts of three fragments in the same millisecond, then a 130ms gap. An
  evenly-paced mock produces a UI that looks smooth in dev and janks in production.
- **A cancelled tool reporting `status: "completed"`** with `exit: null`. Without this, someone
  writes `if (status === 'completed') showSuccess()` and ships it.
- **`usage_update` reporting `used: 0` on cancel** — the context-gauge reset that renders as a bug.
- **Tool failures that continue the turn** rather than ending it.
- Runtime-lifecycle failures: spawn failure, process death between turns, a turn that errors
  halfway, a cancellation that lands late, an agent that takes ninety seconds to say anything.

### Driven by checked-in scenarios, with a live control panel for development

**Scenarios are the backbone.** Named and checked in — `alice-asks-bob`, `bob-fails-midturn`.
They are what tests assert against and what demo mode plays, and being in the repo makes them
reviewable: "does the app handle a runtime dying mid-turn?" becomes a file rather than a memory.

**A dev control panel** for pushing events by hand earns its place separately — while building the
conversation panel, firing a `tool_call_updated { status: failed }` by hand beats editing a script
and restarting.

**Rejected: deterministic seeds.** Seeded randomness means a failing test reports *seed 4823 broke*
and leaves you to reverse-engineer what that was.

### Scenario format: a builder that expands to events

`think(2s); callTool('bash', 'ls'); say("done")` — expanding to the flat `AgentEvent` stream.

A raw event list is unreadable and unwritable at any length: spelling one sentence means
hand-authoring delta fragments, and the ragged-burst realism would have to be typed out by hand.
The builder keeps the *intent* legible while the expansion owns the ugly realism.

Real captured transcripts (from the research) are a **source to derive scenarios from**, not the
runtime format — a raw transcript cannot be parameterised by agent name or team.

### Time is injected

The runtime takes a **clock as a dependency**: real in demo mode, virtual and fast-forwarded in
tests.

Timing *is* the behaviour under test for a streaming UI — "does status settle correctly when a tool
completes 5ms after a delta" is exactly the class of bug this mock exists to catch, and it is only
testable if time is controllable. One constructor parameter, and it keeps both other options open.

It also lets the demo scenario include a deliberately slow agent: ninety seconds of `thinking` is a
real experience blobot must not look broken during, and nobody will build for it unless they have
watched it.

### Peer messages go through the real handler, not the real socket

Mock-Alice's `messageAgent` calls the orchestrator's **tool handler function directly**, skipping
loopback HTTP.

Declaring that a message was sent would test nothing — the mailbox, persistence, wake logic and
queueing are precisely the code most likely to be wrong. Going over real HTTP would be the most
faithful and would additionally cover the transport, but it makes every test depend on a live port:
flaky in CI, slow, and redundant, because the transport is proven against **real runtimes** in
ticket 15, which is where it belongs.

### What the mock is obliged to make reachable

**The orchestrator's behaviours** — mailbox, queueing, turn budget, status derivation, persistence,
and every failure path above. These are the things with no other reliable way to be provoked, and
where the real bugs live.

Headless UI testing falls out free once status is a pure fold over events. **Electron end-to-end is
explicitly not a target** — slow, brittle, and it would load the mock with requirements unrelated to
agent fidelity.
