import { blob, index, integer, primaryKey, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

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
  /**
   * The team's icon, as a `data:` URL, or NULL for a team drawn from its members alone.
   *
   * Inlined rather than a path to a file, and that is the decision worth stating: an icon
   * detected in a Workspace lives in a folder the user can move, rename or delete, and a team
   * whose mark vanished with its folder would be the same bug the launch reconcile exists to
   * report. It is a downscaled PNG of at most a few kilobytes — small enough that a column
   * costs less than an asset directory with its own lifecycle to get wrong.
   */
  icon: text('icon'),
  turnBudget: integer('turn_budget').notNull().default(10),
  /**
   * The team's **lead**: the agent the team pane addresses when the user names nobody.
   *
   * An agent id rather than a profile id, because the lead is a fact about this membership —
   * the same agent leads one team and not another. It is nullable, and NULL is a real state
   * with a real behaviour: the team pane reverts to what ticket 12 specified, where send stays
   * disabled until an `@mention` resolves. Every team created before this column had one is
   * NULL, and a lead who is taken off the roster leaves it NULL rather than promoting somebody
   * the user never saw chosen.
   *
   * No foreign key, and deliberately: `agents.team_id` already points here, and a circular
   * reference between two tables is a thing SQLite will let you create and drizzle-kit will not
   * let you drop. The id is written from an agent row this same transaction created.
   */
  leadAgentId: text('lead_agent_id'),
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
  /**
   * What the user chose among the options the runtime advertises, as JSON keyed by the
   * provider's own group id: `{"model":"sonnet","effort":"high"}`.
   *
   * One opaque column rather than a column per axis, because the axes belong to the provider:
   * the Claude bridge offers three and OpenCode offers one, and a schema that names `effort`
   * would be blobot deciding which runtimes may exist. An absent key is the runtime's default.
   *
   * It supersedes the `model` column below, which shipped with the schema and was never once
   * written: a per-axis column cannot hold an axis the next runtime invents.
   */
  runtimeOptions: text('runtime_options'),
  /**
   * How much of this agent's own work blobot vouches for: `careful`, `normal` or `trusting`.
   *
   * Its own column rather than a key in `runtime_options`, because that column holds the
   * *provider's* vocabulary and this is blobot's own: both adapters answer to it, and neither
   * runtime has ever advertised it. NULL is `normal`, so every agent hired before this column
   * keeps the posture it was already running under. See `trust.ts`.
   */
  trust: text('trust'),
  /**
   * Whether blobot may choose the moment to compact this agent: `auto` or `off`.
   *
   * Beside `trust` and not inside `runtime_options` for the same reason that one is: this is
   * blobot's own vocabulary, and no runtime has ever advertised it. NULL is `auto`, which is
   * on — so an agent hired before this column gets the behaviour, which is the decision rather
   * than an accident of defaulting. See `.scratch/transcript-scale/issues/10`.
   */
  compaction: text('compaction'),
  /**
   * How much this agent says when it answers: `brief`, `normal` or `full`.
   *
   * Its own column for the third time and for the same reason: blobot's own vocabulary, which
   * no runtime advertises. NULL is `normal`, so an agent hired before this column reads as the
   * middle position rather than as having been quietly made terse. Unlike the two above it,
   * nothing reads this outside `composePersona` — it never reaches an adapter. See
   * `verbosity.ts`.
   */
  verbosity: text('verbosity'),
  /** Dead since 2026-08-30, kept because dropping a column is a table rebuild for no gain. */
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
     * rewrite what a transcript says this agent was called at the time. It is also half of
     * `blobot/<team>/<agent>`, so on a membership it is the name the branch is under, and an
     * edit to the profile leaves it alone. See ADR-0002.
     */
    name: text('name').notNull(),
    /** Copied, and restated by an edit: nothing is named after a role. */
    role: text('role').notNull(),
    /**
     * Copied, and restated by an edit as well. What keeps a strange turn explicable is
     * `sessions.persona_text`, which records what the agent was actually told at the time;
     * this column is what the *next* session will be composed from.
     */
    instructions: text('instructions'),
    /**
     * Copied as well, so a team of agents hired before this column keeps its faces. Unlike the
     * name and the role, an edit to the profile **restates** this one: a face is an identity
     * rather than a record of what was said, and an agent wearing two colours on two teams is
     * the thing the hue exists to prevent. See ADR-0002.
     */
    hue: integer('hue'),
    runtimeId: text('runtime_id').notNull(),
    /** Ticket 07 pins CLAUDE_CODE_EXECUTABLE to the user's own binary. */
    executablePath: text('executable_path'),
    /** Copied from the profile at team creation, like the name and the face. See ADR-0002. */
    runtimeOptions: text('runtime_options'),
    /** Copied the same way, and restated by an edit the same way. NULL is `normal`. */
    trust: text('trust'),
    /** Copied and restated the same way again. NULL is `auto`. */
    compaction: text('compaction'),
    /** And once more. NULL is `normal`. Read only by `composePersona`. */
    verbosity: text('verbosity'),
    /** Dead since 2026-08-30, superseded by `runtime_options`. Never written. */
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
    /**
     * The firing that put these words here, when a clock delivered them rather than a person.
     * NULL is the ordinary case: the user typed it.
     *
     * A link and not a boolean, and that is the decision: *this came from a Routine* and *this
     * came from **that** firing* are both wanted, by different screens, and the link answers
     * both. The transcript draws the `system` line above the bubble from it (issue 07), and the
     * rail decides whether the report has been seen from the run it points at (issue 11). One
     * fact, recorded once.
     */
    routineRunId: text('routine_run_id'),
  },
  (table) => [
    index('messages_mailbox').on(table.toAgentId, table.deliveredAt),
    index('messages_team_stream').on(table.teamId, table.at),
  ],
);

