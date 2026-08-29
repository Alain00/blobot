Type: grilling
Status: resolved
Blocked by: 04, 06, 09, 10

# The SQLite schema for the demo

## Question

Fix the persisted shape for exactly the demo's scope: teams, agents, conversations, messages,
sessions, runtime config, and worktree references. No API keys, ever.

Decide the aggregate boundaries and the identity scheme; whether the event stream is
persisted or only its outcomes; how a message that crossed between agents is distinguished
from one a user sent; how runtime config is stored without becoming a credential store; and
the migration approach given the schema will churn hard for weeks.

Deliberately last: every earlier ticket changes what needs storing.

## Answer

`better-sqlite3` + **Drizzle** (`drizzle-orm/better-sqlite3` and `drizzle-kit`), one connection
in the Electron main process, inside `packages/core` behind a store interface. Eight tables. No
credential column exists anywhere, by construction rather than by promise.

### Our store is the transcript of record — ticket 04's question, answered yes

04 flagged that its "drop replayed events on the floor" decision *presumes* our store is the
transcript. Confirmed. `session/load` replay restores the **agent's** context, never ours.

What is persisted is the **durable subset** of the nine-member vocabulary, not the raw stream:
completed messages, tool calls with terminal state, turn outcomes, errors and usage snapshots.
Deltas are the wire format. Ticket 09 said "the activity log — the events themselves — is
persisted", and this narrows that: a row per `agent_message_delta` would mean three rows in one
observed millisecond, and 04 already put the concatenation buffer in core, so the completed
message is the natural unit — the same unit 04 identified for handing Bob compact context.

**Thinking is folded the same way.** `agent_thought_delta` has no completed counterpart, so
without a second buffer keyed on `messageId` reasoning would vanish from history entirely and
ticket 12's thinking pane would go blank on relaunch. Trap carried from 04: **thinking and
answer share one `messageId`**, so the provider's message id is not unique — the key is
`(provider_message_id, kind)`.

### The schema

Expressed as a Drizzle TS schema; this is the SQL it generates.

```sql
CREATE TABLE teams (
  id             TEXT PRIMARY KEY,           -- uuidv7, minted in core
  name           TEXT NOT NULL UNIQUE,       -- load-bearing: branch is blobot/<team>/<agent>
  workspace_path TEXT NOT NULL,
  workspace_kind TEXT NOT NULL,              -- 'git' | 'plain'
  turn_budget    INTEGER NOT NULL DEFAULT 10,
  created_at     INTEGER NOT NULL            -- epoch ms, injected clock
);

CREATE TABLE agents (
  id              TEXT PRIMARY KEY,
  team_id         TEXT NOT NULL REFERENCES teams(id),
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,
  runtime_id      TEXT NOT NULL,             -- 'opencode' | 'claude-code'
  executable_path TEXT,                      -- ticket 07 pins CLAUDE_CODE_EXECUTABLE
  model           TEXT,
  workspace_path  TEXT NOT NULL,
  branch          TEXT,                      -- NULL when workspace_kind = 'plain'
  created_at      INTEGER NOT NULL,
  deleted_at      INTEGER,                   -- tombstone; rows are never removed
  UNIQUE (team_id, name)
);

CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL REFERENCES agents(id),
  provider_session_id TEXT,                  -- stored, unused in the demo
  persona_text        TEXT NOT NULL,         -- what this agent was actually told
  started_at          INTEGER NOT NULL
);

-- "something said TO an agent" (the glossary's Message). The user's and a peer's, one table.
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  team_id         TEXT NOT NULL REFERENCES teams(id),
  from_agent_id   TEXT REFERENCES agents(id),   -- NULL means the user. This IS the discriminator.
  to_agent_id     TEXT NOT NULL REFERENCES agents(id),
  body            TEXT NOT NULL,
  context         TEXT,                          -- ticket 06's sender-supplied context line
  idempotency_key TEXT UNIQUE,                   -- ticket 15
  at              INTEGER NOT NULL,
  delivered_at    INTEGER                        -- NULL means still in the mailbox
);

-- the agent's own output
CREATE TABLE agent_messages (
  id                  TEXT PRIMARY KEY,
  turn_id             TEXT NOT NULL REFERENCES turns(id),
  agent_id            TEXT NOT NULL REFERENCES agents(id),
  kind                TEXT NOT NULL,             -- 'answer' | 'thought'
  text                TEXT NOT NULL,
  provider_message_id TEXT,                      -- NOT unique: shared across kinds
  at                  INTEGER NOT NULL
);

CREATE TABLE turns (
  id                 TEXT PRIMARY KEY,
  agent_id           TEXT NOT NULL REFERENCES agents(id),
  session_id         TEXT NOT NULL REFERENCES sessions(id),
  trigger_message_id TEXT REFERENCES messages(id),
  started_at         INTEGER NOT NULL,
  ended_at           INTEGER,
  stop_reason        TEXT   -- end_turn|cancelled|refusal|max_tokens|max_turn_requests
);

CREATE TABLE tool_calls (
  id                    TEXT PRIMARY KEY,
  turn_id               TEXT NOT NULL REFERENCES turns(id),
  agent_id              TEXT NOT NULL REFERENCES agents(id),
  provider_tool_call_id TEXT NOT NULL,
  name                  TEXT NOT NULL,
  kind                  TEXT,                    -- read|edit|execute|other
  arguments             TEXT,                    -- JSON
  status                TEXT NOT NULL,           -- pending|completed|failed
  exit_code             INTEGER,
  failure_reason        TEXT,
  output                TEXT,
  started_at            INTEGER NOT NULL,
  ended_at              INTEGER
);

-- append-only, never updated. usage_updated and error live here.
CREATE TABLE events (
  id       TEXT PRIMARY KEY,
  team_id  TEXT NOT NULL REFERENCES teams(id),
  agent_id TEXT REFERENCES agents(id),
  kind     TEXT NOT NULL,
  payload  TEXT NOT NULL,                        -- JSON
  at       INTEGER NOT NULL
);
```

