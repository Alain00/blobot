import { ceilingFromTable } from '../../context-ceiling.js';

/**
 * OpenCode's table, which is empty, and that is the honest state rather than an oversight.
 *
 * OpenCode is a front end onto whichever model the user has configured, so the string it
 * advertises names somebody else's model and the window it reports varies with it — ticket 05
 * observed `{used: 49300, size: 200000}`. Nobody has established a degradation point for any of
 * them here, so every one of them takes the fallback and says `measured: false`.
 *
 * The file exists so that measuring one has an obvious place to land, and so that the shape of
 * the answer is the same on all three runtimes.
 */
export const OPENCODE_CEILINGS: Readonly<Record<string, number>> = {};

export function opencodeCeiling(model: string | undefined): number | undefined {
  return ceilingFromTable(OPENCODE_CEILINGS, model);
}
