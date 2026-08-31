import { ceilingFromTable } from '../../context-ceiling.js';

/**
 * Where Claude's models stop being worth more context, by the model string the bridge
 * advertises and blobot stores on the agent.
 *
 * **Every entry carries its source.** A table like this ages silently — a model alias points at
 * a new model and the number under it becomes a claim nobody made — so an entry without a dated
 * provenance is worse than no entry, because the fallback at least announces that it is a
 * guess. Whoever changes a line here replaces its source line too.
 *
 * It is deliberately almost empty. The fallback in `context-ceiling.ts` is the common path.
 */
export const CLAUDE_CEILINGS: Readonly<Record<string, number>> = {
  /**
   * Opus 5. Advertises a 1,000,000 window and reports one — ticket 05 observed
   * `{used: 36785, size: 1000000}` off a real session.
   *
   * Source: reported by the author, 2026-08-30, as the point where answers start degrading.
   * **Not measured against a transcript**, which is weaker than the rest of this repo's
   * observations and is why it says so here. It is still far better than the fallback: 60% of a
   * million is 600,000, and nobody thinks that window is usable to there.
   *
   * The alias is what ages. If `opus` comes to mean a model with different behaviour, this line
   * is wrong and nothing will announce it.
   */
  opus: 300_000,
};

/** Claude's answer to blobot's question. The renderer never learns this file exists. */
export function claudeCeiling(model: string | undefined): number | undefined {
  return ceilingFromTable(CLAUDE_CEILINGS, model);
}
