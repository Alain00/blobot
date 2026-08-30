import type { RuntimeOptionChoices, RuntimeOptionGroup } from '../../runtime.js';
import type { ConfigOption, JsonRpcRequester } from './wire.js';

/**
 * `configOptions`, the block both runtimes volunteer on `session/new`, in blobot's shape.
 *
 * Shared for the same reason the session-update translation is: this is the protocol's
 * extension rather than one provider's dialect. What differs is *which* groups each adapter is
 * willing to hand over, which is why `surfaced` is an argument — a group blobot owns itself
 * must never reach the user as a control, and only the adapter knows which those are.
 *
 * Two rules that are the same rule. A choice whose value is literally `default` is dropped,
 * and the choice the session is already set to is marked `isDefault`: blobot stores nothing
 * when the user does not choose, so "default" is the absence of a stored value rather than a
 * value the user can pick. Offering both would give a menu two ways to say the same thing.
 */
export function optionGroupsFrom(
  options: readonly ConfigOption[] | undefined,
  surfaced: readonly string[],
): RuntimeOptionGroup[] {
  const groups: RuntimeOptionGroup[] = [];
  for (const id of surfaced) {
    const option = (options ?? []).find((candidate) => candidate.id === id);
    if (option === undefined) continue;
    const current = option.currentValue;
    const choices = (option.options ?? []).flatMap((choice) => {
      const value = choice.value ?? choice.name;
      if (value === undefined || value === '' || value === 'default') return [];
      return [
        {
          value,
          label: choice.name ?? value,
          ...(value === current ? { isDefault: true } : {}),
        },
      ];
    });
    if (choices.length === 0) continue;
    groups.push({
      id,
      label: option.name ?? id,
      choices,
      ...(current === undefined ? {} : { current }),
    });
  }
  return groups;
}

/**
 * Put the user's choices onto a live session, and never fail a launch over one.
 *
 * `session/set_config_option` is the lever on both runtimes: `_meta.claudeCode.options.model`
 * was measured being **silently ignored** (asked for `sonnet` at `session/new`, session came
 * back `opus[1m]`), so the option that looks like it belongs at session creation does not
 * work there.
 *
 * Order matters and was measured too: `fast=on` was refused while the model was `haiku` and
 * accepted a moment later under `sonnet`. So the model goes first and everything else follows,
 * and a refusal is reported rather than thrown — an agent answering at the wrong effort is a
 * worse day than one that does not start, but only barely, and the user can see the line.
 *
 * A choice the session never advertised is skipped without asking. It is what a stored option
 * becomes when the provider drops a model, and a JSON-RPC error for a value we could have
 * checked ourselves is noise.
 */
export async function applyOptionChoices(
  connection: JsonRpcRequester,
  sessionId: string,
  chosen: RuntimeOptionChoices,
  groups: readonly RuntimeOptionGroup[],
  onWarn: (line: string) => void,
): Promise<RuntimeOptionGroup[]> {
  let applied = [...groups];
  const ids = Object.keys(chosen).sort((a, b) => Number(b === 'model') - Number(a === 'model'));
  for (const id of ids) {
    const value = chosen[id];
    const group = groups.find((candidate) => candidate.id === id);
    if (value === undefined || value === '') continue;
    if (group === undefined) {
      onWarn(`blobot: this session does not offer ${id}, so ${id}=${value} was not applied`);
      continue;
    }
    if (!group.choices.some((choice) => choice.value === value)) {
      onWarn(`blobot: ${id}=${value} is not offered by this session, so it was not applied`);
      continue;
    }
    // Already there: the runtime's own default happens to be what the user picked.
    if (group.current === value) continue;
    try {
      const result = await connection.request<{ configOptions?: readonly ConfigOption[] }>(
        'session/set_config_option',
        { sessionId, configId: id, value },
      );
      // The reply carries the whole refreshed block, which is how a choice that moved another
      // group's current value (a model that has no fast mode) stays honest without a re-read.
      const refreshed = optionGroupsFrom(result?.configOptions, applied.map((entry) => entry.id));
      if (refreshed.length > 0) applied = refreshed;
      else {
        applied = applied.map((entry) => (entry.id === id ? { ...entry, current: value } : entry));
      }
    } catch (error) {
      onWarn(
        `blobot: ${id}=${value} was refused (${error instanceof Error ? error.message : String(error)}); ` +
          'the session keeps what it had',
      );
    }
  }
  return applied;
}
