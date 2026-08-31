import { ceilingFromTable } from '../../context-ceiling.js';

/**
 * Cursor's table, empty until a model is measured through this adapter.
 *
 * Cursor fronts whichever model the account has, so the advertised string names somebody
 * else's window. Nobody has established a degradation point here, so every model takes the
 * fallback and says `measured: false`. The file exists so a measurement has an obvious place
 * to land, and so the shape of the answer matches the other three runtimes.
 */
export const CURSOR_CEILINGS: Readonly<Record<string, number>> = {};

export function cursorCeiling(model: string | undefined): number | undefined {
  return ceilingFromTable(CURSOR_CEILINGS, model);
}