/**
 * An **Attachment**: bytes the user attached to a Message.
 *
 * A row of its own rather than a column on `messages`, because one attachment can be on several
 * messages: a message addressed to three agents is three rows, one thing typed once, and one
 * copy of the bytes.
 *
 * **The bytes are here and not on disk.** Nothing links to an attachment — the runtimes are
 * handed the content, never a path (ADR-0004) — so a file under `userData` would buy a smaller
 * database and add a second thing that can go missing, for bytes no agent may reach. It also
 * cannot be walked: an asset directory is a stable, predictable place holding every attachment
 * from every team, which is exactly what that ADR refuses to hand anybody a link into.
 *
 * They outlive their team. Deleting a team tombstones it and keeps the transcript, so these
 * rows stay for as long as the messages that point at them.
 */
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  /** `image` or `text`. The two kinds both runtimes advertise; a PDF is neither. */
  kind: text('kind', { enum: ['image', 'text'] }).notNull(),
  mimeType: text('mime_type').notNull(),
  /** NULL for a pasted image, which has no filename and is not given an invented one. */
  name: text('name'),
  /** The original size, which is what the composer refused against and what the gauge reports. */
  bytes: integer('bytes').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  at: integer('at').notNull(),
});

/**
 * Which attachments are on which message, in the order the user picked them up.
 *
 * The join is what lets one blob serve a fan-out. `ordinal` is kept because the order is the
 * user's and the prompt is built from it.
 */
