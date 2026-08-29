import type { Message } from './domain.js';

/**
 * The mailbox is a predicate, not a table: undelivered mail is `deliveredAt === undefined`.
 *
 * `commit` must be durable before the ack returns — the failure it prevents is the worst
 * kind, where Alice believes with certainty that she told Bob something, Bob never heard it,
 * and neither can detect the gap.
 */
export interface MessageStore {
  /** Idempotent on `idempotencyKey`: a retry returns the row already committed. */
  commit(message: Message): Message;
  undelivered(agentId: string): Message[];
  markDelivered(ids: readonly string[], at: number): void;
  byId(id: string): Message | undefined;
  /** Everything addressed to or sent by an agent, oldest first. */
  forAgent(agentId: string): Message[];
}

/** The store the demo and the tests run on until ticket 13's SQLite lands behind this interface. */
export class InMemoryMessageStore implements MessageStore {
  #messages: Message[] = [];
  #byKey = new Map<string, Message>();

  commit(message: Message): Message {
    if (message.idempotencyKey !== undefined) {
      const existing = this.#byKey.get(message.idempotencyKey);
      if (existing !== undefined) return existing;
      this.#byKey.set(message.idempotencyKey, message);
    }
    this.#messages.push(message);
    return message;
  }

  undelivered(agentId: string): Message[] {
    return this.#messages.filter(
      (message) => message.toAgentId === agentId && message.deliveredAt === undefined,
    );
  }

  markDelivered(ids: readonly string[], at: number): void {
    const wanted = new Set(ids);
    this.#messages = this.#messages.map((message) =>
      wanted.has(message.id) ? { ...message, deliveredAt: at } : message,
    );
    for (const [key, message] of this.#byKey) {
      if (wanted.has(message.id)) this.#byKey.set(key, { ...message, deliveredAt: at });
    }
  }

  byId(id: string): Message | undefined {
    return this.#messages.find((message) => message.id === id);
  }

  forAgent(agentId: string): Message[] {
    return this.#messages.filter(
      (message) => message.toAgentId === agentId || message.fromAgentId === agentId,
    );
  }
}
