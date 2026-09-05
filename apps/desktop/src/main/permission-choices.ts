import type { PendingPermission } from '@blobot/core';

/**
 * The answers blobot offers from the runtime's advertised options. A reusable approval can
 * last for a session or save a rule: the kind alone does not say which. Keep the selected
 * option's own words with its id so the disclosure describes the answer actually sent.
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
  /** Absent when the runtime offers no reusable approval. */
  readonly allowAlwaysOptionId?: string;
  readonly allowAlways?: { readonly name: string; readonly description?: string };
  readonly rejectOptionId?: string;
}

export function choicesOf(pending: PendingPermission): PermissionChoices {
  const of = (kind: string): string | undefined =>
    pending.options.find((option) => option.kind === kind)?.optionId;
  const allow = of('allow_once');
  const allowAlways = pending.options.find((option) => option.kind === 'allow_always');
  // `reject_always` is a fallback rather than an offer: rejecting once is what the button says,
  // and a runtime that only knows how to refuse forever still has to be able to refuse.
  const reject = of('reject_once') ?? of('reject_always');
  return {
    ...(allow === undefined ? {} : { allowOptionId: allow }),
    ...(allowAlways === undefined
      ? {}
      : {
          allowAlwaysOptionId: allowAlways.optionId,
          allowAlways: {
            name: allowAlways.name,
            ...(allowAlways.description === undefined ? {} : { description: allowAlways.description }),
          },
        }),
    ...(reject === undefined ? {} : { rejectOptionId: reject }),
  };
}