export const messageAttachments = sqliteTable(
  'message_attachments',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id),
    attachmentId: text('attachment_id')
      .notNull()
      .references(() => attachments.id),
    ordinal: integer('ordinal').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.attachmentId] }),
    index('message_attachments_message').on(table.messageId),
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
    /**
     * Whether the runtime reported an exit code at all, which `exit_code` alone cannot say.
     *
     * Ticket 08's trap is that a cancelled call reports `completed` with an explicit
     * `exit: null`, and a `read` that finished perfectly reports no exit code whatsoever. Both
     * land in `exit_code` as SQL NULL, so a restored line could not tell a cancelled call from
     * an ordinary one and the transcript's fold would undercount its failures.
     *
     * It records what came over the wire and concludes nothing, which is the rule: the word
     * "cancelled" is nowhere in this column, because inferring it is exactly what ticket 08
     * says never to do.
     */
    exitReported: integer('exit_reported', { mode: 'boolean' }).notNull().default(false),
    /**
     * What an edit changed, in lines, counted from ACP's `diff` block. Two nullable columns
     * rather than one JSON blob because they are two integers that are always read together
     * and never queried apart, and because null here means *not measured* — a call that
     * changed nothing, a diff too large to count, or a runtime that sends no diff block.
     */
    linesAdded: integer('lines_added'),
    linesRemoved: integer('lines_removed'),
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

/**
 * Ticket 09's Routines. See `.scratch/routines/`.
 *
 * A **Routine** is a prompt with a clock behind it, and the two decisions worth reading off this
 * shape are both refusals:
 *
 * - **`agent_id`, never `team_id`.** A Routine belongs to one agent on one team — the identity
 *   `blobot/<team>/<agent>` is named for — because a turn needs an AgentWorkspace, a session and
 *   a mailbox, and none of those are a Team's to lend. The same person hired onto two teams has
 *   two sets of Routines and they do not travel. ADR-0001's reason, applied again.
 * - **No cron string, because none can be entered.** The schedule is a closed set of three
 *   shapes (issue 04), so it is a kind and two small numbers, and the UI renders it in words by
 *   construction. That closed set *is* the cost ceiling: nothing finer than hourly is offered, so
 *   the runaway case is not bounded, it is absent.
 */
export const routines = sqliteTable(
  'routines',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    scheduleKind: text('schedule_kind', { enum: ['hourly', 'daily', 'weekly'] }).notNull(),
    scheduleMinute: integer('schedule_minute').notNull(),
    /** NULL on an hourly Routine, which has no hour to be at. */
    scheduleHour: integer('schedule_hour'),
    /** 0 is Sunday, matching `Date.prototype.getDay`. NULL except on a weekly Routine. */
    scheduleWeekday: integer('schedule_weekday'),
    /**
     * Whether it fires. **Off by default, and that is the load-bearing part**: an Agent may
     * propose a Routine and only a person may arm one, so the disarmed state is the one every
     * proposal lands in and stays in until somebody reads it.
     */
    armed: integer('armed', { mode: 'boolean' }).notNull().default(false),
    /**
     * The Agent that asked for this, when an agent did. Not who owns it — who **asked**. An
     * agent id and never free text, so a proposal cannot claim to come from somebody it did not.
     */
    proposedBy: text('proposed_by').references(() => agents.id),
    /**
     * When a person answered a proposal, whatever they answered.
     *
     * **Issue 06 owed this column and the build without it was wrong.** *Answered* was read as
     * *armed or gone*, so a proposal the user armed and later disarmed came back to the top of
     * the screen as though nobody had ever looked at it — and, because a standing proposal
     * counts against issue 05's cap of three, it also went on blocking the agent that asked.
     *
     * Arming, editing or discarding all set it. It is deliberately not *approved*: a decision
     * the user later reversed is still a decision they made, which is the whole distinction
     * issue 06 draws between a disarmed Routine and a proposal.
     */
    reviewedAt: integer('reviewed_at'),
    /**
     * The last moment this Routine was accounted for, ran or missed. Not *last fired*: a missed
     * firing does not run, so a fired-mark would never advance and the same missed firing would
     * be reported on every tick forever. See `routines/domain.ts`.
     */
    lastSettledAt: integer('last_settled_at'),
    /**
     * Firings nobody was there for, since the last one blobot was there for. No `routine_runs`
     * row is written for a missed firing — nothing happened and nothing decided not to — so the
     * count lives here, where it survives the settling and can be drawn as `missed 4 firings`.
     */
    missedFirings: integer('missed_firings').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    /** Tombstone, like everything else here. A run history outlives the Routine that made it. */
    deletedAt: integer('deleted_at'),
  },
  (table) => [index('routines_agent').on(table.agentId)],
);

