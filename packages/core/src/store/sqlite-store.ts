import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { StopReason } from '../events.js';
import type {
  Agent,
  AgentDefinition,
  AgentProfile,
  Attachment,
  AttachmentContent,
  Message,
  Team,
} from '../orchestrator/domain.js';
import type { AttachmentStore, MessageStore } from '../orchestrator/message-store.js';
import type { EntrySource, HandbookEntry, NewHandbookEntry } from '../handbook/domain.js';
import type { Routine, RoutineOutcome, RoutineRun, Schedule } from '../routines/domain.js';
import { trustLevelOf, type TrustLevel } from '../trust.js';
import { verbosityLevelOf, type VerbosityLevel } from '../verbosity.js';
import { DEFAULT_COMPACTION, type CompactionSetting } from '../orchestrator/domain.js';
import type { BlobotDatabase } from './database.js';
import {
  agentMessages,
  agentProfiles,
  agents,
  attachments,
  contextCeilings,
  dictation,
  events,
  handbookEntries,
  messageAttachments,
  messages,
  routineRuns,
  routines,
  sessions,
  teams,
  toolCalls,
  turns,
} from './schema.js';

/**
 * How much transcript a snapshot carries.
 *
 * Chosen by what a reader plausibly scrolls back through in one sitting, not by what the DOM
 * can survive — ticket 03 is what makes the DOM survivable, and sizing this against the
 * renderer's current limits would bake today's weakness into the store. It is deliberately the
 * same figure the activity column keeps, so the two halves of a restored pane reach back about
 * as far as each other.
 */
export const TRANSCRIPT_WINDOW = 200;

/**
 * Runtime config, as ticket 13 stores it: typed columns and nothing else. There is no JSON
 * config blob, which is where a token ends up six weeks from now. `runtimeId` is read by the
 * store and by whatever constructs a runtime — never by the UI.
 */
export interface AgentProfileRecord extends AgentProfile {
  readonly createdAt: number;
  readonly deletedAt?: number;
}

export interface AgentRecord extends Agent {
  readonly runtimeId: string;
  readonly executablePath?: string;
  /** The user's choices among what the runtime advertises. JSON in the column, a map here. */
  readonly runtimeOptions?: Readonly<Record<string, string>>;
  /** How much of its own work blobot vouches for. Absent is `normal`. See `trust.ts`. */
  readonly trust?: TrustLevel;
  /** How much it says when it answers. Absent is `normal`. See `verbosity.ts`. */
  readonly verbosity?: VerbosityLevel;
  /** NULL when the Workspace is not a git repository. */
  readonly branch?: string;
  readonly createdAt: number;
  readonly deletedAt?: number;
}

/**
 * A ceiling the user established themselves, which outranks the adapter's own table.
 *
 * `model` is absent when it is for the runtime's own default model — the only key a Codex agent
 * can have, since that adapter advertises no model to choose.
 */
export interface ContextCeilingRecord {
  readonly runtimeId: string;
  readonly model?: string;
  readonly tokens: number;
  readonly at: number;
}

/**
 * Dictation's one row (ticket 10). `transcriber: ''` is *nothing chosen*; `measuredRtf` is
 * absent until *say something* has run, and `measuredModelId` says which model it measured, so
 * a size change returns the word to `untested` without a second table.
 */
export interface DictationRecord {
  readonly enabled: boolean;
  readonly transcriber: '' | 'local' | 'remote';
  readonly modelId: string;
  readonly providerId: string;
  readonly readiness: '' | 'unfit' | 'untested' | 'fit' | 'slow';
  readonly measuredRtf?: number;
  readonly measuredModelId: string;
  readonly at: number;
}

export const DEFAULT_DICTATION: DictationRecord = {
  enabled: false,
  transcriber: '',
  modelId: '',
  providerId: '',
  readiness: '',
  measuredModelId: '',
  at: 0,
};

export interface SessionRecord {
  readonly id: string;
  readonly agentId: string;
  readonly providerSessionId?: string;
  /** What the agent was actually told. Ticket 06's refusability is only auditable if kept. */
  readonly personaText: string;
  readonly startedAt: number;
}

/**
 * The SQLite implementation of the mailbox, plus the team and agent records around it.
 * Drizzle stays behind this boundary: nothing here returns an inferred row type.
 */
export class SqliteStore implements MessageStore, AttachmentStore {
  readonly #db: BlobotDatabase;

  constructor(db: BlobotDatabase) {
    this.#db = db;
  }

  // ------------------------------------------------------------------ teams and agents

