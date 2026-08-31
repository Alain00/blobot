import type { UiRuntimeChoice } from '../../../shared/api.js';

/**
 * The four states, in words, and the one place they are written.
 *
 * Ticket 11's rule is in the vocabulary rather than in the code that reads it: none of these is
 * the word *authenticated*. Every probe answers "is a credential present", so a positive is not
 * proof the runtime works, and a word that claimed otherwise would be blobot vouching for
 * somebody else's login. Shared by the hire dialog's picker and the settings screen, because two
 * spellings of `needs_sign_in` would be two different claims about the same machine.
 */
export const READINESS_WORD: Record<UiRuntimeChoice['readiness'], string> = {
  ready: 'ready',
  needs_sign_in: 'needs sign-in',
  not_installed: 'not installed',
  unknown: 'status unknown',
};