/**
 * One row per firing. Rows rather than a JSON blob on the Routine, because this is the one thing
 * here anybody queries: issue 06 sorts the screen by it, issue 08 counts three consecutive
 * failures off it to disarm, and issue 11 reads the newest one to decide whether a report is
 * unread.
 *
 * `SqliteRecorder` records nothing new for a firing. The event stream is the durable subset of
 * the *agent* event vocabulary, and a firing is a thing blobot did, not a thing an agent emitted.
 * The turn a firing starts is recorded exactly as any other turn already is.
 */
export const routineRuns = sqliteTable(
  'routine_runs',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id')
      .notNull()
      .references(() => routines.id),
    firedAt: integer('fired_at').notNull(),
    /**
     * `ran` — a turn started and ended. `skipped` — no turn started, and nothing reaches the
     * transcript because nothing happened in the session. `stopped` — a turn started and did not
     * finish, which *is* in the transcript as the `system` line the stop reason already produces.
     */
    outcome: text('outcome', { enum: ['ran', 'skipped', 'stopped'] }).notNull(),
    /** In the user's words, not the protocol's: `blobot was not open`, `alice was mid-turn`. */
    reason: text('reason'),
    /**
     * Cleared when the user opens that agent's pane. Issue 11: a Routine whose value is the
     * *message* lands in a pane the user has no reason to open, so the rail draws its preview
     * line at full ink until it has been seen. Earned by origin and never by an ordinary turn —
     * an agent finishing work the user started is not unread, it is finished.
     */
    seenAt: integer('seen_at'),
  },
  (table) => [index('routine_runs_routine').on(table.routineId, table.firedAt)],
);

/**
 * The user's own answer to *where does this model stop being worth more context*.
 *
 * `context-ceiling.ts` says the remedy for a model that deserves better than the fallback is to
 * measure it and give it an entry, and until now the only place an entry could land was a table
 * in blobot's source. That is the ageing-table hazard from the other side: the person who can
 * actually watch a model degrade is the one sitting in front of it, and they had nowhere to
 * write what they saw. A row here is that, and it wins over the adapter's table.
 *
 * Keyed by the runtime and the **model string the user chose**, which is what the lookup already
 * keys on. The empty string is a real key and means *the runtime's own default model* — Codex
 * advertises no model option at all, so without it a whole runtime could never be given a
 * number. It is not a guess about which model that is: it is a ceiling for *an agent that let
 * the runtime pick*, which is exactly the agent it applies to.
 *
 * Not `settings`. A key-value bag is where a credential ends up six weeks from now, and the
 * columns here are the whole of what this is: two identifiers and a token count.
 */
