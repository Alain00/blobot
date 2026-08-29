/**
 * Time is injected. Timing *is* the behaviour under test for a streaming UI — "does status
 * settle correctly when a tool completes 5ms after a delta" is only testable if time is
 * controllable. Real in demo mode, virtual and fast-forwarded in tests.
 */
export interface Clock {
  now(): number;
  /**
   * Resolves after `ms`, or early if `signal` aborts. It never rejects: callers check
   * `signal.aborted` themselves, so a cancelled turn can still emit its terminal events.
   */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0 || signal?.aborted === true) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

interface PendingTimer {
  readonly at: number;
  readonly resolve: () => void;
  readonly detach: () => void;
}

/**
 * A clock whose time only moves when a test moves it. Sleeps register timers; `advance` and
 * `runAll` fire them in order, draining the microtask queue between each so continuations
 * can register the next one.
 */
export class VirtualClock implements Clock {
  #now: number;
  #timers: PendingTimer[] = [];

  constructor(startAt = 0) {
    this.#now = startAt;
  }

  now(): number {
    return this.#now;
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0 || signal?.aborted === true) return Promise.resolve();
    return new Promise((resolve) => {
      const timer: PendingTimer = {
        at: this.#now + ms,
        resolve,
        detach: () => {
          signal?.removeEventListener('abort', onAbort);
        },
      };
      const onAbort = (): void => {
        this.#remove(timer);
        resolve();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.#timers.push(timer);
    });
  }

  /** Fire every timer due within `ms`, moving time forward as each one fires. */
  async advance(ms: number): Promise<void> {
    const target = this.#now + ms;
    for (;;) {
      const next = this.#earliest();
      if (next === undefined || next.at > target) break;
      this.#now = next.at;
      this.#fire(next);
      await drainMicrotasks();
    }
    this.#now = target;
    await drainMicrotasks();
  }

  /** Run until nothing is pending — a whole scenario in no wall-clock time at all. */
  async runAll(maxSteps = 100_000): Promise<void> {
    // A turn that ends can set off another one several awaits later — an orchestrator waking
    // a peer, say — so an empty timer list is only the end once it survives a few drains.
    const idleDrainsBeforeStopping = 8;
    let idleDrains = 0;
    for (let step = 0; step < maxSteps; step += 1) {
      const next = this.#earliest();
      if (next === undefined) {
        await drainMicrotasks();
        idleDrains += 1;
        if (idleDrains >= idleDrainsBeforeStopping && this.#earliest() === undefined) return;
        continue;
      }
      idleDrains = 0;
      this.#now = Math.max(this.#now, next.at);
      this.#fire(next);
      await drainMicrotasks();
    }
    throw new Error(`VirtualClock.runAll exceeded ${maxSteps} steps — a scenario is looping`);
  }

  get pendingTimers(): number {
    return this.#timers.length;
  }

  #earliest(): PendingTimer | undefined {
    let earliest: PendingTimer | undefined;
    for (const timer of this.#timers) {
      if (earliest === undefined || timer.at < earliest.at) earliest = timer;
    }
    return earliest;
  }

  #fire(timer: PendingTimer): void {
    this.#remove(timer);
    timer.resolve();
  }

  #remove(timer: PendingTimer): void {
    const index = this.#timers.indexOf(timer);
    if (index >= 0) this.#timers.splice(index, 1);
    timer.detach();
  }
}

/**
 * Let every already-queued continuation run. `setImmediate` sits after promise jobs and
 * after I/O, so one hop is enough to see whatever the resumed code scheduled next.
 */
function drainMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
