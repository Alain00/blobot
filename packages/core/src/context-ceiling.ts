/**
 * How much of an agent's context window is actually worth using, as blobot reckons it.
 *
 * The runtimes report a window and blobot draws it (`usage_updated`, "the context gauge"), and
 * that number answers exactly one question honestly: **when does the turn hard-stop**. It is
 * the wrong denominator for the question a user actually feels, which is *when does this agent
 * start getting worse* — and it is the wrong denominator for a threshold. Claude on Opus 5
 * reports a window of 1,000,000, so an agent 300,000 tokens in draws 3% and reads as barely
 * started; a single fraction of the advertised size fires at 750k there and at 150k on a 200k
 * OpenCode model, and only one of those is a threshold worth having.
 *
 * So blobot names the concept and each adapter translates from its own end, exactly as
 * `trust.ts` does with three words the runtimes express differently. The figures themselves are
 * provider knowledge and live in the adapters; nothing here knows a model name.
 *
 * **This ceiling is an observation, never a policy.** blobot does not compact, does not
 * truncate, and does not advise from the gauge. See `.scratch/transcript-scale/issues/09`.
 */
export interface WorkingCeiling {
  /** Where the usable part of the window ends, in the same tokens the runtime reports. */
  readonly tokens: number;
  /**
   * Whether a person established this for this model, or it is the fallback below.
   *
   * Carried rather than inferred from the number, because the two can coincide and a reader of
   * this value is usually asking how much to trust it.
   */
  readonly measured: boolean;
}

/**
 * What blobot assumes about a model nobody has looked at.
 *
 * A hardcoded table of per-model degradation points ages on every release, which is the hazard
 * ADR-0003 fought when it refused to build the command palette from a vendor's release cadence.
 * The table is therefore small on purpose and this is the common path, not the exception.
 *
 * A judgement rather than a measurement, and it is written here as one. The remedy for a model
 * that deserves better is to measure it and give it an entry.
 */
export const UNMEASURED_FRACTION = 0.6;

/**
 * And a ceiling on the fallback itself, which is the part that is easy to get wrong.
 *
 * A fraction alone fails *open* exactly where it matters most. The models that advertise far
 * more than 200k are precisely the ones where the advertised and the usable diverge hardest —
 * 60% of a million is 600,000, which is twice the point the one model anybody has looked at was
 * reported to degrade at. An unmeasured window must not scale with its own advertisement.
 */
export const UNMEASURED_CAP = 200_000;

/**
 * The ceiling for a model with no entry: conservative, and never larger than the window.
 */
export function unmeasuredCeiling(size: number): WorkingCeiling {
  return { tokens: Math.min(Math.round(size * UNMEASURED_FRACTION), UNMEASURED_CAP, size), measured: false };
}

/**
 * The ceiling for a model an adapter has an entry for, clamped to the window that was reported.
 *
 * The clamp is not defensive tidiness. A model alias points at different windows in different
 * places — the same `opus` runs at 200k and at 1M — so an entry taken from one of them would
 * otherwise draw a mark past the end of the other's gauge, which is a claim that the agent has
 * room it does not have.
 */
export function measuredCeiling(tokens: number, size: number): WorkingCeiling {
  return { tokens: Math.min(tokens, size), measured: true };
}

/**
 * Look a model up in an adapter's table, falling back rather than failing.
 *
 * The lookup is exact on the string the runtime advertises and blobot stored. No prefix
 * matching and no normalising: a guess that `opus-5-turbo-max` is near enough to `opus` is how
 * a table starts making claims nobody checked, and the fallback is already the safe answer.
 */
export function ceilingFromTable(
  table: Readonly<Record<string, number>>,
  model: string | undefined,
): number | undefined {
  return model === undefined ? undefined : table[model];
}

/**
 * The ceiling for one agent: its model's entry if an adapter had one, the fallback if not.
 *
 * Split this way so that the *lookup* stays in the adapters and the *arithmetic* can be done
 * wherever the numbers are. Main resolves the entry once, from the agent's runtime and model,
 * and hands it on as a plain token count; the renderer applies it against whatever window the
 * runtime went on to report. Neither half of that can tell which provider is involved.
 */
export function workingCeiling(entry: number | undefined, size: number): WorkingCeiling {
  if (size <= 0) return { tokens: 0, measured: false };
  return entry === undefined ? unmeasuredCeiling(size) : measuredCeiling(entry, size);
}