  createTeam(team: Team & { createdAt: number }): Team {
    this.#db.insert(teams).values({
      id: team.id,
      name: team.name,
      workspacePath: team.workspacePath,
      workspaceKind: team.workspaceKind,
      workspaceRepos:
        team.workspaceRepos === undefined ? null : JSON.stringify(team.workspaceRepos),
      icon: team.icon ?? null,
      turnBudget: team.turnBudget,
      leadAgentId: team.leadAgentId ?? null,
      createdAt: team.createdAt,
    }).run();
    return team;
  }

  /**
   * Name the team's lead, or take the designation off it.
   *
   * Its own method rather than a field on `createTeam`, because the lead is an agent id and
   * the agent rows are written after the team row. Passing `undefined` is the state a team is
   * in when the lead has left the roster and the user has not said who takes over: no default
   * recipient, and the composer says so.
   */
  setTeamLead(teamId: string, agentId: string | undefined): void {
    this.#db
      .update(teams)
      .set({ leadAgentId: agentId ?? null })
      .where(eq(teams.id, teamId))
      .run();
  }

  /**
   * Every team, newest first. The app reopens the same database on every launch, so this is
   * what turns "a team is a TypeScript file" into "a team is a row the user created".
   *
   * A deleted team is gone from here and stays in the database: its transcript is the only
   * record of what those agents were told, and a cascade would tear holes in the rows a peer
   * message leaves in *both* panes.
   */
  listTeams(
    options: { includeDeleted?: boolean } = {},
  ): (Team & { createdAt: number; deletedAt?: number })[] {
    return this.#db
      .select()
      .from(teams)
      .orderBy(desc(teams.createdAt))
      .all()
      .filter((row) => options.includeDeleted === true || row.deletedAt === null)
      .map((row) => ({
        id: row.id,
        name: row.name,
        workspacePath: row.workspacePath,
        workspaceKind: row.workspaceKind,
        ...(row.workspaceRepos === null
          ? {}
          : { workspaceRepos: JSON.parse(row.workspaceRepos) as string[] }),
        ...(row.icon === null ? {} : { icon: row.icon }),
        turnBudget: row.turnBudget,
        ...(row.leadAgentId === null ? {} : { leadAgentId: row.leadAgentId }),
        createdAt: row.createdAt,
        ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
      }));
  }

  /**
   * Give a team an icon, or take it off.
   *
   * Its own method for the same reason `setTeamLead` is one: it is a change to a team that
   * already exists, made from a dialog that changes nothing else, and it restarts nothing.
   * `undefined` is a real value — a team with no icon is drawn from its members, which is the
   * resting state and not a missing one.
   */
  setTeamIcon(teamId: string, icon: string | undefined): void {
    this.#db
      .update(teams)
      .set({ icon: icon ?? null })
      .where(eq(teams.id, teamId))
      .run();
  }

  teamById(teamId: string): Team | undefined {
    return this.listTeams().find((team) => team.id === teamId);
  }

  /** The name is unique in the schema because it is half of a branch name. */
  teamByName(name: string): Team | undefined {
    return this.listTeams().find((team) => team.name === name);
  }

  /**
   * Delete a team: a tombstone, and the name handed back.
   *
   * The name has to be released, and it cannot be released by keeping it. `teams.name` is
   * unique because it is half of `blobot/<team>/<agent>`, so a tombstone that kept the string
   * would refuse the next team of the same name while showing the user nothing to explain it,
   * and the ordinary reason to delete a team is that it points at a folder that is gone and
   * the user wants to point a new one at the folder they moved it to.
   *
   * Renaming a dead row is safe in a way renaming a live one is not: every branch name was
   * written onto the agent rows when the team was formed, and this runs *after* the workspaces
   * have been removed. Nothing derives anything from the name again.
   */
  tombstoneTeam(teamId: string, at: number): void {
    const team = this.listTeams({ includeDeleted: true }).find((row) => row.id === teamId);
    if (team === undefined || team.deletedAt !== undefined) return;
    this.#db
      .update(teams)
      .set({ deletedAt: at, name: `${team.name} · deleted · ${team.id}` })
      .where(eq(teams.id, teamId))
      .run();
    // A Handbook dies with its team, unlike the transcript, which is kept. The transcript is a
    // record of what happened; a Handbook is live context for a team that no longer exists.
    this.#db
      .update(handbookEntries)
      .set({ deletedAt: at })
      .where(and(eq(handbookEntries.teamId, teamId), isNull(handbookEntries.deletedAt)))
      .run();
  }

  // --------------------------------------------------------------- agents, before any team

  /**
   * Hire an agent. It exists from this moment on, on no team — which is the whole point of
   * the profile: a Team is something an Agent joins, not the thing that brings it into being.
   */
  createProfile(profile: AgentProfileRecord): AgentProfileRecord {
    this.#db.insert(agentProfiles).values({
      id: profile.id,
      name: profile.name,
      role: profile.role,
      runtimeId: profile.runtimeId,
      executablePath: profile.executablePath ?? null,
      runtimeOptions: encodeOptions(profile.runtimeOptions),
      trust: profile.trust ?? null,
      compaction: profile.compaction ?? null,
      verbosity: profile.verbosity ?? null,
      instructions: profile.instructions ?? null,
      hue: profile.hue ?? null,
      shape: profile.shape ?? null,
      createdAt: profile.createdAt,
      deletedAt: profile.deletedAt ?? null,
    }).run();
    return profile;
  }

  listProfiles(options: { includeDeleted?: boolean } = {}): AgentProfileRecord[] {
    return this.#db
      .select()
      .from(agentProfiles)
      .orderBy(asc(agentProfiles.createdAt))
      .all()
      .filter((row) => options.includeDeleted === true || row.deletedAt === null)
      .map(toProfileRecord);
  }

  profileById(profileId: string): AgentProfileRecord | undefined {
    return this.listProfiles({ includeDeleted: true }).find((profile) => profile.id === profileId);
  }

  /** The name is unique: two agents called Alice would be two identities wearing one name. */
  profileByName(name: string): AgentProfileRecord | undefined {
    return this.listProfiles({ includeDeleted: true }).find((profile) => profile.name === name);
  }

  /**
   * Which teams this agent is on. A membership question rather than a count on the profile
   * row: the answer changes every time a team is created, and a denormalised count drifts.
   */
  membershipsOf(profileId: string): AgentRecord[] {
    return this.#db
      .select()
      .from(agents)
      .where(eq(agents.profileId, profileId))
      .all()
      .filter((row) => row.deletedAt === null)
      .map(toAgentRecord);
  }

  /**
   * Rewrite an agent's definition. Every field is given, because this is what the profile is
   * now rather than a patch against what it was.
   *
   * It touches the profile row alone. What an edit does to the teams the agent is already on
   * is a separate decision with a separate reason for each field, and it lives one level up in
   * the app's `editAgentProfile` — see `docs/adr/0002-editing-an-agents-definition.md`.
   */
  updateProfile(profileId: string, definition: AgentDefinition): void {
    this.#db
      .update(agentProfiles)
      .set({
        name: definition.name,
        role: definition.role,
        runtimeId: definition.runtimeId,
        executablePath: definition.executablePath ?? null,
        runtimeOptions: encodeOptions(definition.runtimeOptions),
        trust: definition.trust ?? null,
        compaction: definition.compaction ?? null,
        verbosity: definition.verbosity ?? null,
        instructions: definition.instructions ?? null,
        hue: definition.hue ?? null,
        shape: definition.shape ?? null,
      })
      .where(eq(agentProfiles.id, profileId))
      .run();
  }

  /**
   * Carry the half of an edited definition that a membership is not built out of onto one
   * Agent row: its role, its standing instructions and its face.
   *
   * Deliberately not its name, and not its runtime. The AgentWorkspace is `blobot/<team>/<agent>`
   * and the branch is named after what the agent was called when it joined; a session belongs
   * to the provider that opened it. Those two are what a Team gave the Agent, and an edit to
   * the definition does not reach back into them.
   */
  restateAgent(
    agentId: string,
    stated: {
      readonly role: string;
      readonly instructions?: string;
      readonly hue?: number;
      readonly shape?: string;
      readonly runtimeOptions?: Readonly<Record<string, string>>;
      readonly trust?: TrustLevel;
      readonly compaction?: CompactionSetting;
      readonly verbosity?: VerbosityLevel;
    },
  ): void {
    this.#db
      .update(agents)
      .set({
        role: stated.role,
        instructions: stated.instructions ?? null,
        hue: stated.hue ?? null,
        shape: stated.shape ?? null,
        // Like the role: restated on every team, taken at that team's next start. The session
        // in flight keeps what it was launched with, because that is what it was launched with.
        runtimeOptions: encodeOptions(stated.runtimeOptions),
        // Same rule, and the one with teeth: `allowedTools` is a `session/new` parameter and
        // OpenCode's posture is an env var on the child, so neither can change under a live
        // process. A raised or lowered level is a fact about the next launch.
        trust: stated.trust ?? null,
        // And the same rule once more. Whether blobot may replace a session is a fact about
        // the next launch, because the session it would replace is the one already running.
        compaction: stated.compaction ?? null,
        // And once more, for a different reason: this one is read only by `composePersona`,
        // and a persona is a `session/new` parameter on every adapter blobot has.
        verbosity: stated.verbosity ?? null,
      })
      .where(eq(agents.id, agentId))
      .run();
  }

  /**
   * Retiring an agent tombstones the profile and leaves every Agent it was instantiated as
   * running. The teams it is on are real teams; ending them is a separate decision.
   */
  tombstoneProfile(profileId: string, at: number): void {
    this.#db.update(agentProfiles).set({ deletedAt: at }).where(eq(agentProfiles.id, profileId)).run();
  }

  // ------------------------------------------------------------------ agents on a team

  createAgent(agent: AgentRecord): AgentRecord {
    this.#db.insert(agents).values({
      id: agent.id,
      teamId: agent.teamId,
      profileId: agent.profileId ?? null,
      name: agent.name,
      role: agent.role,
      instructions: agent.instructions ?? null,
      hue: agent.hue ?? null,
      shape: agent.shape ?? null,
      runtimeId: agent.runtimeId,
      executablePath: agent.executablePath ?? null,
      runtimeOptions: encodeOptions(agent.runtimeOptions),
      trust: agent.trust ?? null,
      compaction: agent.compaction ?? null,
      verbosity: agent.verbosity ?? null,
      workspacePath: agent.workspacePath,
      branch: agent.branch ?? null,
      createdAt: agent.createdAt,
      deletedAt: agent.deletedAt ?? null,
    }).run();
    return agent;
  }

  /**
   * Deleting an agent tombstones it. A cascade would silently rewrite the record of what Alice
   * was told, and a peer message references two agents — so it would tear holes in a transcript
   * that has nothing to do with the deleted agent.
   */
  tombstoneAgent(agentId: string, at: number): void {
    this.#db.update(agents).set({ deletedAt: at }).where(eq(agents.id, agentId)).run();
  }

  /**
   * One agent, live only. A tombstoned agent answers `undefined`, which is the answer a Routine
   * needs: its recipient is off the roster and it has nobody to fire at.
   */
  agentById(agentId: string): AgentRecord | undefined {
    const row = this.#db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), isNull(agents.deletedAt)))
      .get();
    return row === undefined ? undefined : toAgentRecord(row);
  }

  agentsOfTeam(teamId: string, options: { includeDeleted?: boolean } = {}): AgentRecord[] {
    const rows = this.#db.select().from(agents).where(eq(agents.teamId, teamId)).all();
    return rows
      .filter((row) => options.includeDeleted === true || row.deletedAt === null)
      .map(toAgentRecord);
  }

  /**
   * The provider's own session id from this agent's most recent session, if it had one.
   *
   * This is what turns a relaunch into a resume: hand it back to the runtime and the agent
   * comes back knowing the conversation, instead of reading its own transcript as a stranger.
   * `undefined` is ordinary — a first launch, or a runtime that names no session.
   */
  lastProviderSessionOf(agentId: string): string | undefined {
    const row = this.#db
      .select()
      .from(sessions)
      .where(eq(sessions.agentId, agentId))
      .orderBy(desc(sessions.startedAt), desc(sessions.id))
      .get();
    return row?.providerSessionId ?? undefined;
  }

  /**
   * The persona this agent's most recent session was opened with.
   *
   * Persisted rather than recomposed: what the running agent actually carries is the text it
   * was given, and an edit to its definition does not reach a session that is already open.
   */
  lastPersonaOf(agentId: string): string | undefined {
    return this.#db
      .select({ personaText: sessions.personaText })
      .from(sessions)
      .where(eq(sessions.agentId, agentId))
      .orderBy(desc(sessions.startedAt), desc(sessions.id))
      .get()?.personaText;
  }

  startSession(session: SessionRecord): SessionRecord {
    this.#db.insert(sessions).values({
      id: session.id,
      agentId: session.agentId,
      providerSessionId: session.providerSessionId ?? null,
      personaText: session.personaText,
      startedAt: session.startedAt,
    }).run();
    return session;
  }

  // ------------------------------------------------------------------ the mailbox

  commit(message: Message): Message {
    if (message.idempotencyKey !== undefined) {
      const existing = this.#db
        .select()
        .from(messages)
        .where(eq(messages.idempotencyKey, message.idempotencyKey))
        .get();
      // A retried tool call collides with the row it already wrote, so a crash between insert
      // and ack is self-correcting.
      if (existing !== undefined) return toMessage(existing);
    }
    this.#db.insert(messages).values({
      id: message.id,
      teamId: message.teamId,
      fromAgentId: message.fromAgentId,
      toAgentId: message.toAgentId,
      body: message.body,
      context: message.context ?? null,
      idempotencyKey: message.idempotencyKey ?? null,
      at: message.at,
      deliveredAt: message.deliveredAt ?? null,
      routineRunId: message.routineRunId ?? null,
    }).run();
    // The blob was written once, by `putAttachment`. This is the row that says which messages
    // it is on, which is how one paste serves a fan-out of three.
    (message.attachments ?? []).forEach((attachment, ordinal) => {
      this.#db
        .insert(messageAttachments)
        .values({ messageId: message.id, attachmentId: attachment.id, ordinal })
        .run();
    });
    return message;
  }

  putAttachment(content: AttachmentContent): Attachment {
    const { data, at: _at, ...record } = content;
    this.#db
      .insert(attachments)
      .values({
        id: content.id,
        kind: content.kind,
        mimeType: content.mimeType,
        name: content.name ?? null,
        bytes: content.bytes,
        data: Buffer.from(data),
        at: content.at,
      })
      .onConflictDoNothing()
      .run();
    return record;
  }

  attachment(id: string): AttachmentContent | undefined {
    const row = this.#db.select().from(attachments).where(eq(attachments.id, id)).get();
    return row === undefined ? undefined : toAttachmentContent(row);
  }

  /**
   * Hang each row's attachments off it, in one query for the whole page.
   *
   * Metadata only, never the bytes: a transcript of two hundred messages must not carry two
   * hundred images through every snapshot. A consumer that needs the content asks for it by id.
   */
  #withAttachments(rows: Message[]): Message[] {
    if (rows.length === 0) return rows;
    const links = this.#db
      .select({
        messageId: messageAttachments.messageId,
        ordinal: messageAttachments.ordinal,
        id: attachments.id,
        kind: attachments.kind,
        mimeType: attachments.mimeType,
        name: attachments.name,
        bytes: attachments.bytes,
      })
      .from(messageAttachments)
      .innerJoin(attachments, eq(attachments.id, messageAttachments.attachmentId))
      .where(inArray(messageAttachments.messageId, rows.map((row) => row.id)))
      .orderBy(asc(messageAttachments.ordinal))
      .all();
    if (links.length === 0) return rows;
    const byMessage = new Map<string, Attachment[]>();
    for (const link of links) {
      const list = byMessage.get(link.messageId) ?? [];
      list.push({
        id: link.id,
        kind: link.kind,
        mimeType: link.mimeType,
        bytes: link.bytes,
        ...(link.name === null ? {} : { name: link.name }),
      });
      byMessage.set(link.messageId, list);
    }
    return rows.map((row) => {
      const found = byMessage.get(row.id);
      return found === undefined ? row : { ...row, attachments: found };
    });
  }

  undelivered(agentId: string): Message[] {
    return this.#withAttachments(
      this.#db
      .select()
      .from(messages)
      .where(and(eq(messages.toAgentId, agentId), isNull(messages.deliveredAt)))
      .orderBy(asc(messages.id))
      .all()
      .map(toMessage),
    );
  }

  markDelivered(ids: readonly string[], at: number): void {
    // One numbered batch is delivered as a unit: either the whole queue is marked or none is.
    this.#db.transaction((tx) => {
      for (const id of ids) {
        tx.update(messages).set({ deliveredAt: at }).where(eq(messages.id, id)).run();
      }
    });
  }

  byId(id: string): Message | undefined {
    const row = this.#db.select().from(messages).where(eq(messages.id, id)).get();
    return row === undefined ? undefined : this.#withAttachments([toMessage(row)])[0];
  }

  /** A conversation pane: everything this agent said or was told. */
  forAgent(agentId: string): Message[] {
    return this.#withAttachments(
      this.#db
      .select()
      .from(messages)
      .where(or(eq(messages.toAgentId, agentId), eq(messages.fromAgentId, agentId)))
      .orderBy(asc(messages.id))
      .all()
      .map(toMessage),
    );
  }

  /**
   * The team stream. A peer message is one row rendered in two panes and once here — a query,
   * not a storage fact.
   *
   * **Unbounded, and the snapshot must not use it.** `transcriptOfTeam` is the windowed entry
   * point and the only one `snapshot()` is allowed to call: this returns every row a team has
   * ever written, which is the right answer for a test and the wrong one for a pane.
   */
  forTeam(teamId: string): Message[] {
    return this.#withAttachments(
      this.#db
      .select()
      .from(messages)
      .where(eq(messages.teamId, teamId))
      .orderBy(asc(messages.id))
      .all()
      .map(toMessage),
    );
  }

  /**
   * What the team actually *said*, for a pane that is being rebuilt after a restart.
   *
   * Answers only. Thinking is persisted beside it and deliberately not returned: ticket 12
   * gives thinking no place in the conversation, and a restart is the wrong moment for the
   * UI to start showing something a live turn does not.
   */
  answersOfTeam(teamId: string): { id: string; agentId: string; text: string; at: number }[] {
    const ids = this.agentsOfTeam(teamId, { includeDeleted: true }).map((agent) => agent.id);
    if (ids.length === 0) return [];
    return this.#db
      .select()
      .from(agentMessages)
      .where(and(inArray(agentMessages.agentId, ids), eq(agentMessages.kind, 'answer')))
      .orderBy(asc(agentMessages.at))
      .all()
      .map((row) => ({ id: row.id, agentId: row.agentId, text: row.text, at: row.at }));
  }

  /**
   * The transcript, windowed: the most recent `limit` or so of what this team said, and a
   * cursor for reaching what is above it.
   *
   * The snapshot used to be the whole team transcript, every time. `forTeam` and
   * `answersOfTeam` both `.all()` with no bound, `snapshot()` calls them at launch and on every
   * team switch, and `TeamPool` keeps three teams live but rebuilds the snapshot on selection
   * regardless — so switching between two long-lived teams re-serialized both transcripts
   * across the IPC boundary on every click. Ticket 01 stopped the renderer paying for history
   * on every delta and ticket 03 will stop it paying in the DOM; neither stops the main process
   * reading and serializing an unbounded row set, which is this.
   *
   * **Bounded by time across both halves, never by count on each**, which is the same rule
   * `logOfTeam` follows and for a sharper reason. The two halves are merge-sorted by the pane
   * (`model.ts`), so taking the last N messages and the last N answers independently gives a
   * window with a ragged edge: a reply whose question fell off the top, or a question whose
   * answer did. A conversation missing half its speakers is the one shape the snapshot reducer
   * already says it must not have. So: over-fetch both halves, find the cutoff across the
   * merged times, and cut both at it. An uneven count either side of the cutoff is fine.
   *
   * `before` pages upward — the oldest `at` the pane is currently holding. `more` says whether
   * anything exists above the window, and is free: the over-fetch is `limit + 1` per half, so a
   * row surviving the merge below the cutoff *is* the evidence, with no second query.
   *
   * One honest limitation, shared with `logOfTeam`. The cutoff is a time, so a window whose
   * oldest rows all share a millisecond keeps every one it fetched and loses any beyond the
   * over-fetch at that same instant, because the next page asks for `at <` it. That needs more
   * than `limit` rows written inside one millisecond, which a team of agents taking turns does
   * not do. It is written down rather than defended against, because the alternative is a
   * composite cursor and this does not earn one.
   */
  transcriptOfTeam(
    teamId: string,
    { limit = TRANSCRIPT_WINDOW, before }: { limit?: number; before?: number } = {},
  ): {
    messages: Message[];
    answers: { id: string; agentId: string; text: string; at: number }[];
    /** Whether the team said anything above this window. The `load earlier` control's reason. */
    more: boolean;
  } {
    const ids = this.agentsOfTeam(teamId, { includeDeleted: true }).map((agent) => agent.id);
    // One more than asked for, per half. The extra row is what `more` is read from.
    const reach = limit + 1;
    const olderThan = (column: SQLiteColumn): SQL | undefined =>
      before === undefined ? undefined : lt(column, before);

    const recentMessages = this.#db
      .select()
      .from(messages)
      .where(and(eq(messages.teamId, teamId), olderThan(messages.at)))
      // `messages_team_stream` is on (team_id, at), so this is the index's own order.
      .orderBy(desc(messages.at))
      .limit(reach)
      .all()
      .map(toMessage);

    const recentAnswers =
      ids.length === 0
        ? []
        : this.#db
            .select()
            .from(agentMessages)
            .where(
              and(
                inArray(agentMessages.agentId, ids),
                eq(agentMessages.kind, 'answer'),
                olderThan(agentMessages.at),
              ),
            )
            .orderBy(desc(agentMessages.at))
            .limit(reach)
            .all()
            .map((row) => ({ id: row.id, agentId: row.agentId, text: row.text, at: row.at }));

    const times = [...recentMessages, ...recentAnswers]
      .map((row) => row.at)
      .sort((left, right) => right - left);
    // Fewer rows than asked for means both halves are exhausted and this is the whole of it.
    const cutoff = times.length > limit ? (times[limit - 1] as number) : times.at(-1);
    if (cutoff === undefined) return { messages: [], answers: [], more: false };

    return {
      // Back to ascending. The pane sorts by `at` anyway, but a store method that returns the
      // stream backwards is one every future caller has to remember about.
      messages: this.#withAttachments(
        recentMessages.filter((row) => row.at >= cutoff).reverse(),
      ),
      answers: recentAnswers.filter((row) => row.at >= cutoff).reverse(),
      // A row we fetched and are not returning is proof there is history above. If the merged
      // over-fetch fits inside the window, there was nothing left to fetch.
      more: times.length > limit,
    };
  }

  /**
   * The team's log, for the activity column: finished tool calls and finished turns.
   *
   * The column is rebuilt from live events only, so before this it emptied on every snapshot —
   * a team switch, and anything else that re-snapshots — while the transcript beside it came
   * back in full. The rows were in the database the whole time. Unusual endings are here for a
   * second reason: `turn stopped · …` is drawn in the *transcript*, and a switch away and back
   * used to leave an answer that stopped mid-sentence looking like an answer that finished.
   *
   * Bounded, and by time across both halves rather than by count on each: the activity column
   * keeps 200 entries, and taking the last 200 of each independently would pair a turn ending
   * with tool calls from an hour later.
   *
   * A restored line can say everything a live one says, since 2026-08-30. It could not before:
   * live, a cancelled tool that reports `completed` with an explicit `exit: null` is printed as
   * `exit null` rather than trusted, and `exit_code` stored a null for that *and* for every tool
   * that never had an exit code — so a restored line that printed it would have been guessing,
   * and one that stayed silent lost a cancellation. `exit_reported` separates the two, and
   * `exit` is present here only where a code genuinely came over the wire.
   *
   * These rows feed two surfaces now. The activity column takes them as log, ordered by when a
   * call finished. The transcript takes them as items, ordered by `startedAt`, which is why
   * both times are returned rather than one.
   */
  logOfTeam(teamId: string, limit = 200): {
    /**
     * Calls that had not finished when this was read.
     *
     * Apart from `tools`, because the two are different claims: `tools` is the log of what
     * happened, and this is what was happening. The activity column takes the first and the
     * transcript takes both, so a pane rebuilt mid-turn shows the call that is running rather
     * than discovering it only if it happens to finish afterwards.
     *
     * It exists because the renderer drops every event that arrives before its first snapshot
     * resolves — it does not yet know which team is on screen — so a call that started in that
     * window was invisible in the stream *and* excluded here for having no `ended_at`, and a
     * six-call turn read `ran 5`.
     */
    running: { toolCallId: string; agentId: string; startedAt: number; title: string; kind: string | null }[];
    tools: {
      toolCallId: string;
      agentId: string;
      at: number;
      startedAt: number;
      title: string;
      status: string;
      kind: string | null;
      exit?: number | null;
      changed?: { added: number; removed: number };
    }[];
    turns: { turnId: string; agentId: string; at: number; stopReason: StopReason }[];
    /**
     * Sessions blobot replaced, or decided to keep. Ticket 10.
     *
     * Not windowed with the other two, and deliberately. A compaction happens at most twice per
     * agent per fill-up, so there are a handful of them over a week — but they are also the only
     * rows here that explain why an agent stopped remembering, and a busy hour of tool calls
     * would push every one of them out of a shared 200-row window. They are cheap and they are
     * the ones a reader goes looking for.
     */
    compactions: {
      agentId: string;
      at: number;
      how: 'command' | 'handoff' | 'refused';
      used: number;
      ceiling: number;
      measured: boolean;
      personaRefreshed?: boolean;
      handoff?: string;
      handoffPath?: string;
      reason?: string;
    }[];
  } {
    const ids = this.agentsOfTeam(teamId, { includeDeleted: true }).map((agent) => agent.id);
    if (ids.length === 0) return { running: [], tools: [], turns: [], compactions: [] };
    const tools = this.#db
      .select()
      .from(toolCalls)
      .where(and(inArray(toolCalls.agentId, ids), isNotNull(toolCalls.endedAt)))
      .orderBy(desc(toolCalls.endedAt))
      .limit(limit)
      .all()
      .map((row) => ({
        // The provider's id, not the row's: it is what the live line is keyed by, so a
        // restored entry and a live one for the same call are the same entry.
        toolCallId: row.providerToolCallId,
        agentId: row.agentId,
        at: row.endedAt ?? row.startedAt,
        // Where the call stood in the conversation, which is not where it stood in the log.
        // The feed is ordered by when a call finished; the transcript puts it after the line
        // that introduced it, so a restored turn reads in the order it was written.
        startedAt: row.startedAt,
        title: row.name,
        status: row.status,
        kind: row.kind,
        // Only where the runtime actually reported one. Without `exit_reported` this would
        // hand every call a null and tell the transcript that all of them were cancelled.
        ...(row.exitReported ? { exit: row.exitCode } : {}),
        // Both or neither: they are written together, so a row with one is a row from before
        // this was stored, and half a diff is not a fact worth drawing.
        ...(row.linesAdded === null || row.linesRemoved === null
          ? {}
          : { changed: { added: row.linesAdded, removed: row.linesRemoved } }),
      }));
    const running = this.#db
      .select()
      .from(toolCalls)
      .where(and(inArray(toolCalls.agentId, ids), isNull(toolCalls.endedAt)))
      .orderBy(desc(toolCalls.startedAt))
      .limit(limit)
      .all()
      .map((row) => ({
        toolCallId: row.providerToolCallId,
        agentId: row.agentId,
        startedAt: row.startedAt,
        title: row.name,
        kind: row.kind,
      }));
    const ended = this.#db
      .select()
      .from(turns)
      .where(and(inArray(turns.agentId, ids), isNotNull(turns.endedAt), isNotNull(turns.stopReason)))
      .orderBy(desc(turns.endedAt))
      .limit(limit)
      .all()
      .map((row) => ({
        turnId: row.id,
        agentId: row.agentId,
        at: row.endedAt ?? row.startedAt,
        stopReason: (row.stopReason ?? 'end_turn') as StopReason,
      }));
    // One window over both halves, so the column reads as one log and not as two lists that
    // happen to be adjacent.
    const cutoff = [...tools, ...ended]
      .map((entry) => entry.at)
      .sort((left, right) => right - left)
      .slice(0, limit)
      .at(-1);
    const compactions = this.#db
      .select({ payload: events.payload, agentId: events.agentId, at: events.at })
      .from(events)
      .where(and(eq(events.teamId, teamId), eq(events.kind, 'context_compacted')))
      .orderBy(desc(events.at))
      .limit(limit)
      .all()
      .flatMap((row) => {
        const payload = JSON.parse(row.payload) as {
          how?: string;
          used?: number;
          ceiling?: number;
          measured?: boolean;
          personaRefreshed?: boolean;
          handoff?: string;
          handoffPath?: string;
          reason?: string;
        };
        // A row this cannot read is skipped rather than defaulted. Every field here is part of
        // a claim about what happened to somebody's session, and half of one is worse than none.
        if (
          row.agentId === null ||
          typeof payload.used !== 'number' ||
          typeof payload.ceiling !== 'number' ||
          !isCompactionKind(payload.how)
        ) {
          return [];
        }
        const how = payload.how as 'command' | 'handoff' | 'refused';
        return [
          {
            agentId: row.agentId,
            at: row.at,
            how,
            used: payload.used,
            ceiling: payload.ceiling,
            measured: payload.measured === true,
            ...(payload.personaRefreshed === true ? { personaRefreshed: true } : {}),
            ...(payload.handoff === undefined ? {} : { handoff: payload.handoff }),
            ...(payload.handoffPath === undefined ? {} : { handoffPath: payload.handoffPath }),
            ...(payload.reason === undefined ? {} : { reason: payload.reason }),
          },
        ];
      });
    // A call still in flight is never windowed out. There are at most a handful, they are by
    // definition the newest thing the team has, and the transcript needs every one of them: a
    // fold that is missing one says the wrong number.
    if (cutoff === undefined) return { running, tools: [], turns: [], compactions };
    return {
      running,
      tools: tools.filter((entry) => entry.at >= cutoff),
      turns: ended.filter((entry) => entry.at >= cutoff),
      compactions,
    };
  }

  /**
   * The last context reading each of this team's agents reported, so a relaunch or a team
   * switch does not blank the gauge.
   *
   * One query per agent rather than one for the team: an agent that has been quiet all week
   * still has a real occupancy, and a single bounded scan of the team's events would drop it
   * behind a talkative teammate's. Agents that have never reported are absent from the map,
   * which is the honest answer and is not the same as zero.
   */
  lastUsageOfTeam(teamId: string): Record<string, { used: number; size: number; costUsd?: number }> {
    const usage: Record<string, { used: number; size: number; costUsd?: number }> = {};
    for (const agent of this.agentsOfTeam(teamId, { includeDeleted: true })) {
      // A handful of rows rather than one, because the reading a cancelled turn leaves behind
      // is `used: 0` and is persisted like any other: a stored zero is a gauge reset, not an
      // empty context, so the last *real* reading is what the pane wants back.
      const rows = this.#db
        .select({ payload: events.payload })
        .from(events)
        .where(and(eq(events.agentId, agent.id), eq(events.kind, 'usage_updated')))
        .orderBy(desc(events.at), desc(events.id))
        .limit(8)
        .all();
      for (const row of rows) {
        const payload = JSON.parse(row.payload) as {
          used?: number;
          size?: number;
          costUsd?: number;
        };
        if (typeof payload.used !== 'number' || typeof payload.size !== 'number') continue;
        if (payload.used === 0) continue;
        usage[agent.id] = {
          used: payload.used,
          size: payload.size,
          ...(payload.costUsd === undefined ? {} : { costUsd: payload.costUsd }),
        };
        break;
      }
    }
    return usage;
  }

  /**
   * When this team last said anything: the latest of a user or peer message and an agent's own
   * words. The rail draws it on a stopped team, which otherwise carries no reason to prefer one
   * over another. Undefined for a team that has never held a turn.
   */
  lastActiveAt(teamId: string): number | undefined {
    const said = this.#db
      .select({ at: messages.at })
      .from(messages)
      .where(eq(messages.teamId, teamId))
      .orderBy(desc(messages.at))
      .limit(1)
      .get()?.at;
    const answers = this.agentsOfTeam(teamId, { includeDeleted: true }).map((agent) => agent.id);
    const answered =
      answers.length === 0
        ? undefined
        : this.#db
            .select({ at: agentMessages.at })
            .from(agentMessages)
            .where(inArray(agentMessages.agentId, answers))
            .orderBy(desc(agentMessages.at))
            .limit(1)
            .get()?.at;
    const times = [said, answered].filter((at): at is number => at !== undefined);
    return times.length === 0 ? undefined : Math.max(...times);
  }

  /** A row count per table, for the demo's closing line and for eyeballing a transcript. */
  transcriptCounts(): Record<string, number> {
    const tables = ['turns', 'agent_messages', 'tool_calls', 'messages', 'events'];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const row = this.#db.all<{ n: number }>(sql.raw(`SELECT count(*) AS n FROM ${table}`))[0];
      counts[table] = row?.n ?? 0;
    }
    return counts;
  }

  // ------------------------------------------------------------------ Handbooks

  /**
   * What this agent knows about this team's work, oldest first.
   *
   * Ordered by `created_at` because the persona numbers the entries and an agent naming number
   * three has to mean the same entry it meant last session. Removed entries are absent: the
   * Handbook is what is live, and the record of a removal lives in the transcript.
   */
  handbookOf(teamId: string, agentName: string): HandbookEntry[] {
    return this.#everyEntry(teamId, agentName).filter(
      (entry) => entry.removedAt === undefined,
    );
  }

  /** One entry by id, removed or not, because the transcript block names entries that are gone. */
  handbookEntryById(entryId: string): HandbookEntry | undefined {
    const row = this.#db
      .select()
      .from(handbookEntries)
      .where(eq(handbookEntries.id, entryId))
      .get();
    return row === undefined ? undefined : toHandbookEntry(row);
  }

  /**
   * Every entry this Handbook ever had, in the order it got them, **including removed ones**,
   * which is what makes the ordinal stable. Private: a caller that wanted the removed ones
   * wants {@link handbooksOfTeam}, which says so in its name.
   */
  #everyEntry(teamId: string, agentName: string): HandbookEntry[] {
    return this.#db
      .select()
      .from(handbookEntries)
      .where(
        and(
          eq(handbookEntries.teamId, teamId),
          eq(handbookEntries.agentName, agentName),
          isNull(handbookEntries.deletedAt),
        ),
      )
      // By the number itself, which is what the persona draws and what an agent names. Never by
      // `created_at, id`: one call writes its whole list in the same millisecond and a uuidv7's
      // tail is random, so a briefing came back in an order nobody wrote it in.
      .orderBy(asc(handbookEntries.ordinal))
      .all()
      .map(toHandbookEntry);
  }

  /**
   * Write entries. A list rather than one, because `record_entry` takes a list: an agent that
   * has just been briefed records what it heard as one act, and one call, and one disclosure.
   */
  recordHandbookEntries(entries: readonly NewHandbookEntry[]): HandbookEntry[] {
    if (entries.length === 0) return [];
    const first = entries[0] as NewHandbookEntry;
    // Numbered from what this Handbook has ever held, removed entries included, so a number
    // means the same entry next week as it did when the persona was composed. Read and written
    // in one synchronous call on one connection, which is the whole of the concurrency story.
    const held = this.#everyEntry(first.teamId, first.agentName).length;
    const written = entries.map((entry, index) => ({ ...entry, ordinal: held + index + 1 }));
    this.#db
      .insert(handbookEntries)
      .values(
        written.map((entry) => ({
          id: entry.id,
          teamId: entry.teamId,
          agentName: entry.agentName,
          ordinal: entry.ordinal,
          text: entry.text,
          source: entry.source,
          createdAt: entry.createdAt,
        })),
      )
      .run();
    return written;
  }

  /**
   * Take an entry out of the Handbook: the user removing one, or the agent withdrawing one it
   * authored as `noticed`.
   *
   * The row stays. Whether this caller was allowed to do it is not decided here — the tool
   * boundary owns that, the way it owns every other refusal.
   */
  removeHandbookEntry(entryId: string, at: number): void {
    this.#db
      .update(handbookEntries)
      .set({ removedAt: at })
      .where(and(eq(handbookEntries.id, entryId), isNull(handbookEntries.removedAt)))
      .run();
  }

  /**
   * A Handbook write, kept as an event so the transcript block survives a team switch.
   *
   * **Both the rows and the events, and they answer different questions.** The rows *are* the
   * Handbook and are what the persona is composed from. This is what happened, in a turn, and it
   * is the only record of the two things a row cannot hold: that one call wrote these particular
   * entries together, and that a call was refused because the Handbook was full, where nothing
   * was written at all.
   *
   * What it stores is **ids and never text**. The text and whether an entry is still there are
   * read back off the rows, so a reopened team never draws a removal control beside something
   * that is already gone.
   */
  recordHandbookWrite(
    id: string,
    teamId: string,
    write: { kind: 'recorded' | 'full'; agentId: string; at: number; entryIds?: readonly string[]; withdrewIds?: readonly string[] },
  ): void {
    this.#db
      .insert(events)
      .values({
        id,
        teamId,
        agentId: write.agentId,
        kind: write.kind === 'full' ? 'handbook_full' : 'handbook_recorded',
        payload: JSON.stringify({
          entryIds: write.entryIds ?? [],
          withdrewIds: write.withdrewIds ?? [],
        }),
        at: write.at,
      })
      .run();
  }

  /**
   * The writes in this team's transcript window, with what each entry says **now**.
   *
   * Bounded by `since` the way the Routine blocks are, so a briefing from last month does not
   * reappear at the top of a pane showing this afternoon.
   */
  handbookWritesOfTeam(
    teamId: string,
    since: number,
  ): {
    id: string;
    agentId: string;
    at: number;
    kind: 'recorded' | 'full';
    entries: HandbookEntry[];
    withdrew: HandbookEntry[];
  }[] {
    return this.#db
      .select()
      .from(events)
      .where(
        and(
          eq(events.teamId, teamId),
          inArray(events.kind, ['handbook_recorded', 'handbook_full']),
        ),
      )
      .orderBy(asc(events.at))
      .all()
      .flatMap((row) => {
        if (row.agentId === null || row.at < since) return [];
        const payload = JSON.parse(row.payload) as {
          entryIds?: string[];
          withdrewIds?: string[];
        };
        const resolve = (ids: readonly string[] | undefined): HandbookEntry[] =>
          (ids ?? []).flatMap((entryId) => {
            const entry = this.handbookEntryById(entryId);
            return entry === undefined ? [] : [entry];
          });
        return [
          {
            id: row.id,
            agentId: row.agentId,
            at: row.at,
            kind: row.kind === 'handbook_full' ? ('full' as const) : ('recorded' as const),
            entries: resolve(payload.entryIds),
            withdrew: resolve(payload.withdrewIds),
          },
        ];
      });
  }

  /**
   * Every entry of a team, dead ones included, for the panel and for a purge that wants to say
   * what it is holding.
   */
  handbooksOfTeam(teamId: string): HandbookEntry[] {
    return this.#db
      .select()
      .from(handbookEntries)
      .where(eq(handbookEntries.teamId, teamId))
      .orderBy(asc(handbookEntries.createdAt), asc(handbookEntries.id))
      .all()
      .map(toHandbookEntry);
  }

  // ------------------------------------------------------------------ Routines

  createRoutine(routine: Routine): Routine {
    this.#db
      .insert(routines)
      .values({
        id: routine.id,
        agentId: routine.agentId,
        name: routine.name,
        prompt: routine.prompt,
        ...scheduleColumns(routine.schedule),
        armed: routine.armed,
        proposedBy: routine.proposedBy ?? null,
        reviewedAt: routine.reviewedAt ?? null,
        lastSettledAt: routine.lastSettledAt ?? null,
        createdAt: routine.createdAt,
      })
      .run();
    return routine;
  }

  /**
   * Every live Routine in the file, armed or not.
   *
   * Not scoped to a team, and deliberately: the scheduler asks *what is due* across everything
   * the user has, and a Routine on a team that is not in the pool still fires — the pool's own
   * rule protects what matters, since it never evicts a working team.
   */
  allRoutines(): Routine[] {
    return this.#db
      .select()
      .from(routines)
      .where(isNull(routines.deletedAt))
      .orderBy(asc(routines.createdAt))
      .all()
      .map(toRoutine);
  }

  routinesOfAgent(agentId: string): Routine[] {
    return this.#db
      .select()
      .from(routines)
      .where(and(eq(routines.agentId, agentId), isNull(routines.deletedAt)))
      .orderBy(asc(routines.createdAt))
      .all()
      .map(toRoutine);
  }

  routineById(routineId: string): Routine | undefined {
    const row = this.#db.select().from(routines).where(eq(routines.id, routineId)).get();
    return row === undefined ? undefined : toRoutine(row);
  }

  /**
   * Arm or disarm. The only place authority enters a Routine, and the reason an agent may reach
   * this with `false` and never with `true`: a proposal lands disarmed and a person arms it.
   */
  setRoutineArmed(routineId: string, armed: boolean): void {
    this.#db.update(routines).set({ armed }).where(eq(routines.id, routineId)).run();
  }

  /**
   * A person answered this proposal, whatever they answered.
   *
   * Separate from {@link setRoutineArmed} on purpose: the tick disarms a Routine that has failed
   * three nights running, and that is blobot noticing rather than a person deciding. Only a call
   * that came from somebody at the screen may write this.
   */
  reviewRoutine(routineId: string, at: number): void {
    this.#db.update(routines).set({ reviewedAt: at }).where(eq(routines.id, routineId)).run();
  }

  /** Restate a Routine: the name, the words and the shape. Never the agent it belongs to. */
  updateRoutine(
    routineId: string,
    fields: { name: string; prompt: string; schedule: Schedule },
  ): void {
    this.#db
      .update(routines)
      .set({ name: fields.name, prompt: fields.prompt, ...scheduleColumns(fields.schedule) })
      .where(eq(routines.id, routineId))
      .run();
  }

  /**
   * Everything up to and including `at` is accounted for, ran or missed.
   *
   * Not *fired*: a missed firing does not run, so a fired-mark would never advance and the
   * scheduler would report the same missed firing on every tick for the rest of the Routine's
   * life, writing another run row each time.
   */
  settleRoutine(routineId: string, at: number): void {
    this.#db.update(routines).set({ lastSettledAt: at }).where(eq(routines.id, routineId)).run();
  }

  /**
   * How many firings have come and gone with nobody there, since the last one blobot was there
   * for. Written by the tick beside the settling, and set back to zero the next time a firing is
   * actually decided on.
   *
   * Not a `routine_runs` row: a missed firing is not a run. Recording one would put a laptop
   * that was shut for three nights into issue 08's disarm rule, which counts failures, and a
   * shut laptop is the ordinary condition rather than a failure.
   */
  setMissedFirings(routineId: string, count: number): void {
    this.#db.update(routines).set({ missedFirings: count }).where(eq(routines.id, routineId)).run();
  }

  tombstoneRoutine(routineId: string, at: number): void {
    this.#db.update(routines).set({ deletedAt: at }).where(eq(routines.id, routineId)).run();
  }

  recordRoutineRun(run: RoutineRun): RoutineRun {
    this.#db
      .insert(routineRuns)
      .values({
        id: run.id,
        routineId: run.routineId,
        firedAt: run.firedAt,
        outcome: run.outcome,
        reason: run.reason ?? null,
        seenAt: run.seenAt ?? null,
      })
      .run();
    return run;
  }

  /**
   * How a run that was already written ended.
   *
   * A firing writes its row when it starts, carrying the outcome it would have if blobot stopped
   * existing that second: `stopped`, because a turn started and did not finish. That is not a
   * placeholder, it is the crash-consistent answer — a run interrupted by a quit is a run that
   * did not finish, and writing the row only at the end would leave it looking as though the
   * Routine never fired at all. This replaces it once the turn is over.
   */
  settleRoutineRun(runId: string, outcome: RoutineOutcome, reason?: string): void {
    this.#db
      .update(routineRuns)
      .set({ outcome, reason: reason ?? null })
      .where(eq(routineRuns.id, runId))
      .run();
  }

  /** Newest first. Issue 06 sorts its screen on the first of these. */
  routineRunsOf(routineId: string, limit = 50): RoutineRun[] {
    return this.#db
      .select()
      .from(routineRuns)
      .where(eq(routineRuns.routineId, routineId))
      .orderBy(desc(routineRuns.firedAt))
      .limit(limit)
      .all()
      .map(toRoutineRun);
  }

  /**
   * How many runs in a row have ended in anything but `ran`.
   *
   * Issue 08's shared rule counts on this: three consecutive failures disarm the Routine,
   * whatever the reason was. An instruction that has failed the same way three nights running is
   * not automation, it is a process leak with a schedule attached.
   */
  consecutiveRoutineFailures(routineId: string): number {
    let count = 0;
    for (const run of this.routineRunsOf(routineId, 10)) {
      if (run.outcome === 'ran') break;
      count += 1;
    }
    return count;
  }

  /**
   * Runs the user has not looked at, for the agents named. Issue 11's unread mark: a Routine
   * whose value is the *message* lands in a pane nobody has a reason to open, so the rail draws
   * its preview line at full ink until it has been seen.
   */
  unseenRoutineRuns(agentIds: readonly string[]): { agentId: string; firedAt: number }[] {
    if (agentIds.length === 0) return [];
    return this.#db
      .select({ agentId: routines.agentId, firedAt: routineRuns.firedAt })
      .from(routineRuns)
      .innerJoin(routines, eq(routineRuns.routineId, routines.id))
      .where(
        and(
          inArray(routines.agentId, [...agentIds]),
          isNull(routineRuns.seenAt),
          eq(routineRuns.outcome, 'ran'),
        ),
      )
      .orderBy(desc(routineRuns.firedAt))
      .all();
  }

  /**
   * Which Routine a firing belongs to, by name. Issue 07's `system` line above a prompt nobody
   * typed at that hour: `routine · nightly typecheck`.
   *
   * Answers for a tombstoned Routine too — deliberately. The transcript is a record of what
   * happened, and a turn that ran because of a Routine the user has since deleted still ran
   * because of it. An unattributed line there would be blobot forgetting its own reason.
   */
  routineNameOfRun(runId: string): string | undefined {
    const row = this.#db
      .select({ name: routines.name })
      .from(routineRuns)
      .innerJoin(routines, eq(routineRuns.routineId, routines.id))
      .where(eq(routineRuns.id, runId))
      .get();
    return row?.name;
  }

  /** Opening that agent's pane is the only thing that clears the mark. */
  markRoutineRunsSeen(agentId: string, at: number): void {
    const ids = this.#db
      .select({ id: routineRuns.id })
      .from(routineRuns)
      .innerJoin(routines, eq(routineRuns.routineId, routines.id))
      .where(and(eq(routines.agentId, agentId), isNull(routineRuns.seenAt)))
      .all()
      .map((row) => row.id);
    if (ids.length === 0) return;
    this.#db.update(routineRuns).set({ seenAt: at }).where(inArray(routineRuns.id, ids)).run();
  }

  /**
   * Every ceiling the user has set, whatever runtime it is for.
   *
   * Read whole rather than queried per model: there are as many rows here as there are models
   * somebody sat and watched, which is a handful, and the resolver wants them all anyway.
   */
  contextCeilings(): ContextCeilingRecord[] {
    return this.#db
      .select()
      .from(contextCeilings)
      .all()
      .map((row) => ({
        runtimeId: row.runtimeId,
        ...(row.model === '' ? {} : { model: row.model }),
        tokens: row.tokens,
        at: row.at,
      }));
  }

  /** The user's number for one model. Absent `model` is the runtime's own default. */
  setContextCeiling(runtimeId: string, model: string | undefined, tokens: number, at: number): void {
    this.#db
      .insert(contextCeilings)
      .values({ runtimeId, model: model ?? '', tokens, at })
      .onConflictDoUpdate({
        target: [contextCeilings.runtimeId, contextCeilings.model],
        set: { tokens, at },
      })
      .run();
  }

  /**
   * Take it back, and fall to whatever blobot knew before it.
   *
   * A real delete rather than a tombstone, which is the one place in this file that happens: a
   * tombstone exists here so a transcript keeps pointing at what it said at the time, and
   * nothing points at this row. It is a preference with no history worth keeping.
   */
  clearContextCeiling(runtimeId: string, model: string | undefined): void {
    this.#db
      .delete(contextCeilings)
      .where(and(eq(contextCeilings.runtimeId, runtimeId), eq(contextCeilings.model, model ?? '')))
      .run();
  }

  /** Dictation's row, or the default when nothing has ever been saved. Read whole. */
  dictationSettings(): DictationRecord {
    const row = this.#db.select().from(dictation).where(eq(dictation.id, 1)).get();
    if (row === undefined) return DEFAULT_DICTATION;
    return {
      enabled: row.enabled,
      transcriber: row.transcriber,
      modelId: row.modelId,
      providerId: row.providerId,
      readiness: row.readiness,
      ...(row.measuredRtf === null ? {} : { measuredRtf: row.measuredRtf }),
      measuredModelId: row.measuredModelId,
      at: row.at,
    };
  }

  /** Written whole: the row is the whole of what dictation is set to, never a partial patch. */
  saveDictationSettings(record: DictationRecord): void {
    const values = {
      id: 1,
      enabled: record.enabled,
      transcriber: record.transcriber,
      modelId: record.modelId,
      providerId: record.providerId,
      readiness: record.readiness,
      measuredRtf: record.measuredRtf ?? null,
      measuredModelId: record.measuredModelId,
      at: record.at,
    };
    this.#db
      .insert(dictation)
      .values(values)
      .onConflictDoUpdate({ target: dictation.id, set: values })
      .run();
  }
}