export const contextCeilings = sqliteTable(
  'context_ceilings',
  {
    runtimeId: text('runtime_id').notNull(),
    /** The model as the runtime names it, or `''` for the runtime's own default. */
    model: text('model').notNull(),
    /** Where the usable part of the window ends, in the tokens the runtime reports. */
    tokens: integer('tokens').notNull(),
    at: integer('at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.runtimeId, table.model] })],
);

/**
 * A **Handbook**'s entries — what an Agent knows about this team's work. See
 * `.scratch/handbooks/issues/07`.
 *
 * **Keyed on `(team_id, agent name)`, with no foreign key to `agents`**, so a Handbook outlives
 * the row it belongs to. `editTeamRoster` mints a fresh id for every joiner and never revives a
 * tombstone, so a Handbook keyed on `agents.id` would be lost every time somebody was removed
 * and added back — which is the ordinary way a user fixes a mistake.
 *
 * **This key is safe only because ADR-0002 forbids renaming an agent.** An edit restates the
 * definition and keeps the name, which is what makes a name stable enough to key on. A future
 * rename feature would silently orphan every Handbook unless it moved them, and this sentence
 * is here rather than in a changelog somebody reads afterwards.
 *
 * `team_id` rather than the team's name for the opposite reason: a team **can** be renamed, and
 * `tombstoneTeam` renames it on the way out.
 *
 * Tombstoned with the team, never hard deleted. A tombstoned team can never be reopened, so its
 * Handbook is never composed again, and hard-deleting would make this the one table that breaks
 * the rule the rest of the schema keeps — rows are never removed — for a few kilobytes. It is
 * also absent from the full clean's recovery figure on purpose: that number answers *what work
 * am I destroying*, and a Handbook is kilobytes rather than work.
 */
export const handbookEntries = sqliteTable(
  'handbook_entries',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id),
    /** The agent's name, not its id. See the note above about why, and about what would break it. */
    agentName: text('agent_name').notNull(),
    /**
     * What the Handbook draws this entry under, and what `record_entry`'s `replaces` names.
     *
     * **Stored rather than derived, and it never changes.** Two things went wrong when it was a
     * position in a list. Numbering the *live* entries one to n renumbers everything under a
     * removal while the agent is still reading the persona it was given at session start, so it
     * would correct entry 3 and withdraw what used to be entry 4. And deriving it from
     * `ORDER BY created_at, id` scrambles the entries *inside* one call: `record_entry` takes a
     * list, all of it is written in the same millisecond, and a uuidv7's tail is random — so a
     * briefing came back in an order nobody wrote it in. Counted over every entry this Handbook
     * ever had, so a removal leaves a gap, which is honest and is the same act being visible.
     */
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    /** `told` — the user said it. `noticed` — the agent worked it out, or a teammate said it. */
    source: text('source', { enum: ['told', 'noticed'] }).notNull(),
    createdAt: integer('created_at').notNull(),
    /**
     * When it stopped being part of the Handbook: removed by the user, or withdrawn by the
     * agent that authored it as `noticed`.
     *
     * A tombstone rather than a delete, like everything else here, and for a reason of its own
     * as well: the transcript block that disclosed the write is never rewritten, so a reopened
     * team has to be able to tell that the entry it names is gone rather than draw a removal
     * control beside something that is already removed.
     */
    removedAt: integer('removed_at'),
    /** Set with `removed_at` when the team was tombstoned, rather than by anybody's decision. */
    deletedAt: integer('deleted_at'),
  },
  (table) => [index('handbook_entries_agent').on(table.teamId, table.agentName)],
);

/**
 * Dictation's one row (`.scratch/dictation/` ticket 10): whether it is on, which kind of
 * Transcriber, which speech model or which provider, and what the readiness scan said.
 *
 * Named columns that are the whole of what the thing is — `context_ceilings`' own allowance —
 * and never a key-value bag. **The key is not here** (ADR-0005 clause 5): durable-and-not-secret
 * is the database's, secret is `dictation-keys.json`'s, and this schema's first rule is that no
 * credential column exists anywhere.
 */
export const dictation = sqliteTable('dictation', {
  /** Always 1. One row, read whole, written whole. */
  id: integer('id').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  /** `''` while nothing has been chosen. */
  transcriber: text('transcriber', { enum: ['', 'local', 'remote'] }).notNull().default(''),
  /** The speech model's catalog id, or `''`. */
  modelId: text('model_id').notNull().default(''),
  /** The provider's id from core's table, or `''`. */
  providerId: text('provider_id').notNull().default(''),
  /** The static scan's word, or `''` before it ran. */
  readiness: text('readiness', { enum: ['', 'unfit', 'untested', 'fit', 'slow'] }).notNull().default(''),
  /** Real-time factor from *say something*, per model: NULL until measured. */
  measuredRtf: real('measured_rtf'),
  /** Which model that measurement was of, so a size change returns to `untested`. */
  measuredModelId: text('measured_model_id').notNull().default(''),
  at: integer('at').notNull().default(0),
});
