import { randomUUID } from 'node:crypto';

/**
 * uuidv7: 48 bits of millisecond timestamp, then randomness. Ticket 13 mints ids in core and
 * wants them time-ordered, so a transcript sorts by primary key without a second index.
 */
export function uuidv7(now: number): string {
  const uuid = randomUUID();
  const timestamp = Math.max(0, Math.floor(now)).toString(16).padStart(12, '0').slice(-12);
  // xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx — replace the first 48 bits, force version 7.
  return [
    timestamp.slice(0, 8),
    timestamp.slice(8, 12),
    `7${uuid.slice(15, 18)}`,
    uuid.slice(19, 23),
    uuid.slice(24),
  ].join('-');
}

export type IdFactory = (now: number) => string;