function toHandbookEntry(row: typeof handbookEntries.$inferSelect): HandbookEntry {
  return {
    id: row.id,
    ordinal: row.ordinal,
    teamId: row.teamId,
    agentName: row.agentName,
    text: row.text,
    source: row.source as EntrySource,
    createdAt: row.createdAt,
    ...(row.removedAt === null ? {} : { removedAt: row.removedAt }),
  };
}

type MessageRow = typeof messages.$inferSelect;
type AgentRow = typeof agents.$inferSelect;
type AgentProfileRow = typeof agentProfiles.$inferSelect;

function toProfileRecord(row: AgentProfileRow): AgentProfileRecord {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    runtimeId: row.runtimeId,
    createdAt: row.createdAt,
    ...(row.executablePath === null ? {} : { executablePath: row.executablePath }),
    ...optionsOf(row.runtimeOptions),
    ...(row.trust === null ? {} : { trust: trustLevelOf(row.trust) }),
    ...(row.compaction === null ? {} : { compaction: compactionSettingOf(row.compaction) }),
    ...(row.verbosity === null ? {} : { verbosity: verbosityLevelOf(row.verbosity) }),
    ...(row.instructions === null ? {} : { instructions: row.instructions }),
    ...(row.hue === null ? {} : { hue: row.hue }),
    ...(row.shape === null ? {} : { shape: row.shape }),
    ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
  };
}

