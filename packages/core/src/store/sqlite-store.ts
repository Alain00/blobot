import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Agent, AgentDefinition, AgentProfile, Message, Team } from '../orchestrator/domain.js';
import type { MessageStore } from '../orchestrator/message-store.js';
import type { BlobotDatabase } from './database.js';
import { agentMessages, agentProfiles, agents, messages, sessions, teams } from './schema.js';

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
  readonly model?: string;
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
export class SqliteStore implements MessageStore {
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
        turnBudget: row.turnBudget,
        ...(row.leadAgentId === null ? {} : { leadAgentId: row.leadAgentId }),
        createdAt: row.createdAt,
        ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
      }));
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
      model: profile.model ?? null,
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
    stated: { readonly role: string; readonly instructions?: string; readonly hue?: number },
  ): void {
    this.#db
      .update(agents)
      .set({
        role: stated.role,
        instructions: stated.instructions ?? null,
        hue: stated.hue ?? null,
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
      model: agent.model ?? null,
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
    return message;
  }

  undelivered(agentId: string): Message[] {
    return this.#db
      .select()
      .from(messages)
      .where(and(eq(messages.toAgentId, agentId), isNull(messages.deliveredAt)))
      .orderBy(asc(messages.id))
      .all()
      .map(toMessage);
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
    return row === undefined ? undefined : toMessage(row);
  }

  /** A conversation pane: everything this agent said or was told. */
  forAgent(agentId: string): Message[] {
    return this.#db
      .select()
      .from(messages)
      .where(or(eq(messages.toAgentId, agentId), eq(messages.fromAgentId, agentId)))
      .orderBy(asc(messages.id))
      .all()
      .map(toMessage);
  }

  /**
   * The team stream. A peer message is one row rendered in two panes and once here — a query,
   * not a storage fact.
   */
  forTeam(teamId: string): Message[] {
    return this.#db
      .select()
      .from(messages)
      .where(eq(messages.teamId, teamId))
      .orderBy(asc(messages.id))
      .all()
      .map(toMessage);
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
    ...(row.model === null ? {} : { model: row.model }),
    ...(row.instructions === null ? {} : { instructions: row.instructions }),
    ...(row.hue === null ? {} : { hue: row.hue }),
    ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
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
    ...(row.model === null ? {} : { model: row.model }),
    ...(row.branch === null ? {} : { branch: row.branch }),
    ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
  };
}
