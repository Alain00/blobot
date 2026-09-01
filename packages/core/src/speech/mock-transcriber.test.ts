import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../clock.js';
import { withRecordingCeiling } from './ceiling.js';
import type { TranscriberEvent } from './domain.js';
import { MockTranscriber, speechScenarios } from './mock-transcriber.js';

function collect(events: AsyncIterable<TranscriberEvent>): TranscriberEvent[] {
  const seen: TranscriberEvent[] = [];
  void (async () => {
    for await (const event of events) seen.push(event);
  })();
  return seen;
}

describe('the mock Transcriber', () => {
  it('plays a scenario on the clock and ends when stopped', async () => {
    const clock = new VirtualClock();
    const mock = new MockTranscriber({ scenario: speechScenarios.rewrites, clock });
    const seen = collect(mock.events);
    await mock.start({ terms: [] });
    await clock.advance(2_700);
    expect(seen.map((event) => event.type)).toEqual(['partial', 'partial', 'partial', 'committed']);
    // A partial that got shorter, which is the case the ghost has to survive.
    expect(seen[2]).toEqual({ type: 'partial', text: 'hola @alice revisa el session/new' });
    await mock.stop();
    await clock.advance(0);
    expect(seen.at(-1)).toEqual({ type: 'ended', reason: 'user' });
    // Stopped is stopped: nothing after it, however far the clock goes.
    await clock.advance(10_000);
    expect(seen.filter((event) => event.type === 'committed')).toHaveLength(1);
  });

  it('dies with a partial on screen and says so once', async () => {
    const clock = new VirtualClock();
    const mock = new MockTranscriber({ scenario: speechScenarios.dies, clock });
    const seen = collect(mock.events);
    await mock.start({ terms: [] });
    await clock.advance(3_000);
    expect(seen.at(-1)).toEqual({ type: 'failed', cause: 'engine_exited' });
    expect(mock.feed(new Uint8Array(3_200))).toBe('dropped');
    await mock.stop();
    await clock.advance(0);
    expect(seen.filter((event) => event.type === 'ended')).toHaveLength(0);
  });

  it('counts what it is fed, so a test can prove the microphone was open', async () => {
    const mock = new MockTranscriber({ clock: new VirtualClock() });
    await mock.start({ terms: [] });
    expect(mock.feed(new Uint8Array(3_200))).toBe('taken');
    mock.mark();
    expect(mock.fedBytes).toBe(3_200);
    expect(mock.marks).toBe(1);
  });
});

describe('the recording ceiling', () => {
  it('stops the recording itself at the limit and says ceiling rather than user', async () => {
    const clock = new VirtualClock();
    const inner = new MockTranscriber({ scenario: speechScenarios.stalls, clock });
    const bounded = withRecordingCeiling(inner, 1_000);
    const seen = collect(bounded.events);
    await bounded.start({ terms: [] });
    // Ten chunks of 100 ms: exactly the limit.
    for (let i = 0; i < 9; i += 1) expect(bounded.feed(new Uint8Array(3_200))).toBe('taken');
    expect(seen).toEqual([]);
    bounded.feed(new Uint8Array(3_200));
    await clock.advance(0);
    expect(seen.at(-1)).toEqual({ type: 'ended', reason: 'ceiling' });
    expect(bounded.feed(new Uint8Array(3_200))).toBe('dropped');
  });

  it('passes the user’s own stop through unchanged', async () => {
    const clock = new VirtualClock();
    const bounded = withRecordingCeiling(new MockTranscriber({ clock }), 60_000);
    const seen = collect(bounded.events);
    await bounded.start({ terms: [] });
    bounded.feed(new Uint8Array(3_200));
    await bounded.stop();
    await clock.advance(0);
    expect(seen.at(-1)).toEqual({ type: 'ended', reason: 'user' });
  });
});
