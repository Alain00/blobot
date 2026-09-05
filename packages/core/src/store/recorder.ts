import { desc, eq } from 'drizzle-orm';
import type { AgentEvent } from '../events.js';
import { uuidv7, type IdFactory } from '../ids.js';
import type { BlobotDatabase } from './database.js';
import { agentMessages, events, sessions, toolCalls, turns } from './schema.js';

/**
 * What the orchestrator tells the transcript. Kept as an interface so the orchestrator has no
 * idea SQLite exists, and so a test can record into an array.
 */
export interface TurnRecorder {
  turnStarted(agentId: string, at: number, triggerMessageId?: string): void;
  record(event: AgentEvent): void;
}

interface OpenTurn {
  readonly turnId: string;
  /** Thinking has no completed event, so it is folded here — otherwise it vanishes entirely. */
  readonly thoughts: Map<string, string>;
}

/**
 * Persists the **durable subset** of the eleven-member vocabulary: completed messages, tool calls
 * with terminal state, turn outcomes, errors and usage snapshots. Deltas are the wire format —
 * a row per delta would mean three rows in one observed millisecond.
 */
export class SqliteRecorder implements TurnRecorder {
  readonly #db: BlobotDatabase;
  readonly #teamId: string;
  readonly #createId: IdFactory;
  readonly #open = new Map<string, OpenTurn>();

  constructor(db: BlobotDatabase, teamId: string, createId: IdFactory = uuidv7) {
    this.#db = db;
    this.#teamId = teamId;
    this.#createId = createId;
  }

  turnStarted(agentId: string, at: number, triggerMessageId?: string): void {
    const session = this.#db
      .select()
      .from(sessions)
      .where(eq(sessions.agentId, agentId))
      .orderBy(desc(sessions.startedAt))
      .get();
    if (session === undefined) {
      throw new Error(`no session for agent ${agentId}: start one before recording a turn`);
    }
    const turnId = this.#createId(at);
    this.#db.insert(turns).values({
      id: turnId,
      agentId,
      sessionId: session.id,
      triggerMessageId: triggerMessageId ?? null,
      startedAt: at,
      endedAt: null,
      stopReason: null,
    }).run();
    this.#open.set(agentId, { turnId, thoughts: new Map() });
  }

  record(event: AgentEvent): void {
    const open = this.#open.get(event.agentId);

    switch (event.type) {
      case 'agent_message_completed': {
        if (open === undefined) return;
        this.#db.insert(agentMessages).values({
          id: this.#createId(event.at),
          turnId: open.turnId,
          agentId: event.agentId,
          kind: 'answer',
          text: event.text,
          providerMessageId: event.messageId,
          at: event.at,
        }).run();
        return;
      }
      case 'agent_thought_delta': {
        if (open === undefined) return;
        open.thoughts.set(
          event.messageId,
          (open.thoughts.get(event.messageId) ?? '') + event.text,
        );
        return;
      }
      case 'tool_call_started': {
        if (open === undefined) return;
        this.#db.insert(toolCalls).values({
          id: this.#createId(event.at),
          turnId: open.turnId,
          agentId: event.agentId,
          providerToolCallId: event.toolCallId,
          name: event.title,
          kind: event.kind,
          arguments: event.rawInput === undefined ? null : JSON.stringify(event.rawInput),
          status: 'pending',
          startedAt: event.at,
        }).run();
        return;
      }
      case 'tool_call_updated': {
        if (open === undefined) return;
        const terminal = event.status === 'completed' || event.status === 'failed';
        this.#db
          .update(toolCalls)
          .set({
            status: event.status,
            // The name a call is announced under is provisional: the runtime names it before
            // the arguments have finished streaming, so bash arrives as `Terminal` and the
            // command lands on a later update. Persisting only the first one means a restored
            // activity column says something the live one never said.
            ...(event.title === undefined ? {} : { name: event.title }),
            // Both halves, always together: the code, and the fact that one was reported.
            // `exit_code` alone cannot separate a cancelled call's explicit null from a call
            // that never had an exit code, and the transcript needs that separation.
            ...(event.exit === undefined ? {} : { exitCode: event.exit, exitReported: true }),
            ...(event.changed === undefined
              ? {}
              : { linesAdded: event.changed.added, linesRemoved: event.changed.removed }),
            ...(event.error === undefined ? {} : { failureReason: event.error }),
            ...(event.output === undefined ? {} : { output: event.output }),
            ...(terminal ? { endedAt: event.at } : {}),
          })
          .where(eq(toolCalls.providerToolCallId, event.toolCallId))
          .run();
        return;
      }
      case 'turn_ended': {
        if (open === undefined) return;
        this.#flushThoughts(event.agentId, open, event.at);
        this.#db
          .update(turns)
          .set({ endedAt: event.at, stopReason: event.stopReason })
          .where(eq(turns.id, open.turnId))
          .run();
        this.#open.delete(event.agentId);
        return;
      }
      case 'error': {
        if (open !== undefined) {
          this.#flushThoughts(event.agentId, open, event.at);
          // No stop reason: the RPC never replied, and pretending otherwise would invent one.
          this.#db
            .update(turns)
            .set({ endedAt: event.at })
            .where(eq(turns.id, open.turnId))
            .run();
          this.#open.delete(event.agentId);
        }
        this.#appendEvent(event);
        return;
      }
      case 'usage_updated': {
        this.#appendEvent(event);
        return;
      }
      // Durable for ticket 06's reason: it is drawn in the *transcript*, and a live-only line
      // means a team switched away from and back to loses the record that its agent is on a
      // different session than the one it was answering with an hour ago.
      case 'context_compacted': {
        this.#appendEvent(event);
        return;
      }
      /**
       * Durable, and the bytes are already elsewhere.
       *
       * The row in `pictures` is written before this event exists, so what is appended here is
       * the *news* -- an id, or the reason there is nothing to fetch. A Picture that could not be
       * kept has no row anywhere else, and this is the only record that it happened at all, which
       * is the whole of `.scratch/agent-media/10`: an absence is not an acceptable failure mode.
       */
      case 'picture_arrived': {
        this.#appendEvent(event);
        return;
      }
      // `agent_message_sent` is transport, not record: the `messages` row IS the record, so
      // writing it here would store the same fact twice and let the two disagree.
      case 'agent_message_sent':
      case 'agent_message_delta':
        return;
    }
  }

  #flushThoughts(agentId: string, open: OpenTurn, at: number): void {
    for (const [providerMessageId, text] of open.thoughts) {
      this.#db.insert(agentMessages).values({
        id: this.#createId(at),
        turnId: open.turnId,
        agentId,
        kind: 'thought',
        text,
        // Not unique on its own: thinking and answer share one provider message id, so the
        // key is (provider_message_id, kind).
        providerMessageId,
        at,
      }).run();
    }
    open.thoughts.clear();
  }

  #appendEvent(event: AgentEvent): void {
    this.#db.insert(events).values({
      id: this.#createId(event.at),
      teamId: this.#teamId,
      agentId: event.agentId,
      kind: event.type,
      payload: JSON.stringify(event),
      at: event.at,
    }).run();
  }
}
