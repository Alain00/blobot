import type { PendingPermission } from '@blobot/core';

/**
 * The two answers blobot offers, out of the three every runtime provides.
 *
 * Ticket 14: **Allow once and Reject.** `allow_always` persists for the session, which is a
 * rule the user is authoring with nowhere to see or revoke it, and it is the first brick of an
 * approvals system this map is explicitly told not to build.
 *
 * Kinds rather than names, because the names are the provider's words: Claude's bridge and
 * OpenCode label the same three options differently, and the UI is provider-agnostic.
 */
export interface PermissionChoices {
  /** Absent on a runtime that offers no single-use approval. The block then cannot allow. */
  readonly allowOptionId?: string;
  readonly rejectOptionId?: string;
}

export function choicesOf(pending: PendingPermission): PermissionChoices {
  const of = (kind: string): string | undefined =>
    pending.options.find((option) => option.kind === kind)?.optionId;
  const allow = of('allow_once');
  // `reject_always` is a fallback rather than an offer: rejecting once is what the button says,
  // and a runtime that only knows how to refuse forever still has to be able to refuse.
  const reject = of('reject_once') ?? of('reject_always');
  return {
    ...(allow === undefined ? {} : { allowOptionId: allow }),
    ...(reject === undefined ? {} : { rejectOptionId: reject }),
  };
}