Indices: `messages(to_agent_id, delivered_at)` for the mailbox, `messages(team_id, at)` for the
team stream, `turns(agent_id, started_at)`, `tool_calls(turn_id)`, `agent_messages(turn_id)`,
`events(team_id, at)`.

### Identity: uuidv7 text, minted in core

Ids must exist **before** insert — the orchestrator emits events referencing an agent it is
still creating — and rowids would make `packages/core` depend on the store to mint identity.
uuidv7 sorts time-ordered, so `ORDER BY id` is a free chronology and the same-millisecond case
04 observed for real has a deterministic tiebreak.

`UNIQUE(teams.name)` and `UNIQUE(agents.team_id, name)` are not cosmetic: ticket 10 chose
human-readable branches (`blobot/<team>/<agent>`) with **no id suffix**, so name collisions are
filesystem collisions. The database is where that becomes enforceable.

### A peer message is one row, and the discriminator is a foreign key

`from_agent_id IS NULL` means the user. Not a separate `sender` enum — one fact, one column,
nothing that can disagree with itself.

Ticket 12 renders a peer message **twice** (in each agent's pane) and **once** in the team
stream. That is a query, not a storage fact: `WHERE from_agent_id = ? OR to_agent_id = ?` for a
pane, `WHERE team_id = ?` for the stream. Rejected: one row per delivery, which makes the
duplication real and then needs a correlation id to undo it; and separate user/peer tables,
which makes every transcript read a union forever.

The orchestrator's synthesized `agent_message_sent` event (04) is **transport, not record** — the
`messages` row is the record, and the event is not written to `events`.

### The mailbox is a predicate, not a table

A message is queued exactly as long as `delivered_at IS NULL`. Ticket 06's numbered-batch
delivery is one `UPDATE ... SET delivered_at = ?` over the selected rows; ticket 09's "held, not
auto-delivered" across a restart is the *absence* of code rather than a state to restore, and
"2 messages waiting" is a `COUNT`.

The `UNIQUE` idempotency key lives on the message because that is what the uniqueness is about:
ticket 05 acks only after commit and returns no message id, so a retried tool call must collide
with the row it already wrote. A crash between insert and ack is then self-correcting.

### Runtime config: typed columns, so there is nowhere to put a secret

`runtime_id`, `executable_path`, `model` — and nothing else. No JSON blob for config, which is
where a token ends up six weeks from now. The env vars that carry actual authority
(`OPENCODE_CONFIG_CONTENT` from ticket 16, `CLAUDE_CODE_EXECUTABLE` from ticket 07) are
**composed at spawn time by the adapter** from these columns plus the user's own environment, and
never round-trip through the database in either direction. With Drizzle the TS schema *is* the
allowlist — an unknown key does not typecheck.

The `events.payload` and `tool_calls.arguments` JSON columns are not a contradiction: the ban is
on *config*, where a credential could plausibly be parked. An append-only event payload has no
such vector.

### Time is written by the injected clock

Integer epoch milliseconds, always supplied by core. **No `CURRENT_TIMESTAMP`, no SQL defaults on
time columns** — a default that reads the wall clock inside the database defeats exactly the
injected clock ticket 08 gave `MockAgentRuntime`, and would make checked-in scenario fixtures
untestable.

### Deleting an agent tombstones it; nothing is ever removed

`deleted_at`, not a cascade. Deleting Bob must not silently rewrite the record of what Alice was
told — and a peer message references two agents, so a cascade tears holes in a transcript that
has nothing to do with the deleted agent. A tombstoned agent keeps its name, role and blobatar
seed, so the team stream still renders "from Bob · backend" correctly; ticket 12 already
established desaturation as the visual reading of "not alive". Rejected: nulling the foreign
keys, which keeps the rows and makes them unrenderable — the worst of both.

The filesystem side is unchanged and stays ticket 10's: remove the AgentWorkspace, keep the
branch only if it has unmerged commits.

### Workspace paths are stored, not derived

`teams.workspace_path` + `workspace_kind`, `agents.workspace_path` + nullable `branch`. Ticket
10's layout is deterministic, so both *could* be computed from names — but a computed path can
never be wrong about the filesystem, and being able to be wrong is precisely the property
reconcile needs in order to detect a missing branch as data loss. Derivation is how they are
**defaulted**, not how they are known.

The nullable `branch` plus `workspace_kind` is also what makes a non-git Workspace representable
rather than a special case, keeping that permanent premise honest instead of aspirational.

### What is deliberately *not* stored

- **Status** (ticket 09) — derived in memory from the event stream. There is no status column,
  so the bug where SQLite says `working` and nothing is running cannot be written.
- **The consumed turn count.** `teams.turn_budget` is the *limit* and is configuration; the count
  resets to zero on launch. A budget that survives restart makes a team permanently unusable a
  week later with no obvious way to clear it, and the runaway it exists to bound is a runaway
  within a session.
- **Anything resembling a credential.** No API keys, no tokens, no captured environment.

### Sessions, and why the persona is stored

One `sessions` row per agent session, carrying the **composed persona text**. Ticket 06's safety
argument is that a peer message is *refusable* because of what Bob was told — if that is not
recoverable, the case where Bob does something strange cannot be debugged, which is the exact
failure 06 avoided by keeping peer traffic visible. It also means changing persona-composition
code does not silently rewrite the explanation of yesterday's transcript, and the roster snapshot
inside it explains why Bob thought he could message a since-deleted teammate.

**Revision to Q8 as first put:** `provider_session_id` lives here, not on `agents` — once sessions
are a table, the agent's current session is its latest row. It is stored and used by nothing:
session restore across restarts stays out of scope, everything comes back `idle`, and nothing is
replayed. Storing a string is not building the feature; it is the difference between turning
resume on later and every session before today being unreachable.

### Migrations: `drizzle-kit generate`, checked in

`drizzle-kit` emits numbered `.sql` files with a journal, so the churn is **recorded** — which
matters more than usual here, because the map is the artifact and a fresh implementation session
should be able to see how the shape moved. Applied by drizzle's `better-sqlite3` migrator at
startup.

Drizzle rather than hand-written SQL on two grounds: it is what the author already runs in three
other projects, which is decisive against a two-week evening budget; and a TS schema with typed
columns is a stronger enforcement of the no-credentials rule than review discipline. It is used
as a **typed query builder, not an ORM** — no lazy loading, no identity map, nothing to be clever
with — and it stays behind the store interface: `packages/core` exports domain types (`Team`,
`Agent`, `Message`), never inferred Drizzle row types. Same rule as `AgentRuntime`.

It lives **inside `packages/core`**, not a new `packages/db`, despite `packages/db` being the
author's convention elsewhere — the map settled two packages and the boundary exists to make "the
UI cannot import a provider" a dependency-graph fact.

### One connection, in main

`better-sqlite3`, WAL mode, `PRAGMA foreign_keys = ON`. **The renderer never touches the
database** — every read crosses IPC. This is not ceremony: "the UI is provider-agnostic" only
holds if the UI cannot reach the table where `runtime_id` is written, and a renderer with a
database handle is a renderer that will eventually `WHERE runtime_id = 'claude-code'`. WAL
because the demo streams events while the UI reads the same tables; `foreign_keys` explicitly
because SQLite defaults it **off** per connection and the tombstone design assumes the
constraints are real.

### Nothing is pruned

At demo scale this is kilobytes a day, and a retention policy wants real usage behind it. The
property that keeps the decision cheap to make later is that `events` is **append-only and never
updated**, so a future prune is a `DELETE WHERE at < ?` and nothing else in the schema has to
care. Recorded as fog rather than left as a silent assumption that disk is free forever.