function toAttachmentContent(row: {
  id: string;
  kind: 'image' | 'text';
  mimeType: string;
  name: string | null;
  bytes: number;
  data: Buffer;
  at: number;
}): AttachmentContent {
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mimeType,
    bytes: row.bytes,
    data: new Uint8Array(row.data),
    at: row.at,
    ...(row.name === null ? {} : { name: row.name }),
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    teamId: row.teamId,
    fromAgentId: row.fromAgentId,
    toAgentId: row.toAgentId,
    body: row.body,
    at: row.at,
    ...(row.context === null ? {} : { context: row.context }),
    ...(row.idempotencyKey === null ? {} : { idempotencyKey: row.idempotencyKey }),
    ...(row.routineRunId === null ? {} : { routineRunId: row.routineRunId }),
    ...(row.deliveredAt === null ? {} : { deliveredAt: row.deliveredAt }),
  };
}

function toAgentRecord(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    role: row.role,
    workspacePath: row.workspacePath,
    runtimeId: row.runtimeId,
    createdAt: row.createdAt,
    ...(row.profileId === null ? {} : { profileId: row.profileId }),
    ...(row.instructions === null ? {} : { instructions: row.instructions }),
    ...(row.hue === null ? {} : { hue: row.hue }),
    ...(row.shape === null ? {} : { shape: row.shape }),
    ...(row.executablePath === null ? {} : { executablePath: row.executablePath }),
    ...optionsOf(row.runtimeOptions),
    ...(row.trust === null ? {} : { trust: trustLevelOf(row.trust) }),
    ...(row.compaction === null ? {} : { compaction: compactionSettingOf(row.compaction) }),
    ...(row.verbosity === null ? {} : { verbosity: verbosityLevelOf(row.verbosity) }),
    ...(row.branch === null ? {} : { branch: row.branch }),
    ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
  };
}

