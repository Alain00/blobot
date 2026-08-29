import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Agent, Message, Team } from '../orchestrator/domain.js';
import type { MessageStore } from '../orchestrator/message-store.js';
import type { BlobotDatabase } from './database.js';
import { agents, messages, sessions, teams } from './schema.js';

/**
 * Runtime config, as ticket 13 stores it: typed columns and nothing else. There is no JSON
 * config blob, which is where a token ends up six weeks from now. `runtimeId` is read by the
 * store and by whatever constructs a runtime — never by the UI.
 */
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
      turnBudget: team.turnBudget,
      createdAt: team.createdAt,
    }).run();
    return team;
  }

  createAgent(agent: AgentRecord): AgentRecord {
    this.#db.insert(agents).values({
      id: agent.id,
      teamId: agent.teamId,
      name: agent.name,
      role: agent.role,
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
    ...(row.executablePath === null ? {} : { executablePath: row.executablePath }),
    ...(row.model === null ? {} : { model: row.model }),
    ...(row.branch === null ? {} : { branch: row.branch }),
    ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
  };
}
