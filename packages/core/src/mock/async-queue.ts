/**
 * A push-driven async iterable. The turn body pushes events in; `sendPrompt`'s consumer
 * pulls them out. The indirection is what lets the dev control panel inject an event by
 * hand into a turn that is already running.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  #buffer: T[] = [];
  #waiting: ((result: IteratorResult<T>) => void)[] = [];
  #closed = false;

  push(value: T): void {
    if (this.#closed) return;
    const waiter = this.#waiting.shift();
    if (waiter !== undefined) waiter({ value, done: false });
    else this.#buffer.push(value);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiting) waiter({ value: undefined, done: true });
    this.#waiting = [];
  }

  get closed(): boolean {
    return this.#closed;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      if (this.#buffer.length > 0) {
        yield this.#buffer.shift() as T;
        continue;
      }
      if (this.#closed) return;
      const next = await new Promise<IteratorResult<T>>((resolve) => {
        this.#waiting.push(resolve);
      });
      if (next.done === true) return;
      yield next.value;
    }
  }
}
