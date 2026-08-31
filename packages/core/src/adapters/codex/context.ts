import { ceilingFromTable } from '../../context-ceiling.js';

/**
 * Codex's table, empty for the same reason OpenCode's is: nobody has measured one.
 *
 * The adapter does not advertise a model group at all today (`session/new` offers Codex no
 * `model` option blobot passes through), so the lookup is handed `undefined` and takes the
 * fallback every time. That is the correct behaviour and not a gap to paper over: a ceiling
 * invented for a model blobot cannot even name would be a number with nothing behind it.
 */
export const CODEX_CEILINGS: Readonly<Record<string, number>> = {};

export function codexCeiling(model: string | undefined): number | undefined {
  return ceilingFromTable(CODEX_CEILINGS, model);
}
