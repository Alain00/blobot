import type { PendingPermission } from '@blobot/core';

/**
 * The answers blobot offers, out of the three every runtime provides.
 *
 * Ticket 14 shipped two, **Allow once and Reject**, on the reasoning that `allow_always` is a
 * rule the user authors with nowhere to see or revoke it. Its 2026-08-29 amendment reopens
 * that: a run against a real `claude` shows where the rule goes. Answering `allow_always`
 * writes `permissions.allow` into `<workspace>/.claude/settings.local.json` — a file, in this
 * agent's own copy of the folder, that the user can read and delete. It is per agent, because
 * each agent has its own workspace, so allowing something for Alice says nothing about Bob.
 *
 * `reject_always` stays unoffered. Refusing forever is the same standing rule pointed the
 * other way, and nobody has asked for it.
 *
 * Kinds rather than names, because the names are the provider's words: Claude's bridge and
 * OpenCode label the same three options differently, and the UI is provider-agnostic.
 */
export interface PermissionChoices {
  /** Absent on a runtime that offers no single-use approval. The block then cannot allow. */
  readonly allowOptionId?: string;
  /** Absent on a runtime that cannot record a standing rule. The block then offers once only. */
  readonly allowAlwaysOptionId?: string;
  readonly rejectOptionId?: string;
}

export function choicesOf(pending: PendingPermission): PermissionChoices {
  const of = (kind: string): string | undefined =>
    pending.options.find((option) => option.kind === kind)?.optionId;
  const allow = of('allow_once');
  const allowAlways = of('allow_always');
  // `reject_always` is a fallback rather than an offer: rejecting once is what the button says,
  // and a runtime that only knows how to refuse forever still has to be able to refuse.
  const reject = of('reject_once') ?? of('reject_always');
  return {
    ...(allow === undefined ? {} : { allowOptionId: allow }),
    ...(allowAlways === undefined ? {} : { allowAlwaysOptionId: allowAlways }),
    ...(reject === undefined ? {} : { rejectOptionId: reject }),
  };
}
