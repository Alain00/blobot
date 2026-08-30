import type { Attachment, AttachmentContent, Message } from './domain.js';

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

/**
 * Where an Attachment's bytes live.
 *
 * Apart from `MessageStore` because the lifetimes differ: a message belongs to one recipient,
 * and one attachment belongs to every message of a fan-out. `put` is called once for the file
 * the user picked up; `commit` then carries the metadata on each row it writes.
 */
export interface AttachmentStore {
  /** Store the bytes once. Returns the record without them, which is what a Message carries. */
  putAttachment(content: AttachmentContent): Attachment;
  /** The content, for a prompt about to be built. Undefined for an id nothing wrote. */
  attachment(id: string): AttachmentContent | undefined;
}

/** The store the demo and the tests run on until ticket 13's SQLite lands behind this interface. */
export class InMemoryMessageStore implements MessageStore, AttachmentStore {
  #messages: Message[] = [];
  #attachments = new Map<string, AttachmentContent>();
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

  putAttachment(content: AttachmentContent): Attachment {
    this.#attachments.set(content.id, content);
    const { data: _data, at: _at, ...record } = content;
    return record;
  }

  attachment(id: string): AttachmentContent | undefined {
    return this.#attachments.get(id);
  }
}
