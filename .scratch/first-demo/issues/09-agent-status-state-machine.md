Type: grilling
Status: resolved
Blocked by: 04

# The agent status state machine

## Question

The plan names seven statuses — idle, starting, thinking, working, waiting, failed, done —
but not the transitions, and not who owns them.

Decide the machine: which transitions are legal, which events drive each one, what
distinguishes `thinking` from `working` and `waiting` from `idle` in a way an adapter can
actually determine, whether `done` is an agent state at all or a property of a turn, and
what happens to status when the app is closed and reopened.

Status is what the UI renders and what makes two blobatars look alive, so a status the
adapter can only guess at is worse than one status fewer.

## Answer

### Seven statuses — `done` dropped, `responding` earned

| Status | Means | Derived from |
|---|---|---|
| `idle` | alive, nothing in flight | no turn in progress |
| `starting` | process spawning / session being created | runtime lifecycle, before the first turn |
| `thinking` | reasoning | `agent_thought_delta` |
| `working` | a tool is in flight | `tool_call_started` without a terminal `tool_call_updated` |
| `responding` | streaming its answer | `agent_message_delta` |
| `waiting` | **a human must act before this agent moves** | permission callback outstanding |
| `failed` | cannot be spoken to; needs a restart | fatal `error`, dead subprocess |

**`done` is dropped.** An agent that finishes a turn is idle, not done — the two would be
indistinguishable to every adapter and to the UI, and a status nobody can compute is worse than
one fewer. `done` belongs on a Task whenever tasks exist.

**`responding` is added**, and it is the one addition worth defending. The demo's whole appeal is
glancing at two blobatars and knowing what each is *doing*; "reasoning", "running a command" and
"answering" are different things to a watcher, all three are computable from a single event kind
with no guessing, and both runtimes emit all three.

**`waiting` is narrow by construction.** Since replies are explicit and Alice never blocks on Bob,
an agent waiting on a peer is simply `idle`. The only genuine block is a permission prompt. If
ticket 14 configures permissions to auto-allow, this state exists and is never entered — which is
fine, and better than not being able to shout about the one state where an agent sits forever
unless a human looks.

### Precedence: `waiting` > `working` > `responding` > `thinking`

Signals overlap — a tool can be in flight while text streams. Last-event-wins would make the
blobatar flicker between states several times a second, which is visually noisy and unreadable at
a glance, defeating the point. A flag set would push the decision into the UI, where every
consumer reinvents it.

The ordering encodes what a watcher most needs to know: *is someone blocked on me* beats *is it
touching my files* beats *is it talking* beats *is it musing*.

### Derived, never persisted

Status is a **pure fold over the event stream plus the runtime lifecycle**, held in memory and
computed fresh each launch. Persisting it invites the bug where SQLite says `working` and nothing
is running — and since the restart answer is a constant (below), there is nothing to read back.

What *is* persisted is the activity log — the events themselves — which is a different thing and
belongs to ticket 13.

### Only process-level failure is sticky

The distinction that matters is whether the agent is still **viable**:

| Outcome | Status |
|---|---|
| `stopReason: cancelled` | `idle` — that was the user pressing stop |
| `stopReason: refusal` / `max_tokens` / `max_turn_requests` | `idle` — the turn ended unusually, Bob is alive and answerable; the outcome is recorded in the transcript |
| team turn budget exhausted | **no agent status change** — it is a team condition, not an agent one |
| fatal `error`, dead subprocess | `failed`, **sticky** — needs a restart, so it needs the user to see it |

### On relaunch: `idle`, or `failed` if the worktree is broken

Nothing is running, so everything comes back `idle` — with `failed` reserved for an agent whose
worktree reconcile (ticket 10) finds the worktree gone or its branch unresolvable.

**Queued messages are held, not auto-delivered.** Ack-means-committed guarantees a message can be
committed and undelivered across a restart. Delivering it on launch means opening the app and
having agents immediately spend tokens on a three-day-old conversation, unwatched, before the user
has looked at the screen. Show it — *"2 messages waiting"* — and let the first user action release
it. Auto-wake is right **within** a session; across a restart it is an ambush.

### Runtime availability is orthogonal

"Not installed" / "Needs sign-in" / "Ready" / "Status unknown" are properties of the **runtime on
this machine**, not of Alice, and they never enter this state machine. Folding them in would
smuggle a machine-level fact into a per-agent machine, where it goes stale with nothing to correct
it — install Codex while the app is open and Alice would stay `unavailable` until something thought
to re-derive her.

Runtime availability is its own observable with its own refresh; the team view renders the
composition of the two. This also keeps the state machine to exactly what the event stream can
produce — the property that makes it testable against `MockAgentRuntime`.

### Consequence for the UI

Per the design direction on ticket 12, **the blobatars are the only saturated thing on the page**,
so status cannot be expressed as colour. Seven states, four of them transient and fast-changing,
must be legible in monochrome at a glance. That is a genuine constraint on ticket 12's prototype
rather than a stylistic note.
