import type { HandbookEntry, SqliteStore } from '@blobot/core';
import type { UiHandbookEntry, UiHandbookWrite } from '../shared/api.js';

/**
 * Handbook writes as the transcript draws them.
 *
 * The shape of `routine-rows.ts` and for the same reason, with one difference that is the whole
 * of ticket 07's *both the rows and the events*: a Routine **is** its own record, so those rows
 * are read directly, and a Handbook write is not. One call wrote several entries together, and
 * a call that was refused for a full Handbook wrote none at all, so what happened lives in the
 * event and what it says lives in the rows.
 */
export function asUiHandbookEntry(entry: HandbookEntry): UiHandbookEntry {
  return {
    id: entry.id,
    ordinal: entry.ordinal,
    text: entry.text,
    source: entry.source,
    at: entry.createdAt,
    // Live rather than remembered, like the Routine block's `armed`: a block whose control still
    // said `remove` beside something already gone would be two surfaces disagreeing about a row.
    removed: entry.removedAt !== undefined,
  };
}

/**
 * Bounded by `since`, which is the oldest moment the transcript window reaches, so a briefing
 * from last month does not reappear at the top of a pane showing this afternoon.
 */
export function handbookWrites(
  store: SqliteStore,
  teamId: string,
  since: number,
): UiHandbookWrite[] {
  return store.handbookWritesOfTeam(teamId, since).map((write) => ({
    id: write.id,
    agentId: write.agentId,
    at: write.at,
    kind: write.kind,
    entries: write.entries.map(asUiHandbookEntry),
    withdrew: write.withdrew.map(asUiHandbookEntry),
  }));
}

/**
 * Every member's Handbook, keyed by agent id, for the snapshot.
 *
 * Keyed on `(team, agent name)` in the store and by **agent id** here, because a Handbook
 * outlives the row and the screen is drawn against the roster in front of it. That mapping is
 * safe only because ADR-0002 forbids renaming an agent.
 */
export function handbooksOf(
  store: SqliteStore,
  teamId: string,
  roster: readonly { readonly id: string; readonly name: string }[],
): Record<string, readonly UiHandbookEntry[]> {
  return Object.fromEntries(
    roster.map((member) => [
      member.id,
      store.handbookOf(teamId, member.name).map(asUiHandbookEntry),
    ]),
  );
}
