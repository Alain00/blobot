import { describe, expect, it } from 'vitest';
import { MockTranscriber, VirtualClock, speechScenarios, type TranscriberEvent } from '@blobot/core';
import { DictationHost } from './dictation.js';

function host(clock: VirtualClock) {
  const sent: [string, ...unknown[]][] = [];
  const made: MockTranscriber[] = [];
  const hints: string[] = [];
  const dictation = new DictationHost({
    send: (channel, ...args) => sent.push([channel, ...args]),
    transcriberFor: () => {
      const mock = new MockTranscriber({ scenario: speechScenarios.dies, clock });
      made.push(mock);
      return mock;
    },
    hintFor: (teamId) => {
      hints.push(teamId);
      return { terms: ['Alice'] };
    },
  });
  return { dictation, sent, made, hints };
}

describe('the recording in main', () => {
  it('starts on a team, forwards events with that team id, and composes the hint for it', async () => {
    const clock = new VirtualClock();
    const { dictation, sent, hints } = host(clock);
    const started = await dictation.start('team_1');
    expect(started).toEqual({ ok: true, partials: true, takes: 'segments' });
    expect(hints).toEqual(['team_1']);
    await clock.advance(1_000);
    expect(sent).toEqual([['dictation:event', 'team_1', { type: 'committed', text: 'Alice, el session/new del adapter' }]]);
    expect(dictation.feed(new Uint8Array(3_200))).toBe('taken');
    await dictation.stop();
    await clock.advance(0);
    const last = sent.at(-1)?.[2] as TranscriberEvent;
    expect(last).toEqual({ type: 'ended', reason: 'user' });
    expect(dictation.listening).toBe(false);
  });

  it('drops audio with nothing listening, and frees itself when the engine dies', async () => {
    const clock = new VirtualClock();
    const { dictation, sent } = host(clock);
    expect(dictation.feed(new Uint8Array(3_200))).toBe('dropped');
    await dictation.start('team_1');
    await clock.advance(3_000);
    expect(sent.at(-1)?.[2]).toEqual({ type: 'failed', cause: 'engine_exited' });
    await clock.advance(0);
    expect(dictation.listening).toBe(false);
    expect(dictation.feed(new Uint8Array(3_200))).toBe('dropped');
  });

  it('stops the previous recording when a second one starts', async () => {
    const clock = new VirtualClock();
    const { dictation, made, sent } = host(clock);
    await dictation.start('team_1');
    await dictation.start('team_2');
    await clock.advance(0);
    expect(made).toHaveLength(2);
    expect(sent.some(([, teamId, event]) => teamId === 'team_1' && (event as TranscriberEvent).type === 'ended')).toBe(true);
    expect(dictation.listening).toBe(true);
  });

  it('refuses when nothing is configured, and says why', async () => {
    const dictation = new DictationHost({
      send: () => undefined,
      transcriberFor: () => ({ error: 'nothing chosen' }),
      hintFor: () => ({ terms: [] }),
    });
    expect(await dictation.start('team_1')).toEqual({ ok: false, error: 'nothing chosen' });
  });
});
