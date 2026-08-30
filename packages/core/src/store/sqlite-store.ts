import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
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
import { trustLevelOf, type TrustLevel } from '../trust.js';
import type { BlobotDatabase } from './database.js';
import {
  agentMessages,
  agentProfiles,
  agents,
  attachments,
  events,
  messageAttachments,
  messages,
  sessions,
  teams,
  toolCalls,
  turns,
} from './schema.js';

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
  /** NULL when the Workspace is not a git repository. */
  readonly branch?: string;
  readonly createdAt: number;
  readonly deletedAt?: number;
}

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
      instructions: profile.instructions ?? null,
      hue: profile.hue ?? null,
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
        instructions: definition.instructions ?? null,
        hue: definition.hue ?? null,
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
      readonly runtimeOptions?: Readonly<Record<string, string>>;
      readonly trust?: TrustLevel;
    },
  ): void {
    this.#db
      .update(agents)
      .set({
        role: stated.role,
        instructions: stated.instructions ?? null,
        hue: stated.hue ?? null,
        // Like the role: restated on every team, taken at that team's next start. The session
        // in flight keeps what it was launched with, because that is what it was launched with.
        runtimeOptions: encodeOptions(stated.runtimeOptions),
        // Same rule, and the one with teeth: `allowedTools` is a `session/new` parameter and
        // OpenCode's posture is an env var on the child, so neither can change under a live
        // process. A raised or lowered level is a fact about the next launch.
        trust: stated.trust ?? null,
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
      runtimeId: agent.runtimeId,
      executablePath: agent.executablePath ?? null,
      runtimeOptions: encodeOptions(agent.runtimeOptions),
      trust: agent.trust ?? null,
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
  } {
    const ids = this.agentsOfTeam(teamId, { includeDeleted: true }).map((agent) => agent.id);
    if (ids.length === 0) return { running: [], tools: [], turns: [] };
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
    // A call still in flight is never windowed out. There are at most a handful, they are by
    // definition the newest thing the team has, and the transcript needs every one of them: a
    // fold that is missing one says the wrong number.
    if (cutoff === undefined) return { running, tools: [], turns: [] };
    return {
      running,
      tools: tools.filter((entry) => entry.at >= cutoff),
      turns: ended.filter((entry) => entry.at >= cutoff),
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
    ...(row.instructions === null ? {} : { instructions: row.instructions }),
    ...(row.hue === null ? {} : { hue: row.hue }),
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
    ...(row.executablePath === null ? {} : { executablePath: row.executablePath }),
    ...optionsOf(row.runtimeOptions),
    ...(row.trust === null ? {} : { trust: trustLevelOf(row.trust) }),
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
