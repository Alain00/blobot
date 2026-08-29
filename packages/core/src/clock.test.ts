import { describe, expect, it } from 'vitest';
import { VirtualClock } from './clock.js';

describe('VirtualClock', () => {
  it('only moves when a test moves it', async () => {
    const clock = new VirtualClock(1_000);
    let woke = false;
    void clock.sleep(500).then(() => {
      woke = true;
    });

    await clock.advance(499);
    expect(woke).toBe(false);
    expect(clock.now()).toBe(1_499);

    await clock.advance(1);
    expect(woke).toBe(true);
    expect(clock.now()).toBe(1_500);
  });

  it('runs a ninety-second wait in no wall time', async () => {
    const clock = new VirtualClock();
    const done = clock.sleep(90_000);
    await clock.runAll();
    await done;
    expect(clock.now()).toBe(90_000);
  });

  it('resolves a sleep early when its signal aborts, without rejecting', async () => {
    const clock = new VirtualClock();
    const controller = new AbortController();
    const sleeping = clock.sleep(10_000, controller.signal);

    controller.abort();
    await expect(sleeping).resolves.toBeUndefined();
    expect(clock.pendingTimers).toBe(0);
  });

  it('fires timers registered by a resumed continuation', async () => {
    const clock = new VirtualClock();
    const order: number[] = [];
    void (async () => {
      await clock.sleep(10);
      order.push(1);
      await clock.sleep(10);
      order.push(2);
    })();

    await clock.runAll();
    expect(order).toEqual([1, 2]);
    expect(clock.now()).toBe(20);
  });
});