/**
 * The runtime option choices, in and out of one JSON column.
 *
 * An empty map is stored as NULL rather than as `{}`, so "the user chose nothing" has one
 * spelling in the database instead of two. Reading is defensive because the column is the one
 * place in this schema holding a shape the *provider* decides: a row written by a future
 * version, or by hand, must degrade to no choices rather than to a crash at launch.
 */
function encodeOptions(options: Readonly<Record<string, string>> | undefined): string | null {
  if (options === undefined || Object.keys(options).length === 0) return null;
  return JSON.stringify(options);
}

function optionsOf(raw: string | null): { runtimeOptions?: Record<string, string> } {
  if (raw === null || raw === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const options: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') options[key] = value;
    }
    return Object.keys(options).length === 0 ? {} : { runtimeOptions: options };
  } catch {
    return {};
  }
}

function scheduleColumns(schedule: Schedule): {
  scheduleKind: Schedule['kind'];
  scheduleMinute: number;
  scheduleHour: number | null;
  scheduleWeekday: number | null;
} {
  return {
    scheduleKind: schedule.kind,
    scheduleMinute: schedule.minute,
    scheduleHour: schedule.kind === 'hourly' ? null : schedule.hour,
    scheduleWeekday: schedule.kind === 'weekly' ? schedule.weekday : null,
  };
}

