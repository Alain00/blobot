import type { Agent } from './domain.js';

/**
 * Resolve a free-form name to a teammate.
 *
 * Ticket 12 makes `@mention` the human's addressing gesture and ticket 05 makes
 * `message_agent(agent)` the agent's. They are the same rule on two surfaces, so they share
 * this function: the composer's unresolved-mention state is the human-facing twin of the
 * orchestrator's "no such teammate" error.
 */
export function findAgentByName(roster: readonly Agent[], name: string): Agent | undefined {
  const wanted = name.trim().toLowerCase();
  return roster.find(
    (candidate) => candidate.name.toLowerCase() === wanted || candidate.id === name.trim(),
  );
}
