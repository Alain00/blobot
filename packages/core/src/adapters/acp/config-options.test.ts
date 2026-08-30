import { describe, expect, it } from 'vitest';
import { applyOptionChoices, optionGroupsFrom } from './config-options.js';
import type { ConfigOption } from './wire.js';

const ADVERTISED: ConfigOption[] = [
  {
    id: 'mode',
    name: 'Permission Mode',
    currentValue: 'auto',
    options: [{ value: 'auto' }, { value: 'bypassPermissions' }],
  },
  {
    id: 'model',
    name: 'Model',
    currentValue: 'opus[1m]',
    options: [{ value: 'default' }, { value: 'opus[1m]', name: 'Opus 1M' }, { value: 'sonnet' }],
  },
  {
    id: 'effort',
    name: 'Reasoning',
    currentValue: 'medium',
    options: [{ value: 'default' }, { value: 'low' }, { value: 'medium' }, { value: 'high' }],
  },
];

describe('reading the advertised options', () => {
  it('keeps the groups the adapter surfaces, in that order, and drops the rest', () => {
    const groups = optionGroupsFrom(ADVERTISED, ['model', 'effort']);

    expect(groups.map((group) => group.id)).toEqual(['model', 'effort']);
    // `mode` is ticket 14's posture. It is advertised, and it is never a control.
    expect(groups.some((group) => group.id === 'mode')).toBe(false);
  });

  it('marks what the runtime does when blobot says nothing, and offers no `default` row', () => {
    const [model] = optionGroupsFrom(ADVERTISED, ['model']);

    // Storing nothing *is* choosing the default, so a literal `default` choice would be the
    // same answer twice in one menu.
    expect(model?.choices.map((choice) => choice.value)).toEqual(['opus[1m]', 'sonnet']);
    expect(model?.choices.filter((choice) => choice.isDefault)).toEqual([
      { value: 'opus[1m]', label: 'Opus 1M', isDefault: true },
    ]);
    expect(model?.current).toBe('opus[1m]');
  });

  it('says nothing at all about a group with no real choices', () => {
    expect(optionGroupsFrom([{ id: 'model', options: [{ value: 'default' }] }], ['model'])).toEqual([]);
    expect(optionGroupsFrom(undefined, ['model'])).toEqual([]);
  });
});

describe('applying a choice', () => {
  function connection(options: { refuse?: string } = {}) {
    const sent: { configId: string; value: string }[] = [];
    return {
      sent,
      request: async <T,>(method: string, params?: unknown): Promise<T> => {
        expect(method).toBe('session/set_config_option');
        const call = params as { configId: string; value: string };
        sent.push(call);
        if (options.refuse === call.configId) throw new Error('Internal error');
        return {
          configOptions: ADVERTISED.map((option) =>
            option.id === call.configId ? { ...option, currentValue: call.value } : option,
          ),
        } as T;
      },
    };
  }

  it('sets the model first, because another option can depend on it', async () => {
    const rpc = connection();
    await applyOptionChoices(
      rpc,
      'ses_1',
      { effort: 'high', model: 'sonnet' },
      optionGroupsFrom(ADVERTISED, ['model', 'effort']),
      () => undefined,
    );

    // Measured on the bridge: `fast=on` was refused under `haiku` and accepted under `sonnet`.
    expect(rpc.sent.map((call) => call.configId)).toEqual(['model', 'effort']);
  });

  it('reads the refreshed block back, so the current value is never guessed', async () => {
    const groups = await applyOptionChoices(
      connection(),
      'ses_1',
      { effort: 'high' },
      optionGroupsFrom(ADVERTISED, ['model', 'effort']),
      () => undefined,
    );

    expect(groups.find((group) => group.id === 'effort')?.current).toBe('high');
  });

  it('says nothing on the wire when the session is already set to that value', async () => {
    const rpc = connection();
    await applyOptionChoices(
      rpc,
      'ses_1',
      { model: 'opus[1m]' },
      optionGroupsFrom(ADVERTISED, ['model']),
      () => undefined,
    );

    expect(rpc.sent).toEqual([]);
  });

  it('skips a choice this session never offered, and says which', async () => {
    const rpc = connection();
    const warnings: string[] = [];
    await applyOptionChoices(
      rpc,
      'ses_1',
      { model: 'a-model-that-was-retired', effort: 'high', fast: 'on' },
      optionGroupsFrom(ADVERTISED, ['model', 'effort']),
      (line) => warnings.push(line),
    );

    // A provider that drops a model must not turn a stored choice into a failed launch.
    expect(rpc.sent).toEqual([{ sessionId: 'ses_1', configId: 'effort', value: 'high' }]);
    expect(warnings.join('\n')).toMatch(/a-model-that-was-retired is not offered/);
    expect(warnings.join('\n')).toMatch(/does not offer fast/);
  });

  it('keeps going when the runtime refuses one', async () => {
    const warnings: string[] = [];
    const groups = await applyOptionChoices(
      connection({ refuse: 'model' }),
      'ses_1',
      { model: 'sonnet', effort: 'high' },
      optionGroupsFrom(ADVERTISED, ['model', 'effort']),
      (line) => warnings.push(line),
    );

    expect(warnings.join('\n')).toMatch(/model=sonnet was refused/);
    expect(groups.find((group) => group.id === 'model')?.current).toBe('opus[1m]');
    expect(groups.find((group) => group.id === 'effort')?.current).toBe('high');
  });
});
