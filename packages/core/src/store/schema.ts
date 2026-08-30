import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * Ticket 13's eight tables. Drizzle is used as a **typed query builder, not an ORM**, and it
 * stays behind the store interface: `packages/core` exports domain types (`Team`, `Agent`,
 * `Message`), never inferred Drizzle row types.
 *
 * Two rules the shape enforces rather than promises:
 * - **No credential column exists anywhere.** Runtime config is typed columns — the TS schema
 *   *is* the allowlist, and a JSON config blob (where a token ends up six weeks from now) has
 *   nowhere to live.
 * - **No SQL time defaults.** Every timestamp is epoch millis written by the injected clock,
 *   so a checked-in scenario under a virtual clock stays testable.
 */

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  // Load-bearing: the branch is `blobot/<team>/<agent>` with no id suffix, so a name
  // collision is a filesystem collision. This is where that becomes enforceable.
  name: text('name').notNull().unique(),
  workspacePath: text('workspace_path').notNull(),
  workspaceKind: text('workspace_kind', { enum: ['git', 'plain', 'nested'] }).notNull(),
  // JSON, because it is a list the app reads whole and never queries into — and a join table
  // for a handful of relative paths per team would be a schema nobody thanks you for.
  workspaceRepos: text('workspace_repos'),
  turnBudget: integer('turn_budget').notNull().default(10),
  createdAt: integer('created_at').notNull(),
  /**
   * Tombstone, like an agent and a profile. A team owns a transcript, and `messages.team_id`
   * points at this row from every line of it, so deleting a team deletes rows nothing else can
   * reconstruct. The name is released when the tombstone is written, because `name` is unique
   * and a user who deletes a broken team must be able to create it again.
   */
  deletedAt: integer('deleted_at'),
});

/**
 * An **AgentProfile**: an Agent that exists on its own, before and between Teams.
 *
 * The reusable half of an agent is its *definition* — who it is, what it does, which runtime
 * it runs on, and any standing instructions. The unreusable half is everything a Team gives
 * it: a Workspace copy, a Session, a mailbox, a Status. So joining a Team **instantiates** an
 * Agent row from a profile rather than sharing one, and the same profile can be on many teams
 * at once. See `docs/adr/0001-agents-exist-independently-of-teams.md`.
 */
export const agentProfiles = sqliteTable('agent_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  role: text('role').notNull(),
  runtimeId: text('runtime_id').notNull(),
  executablePath: text('executable_path'),
  model: text('model'),
  /** Standing instructions, folded into the persona. Never a credential. */
  instructions: text('instructions'),
  /**
   * The blobatar's hue, 0 to 359, when the user has chosen one. NULL means the name derives it,
   * which is the default and is what every agent hired before this column had.
   *
   * It is a fact about the agent rather than a preference about a screen — the same face has to
   * follow it onto every team it joins — so it lives here and not in `localStorage`.
   */
  hue: integer('hue'),
  createdAt: integer('created_at').notNull(),
  /** Tombstone, like an agent: teams that used it keep pointing at the row. */
  deletedAt: integer('deleted_at'),
});

export const agents = sqliteTable(
  'agents',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    /**
     * The profile this Agent was instantiated from. Nullable because the demo team has no
     * profiles, and because an Agent keeps working if its profile is later tombstoned.
     */
    profileId: text('profile_id').references(() => agentProfiles.id),
    /**
     * Copied from the profile at creation, not read through it: renaming the profile must not
     * rewrite what a transcript says this agent was called at the time.
     */
    name: text('name').notNull(),
    role: text('role').notNull(),
    /** Copied from the profile too, and for the same reason: the persona is auditable. */
    instructions: text('instructions'),
    /** Copied as well: a transcript should show the face the agent wore at the time. */
    hue: integer('hue'),
    runtimeId: text('runtime_id').notNull(),
    /** Ticket 07 pins CLAUDE_CODE_EXECUTABLE to the user's own binary. */
    executablePath: text('executable_path'),
    model: text('model'),
    workspacePath: text('workspace_path').notNull(),
    /** NULL when the Workspace is not a git repository. */
    branch: text('branch'),
    createdAt: integer('created_at').notNull(),
    /** Tombstone. Rows are never removed: a cascade would tear holes in Alice's transcript. */
    deletedAt: integer('deleted_at'),
  },
  (table) => [unique('agents_team_name').on(table.teamId, table.name)],
);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id),
  /** The provider's own id for this conversation. Read back on the next launch, which is
   *  what lets an agent come back remembering it. See `lastProviderSessionOf`. */
  providerSessionId: text('provider_session_id'),
  /** What this agent was actually told — the recoverable explanation of a strange turn. */
  personaText: text('persona_text').notNull(),
  startedAt: integer('started_at').notNull(),
});

/**
 * Something said TO an agent. The user's and a peer's, one table:
 * `from_agent_id IS NULL` means the user, and that foreign key IS the discriminator.
 * The mailbox is `delivered_at IS NULL` — a predicate, not a table.
 */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    fromAgentId: text('from_agent_id').references(() => agents.id),
    toAgentId: text('to_agent_id')
      .notNull()
      .references(() => agents.id),
    body: text('body').notNull(),
    context: text('context'),
    /** Ticket 15: a retried tool call must collide with the row it already wrote. */
    idempotencyKey: text('idempotency_key').unique(),
    at: integer('at').notNull(),
    deliveredAt: integer('delivered_at'),
  },
  (table) => [
    index('messages_mailbox').on(table.toAgentId, table.deliveredAt),
    index('messages_team_stream').on(table.teamId, table.at),
  ],
);

export const turns = sqliteTable(
  'turns',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    triggerMessageId: text('trigger_message_id').references(() => messages.id),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    stopReason: text('stop_reason'),
  },
  (table) => [index('turns_agent').on(table.agentId, table.startedAt)],
);

/**
 * The agent's own output, folded from deltas. Trap from ticket 04: thinking and answer share
 * one provider message id, so the key is `(provider_message_id, kind)`.
 */
export const agentMessages = sqliteTable(
  'agent_messages',
  {
    id: text('id').primaryKey(),
    turnId: text('turn_id')
      .notNull()
      .references(() => turns.id),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    kind: text('kind', { enum: ['answer', 'thought'] }).notNull(),
    text: text('text').notNull(),
    providerMessageId: text('provider_message_id'),
    at: integer('at').notNull(),
  },
  (table) => [index('agent_messages_turn').on(table.turnId)],
);

export const toolCalls = sqliteTable(
  'tool_calls',
  {
    id: text('id').primaryKey(),
    turnId: text('turn_id')
      .notNull()
      .references(() => turns.id),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    providerToolCallId: text('provider_tool_call_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind'),
    arguments: text('arguments'),
    status: text('status').notNull(),
    exitCode: integer('exit_code'),
    failureReason: text('failure_reason'),
    output: text('output'),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
  },
  (table) => [index('tool_calls_turn').on(table.turnId)],
);

/**
 * Append-only, never updated — which is what keeps a future retention policy cheap: a prune is
 * `DELETE WHERE at < ?` and nothing else in the schema has to care. `usage_updated` and
 * `error` live here. The orchestrator's `agent_message_sent` does not: it is transport, and
 * the `messages` row is the record.
 */
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    agentId: text('agent_id').references(() => agents.id),
    kind: text('kind').notNull(),
    payload: text('payload').notNull(),
    at: integer('at').notNull(),
  },
  (table) => [index('events_team').on(table.teamId, table.at)],
);