/**
 * Four columns back into one of three shapes. The nulls are not defensive: an hourly Routine has
 * no hour to be at, and a shape that cannot be rebuilt is a row that should never have been
 * written.
 */
function toSchedule(row: {
  scheduleKind: 'hourly' | 'daily' | 'weekly';
  scheduleMinute: number;
  scheduleHour: number | null;
  scheduleWeekday: number | null;
}): Schedule {
  switch (row.scheduleKind) {
    case 'hourly':
      return { kind: 'hourly', minute: row.scheduleMinute };
    case 'daily':
      return { kind: 'daily', hour: row.scheduleHour ?? 0, minute: row.scheduleMinute };
    case 'weekly':
      return {
        kind: 'weekly',
        weekday: row.scheduleWeekday ?? 0,
        hour: row.scheduleHour ?? 0,
        minute: row.scheduleMinute,
      };
  }
}

function toRoutine(row: typeof routines.$inferSelect): Routine {
  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    prompt: row.prompt,
    schedule: toSchedule(row),
    armed: row.armed,
    ...(row.proposedBy === null ? {} : { proposedBy: row.proposedBy }),
    ...(row.reviewedAt === null ? {} : { reviewedAt: row.reviewedAt }),
    ...(row.lastSettledAt === null ? {} : { lastSettledAt: row.lastSettledAt }),
    ...(row.missedFirings === 0 ? {} : { missedFirings: row.missedFirings }),
    createdAt: row.createdAt,
  };
}

function toRoutineRun(row: typeof routineRuns.$inferSelect): RoutineRun {
  return {
    id: row.id,
    routineId: row.routineId,
    firedAt: row.firedAt,
    outcome: row.outcome as RoutineOutcome,
    ...(row.reason === null ? {} : { reason: row.reason }),
    ...(row.seenAt === null ? {} : { seenAt: row.seenAt }),
  };
}

/**
 * Whether a stored `how` is one blobot still understands.
 *
 * A guard rather than a cast at the read, because this column holds whatever an older or newer
 * blobot wrote and the transcript should draw nothing rather than a word it cannot explain.
 */
function isCompactionKind(how: string | undefined): boolean {
  return how === 'command' || how === 'handoff' || how === 'refused';
}

/**
 * A stored compaction word, or the default for anything this version does not recognise.
 *
 * The same shape as `trustLevelOf` and for the same reason: the column holds whatever some
 * version of blobot wrote, and a row from the future must degrade to the documented default
 * rather than reaching the orchestrator as a string nothing branches on.
 */
function compactionSettingOf(stored: string): CompactionSetting {
  return stored === 'off' ? 'off' : DEFAULT_COMPACTION;
}
