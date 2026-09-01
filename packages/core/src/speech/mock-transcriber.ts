import type { Clock } from '../clock.js';
import { SystemClock } from '../clock.js';
import { AsyncQueue } from '../mock/async-queue.js';
import type { SpeechHint, Transcriber, TranscriberEvent } from './domain.js';

/**
 * A Transcriber that listens to real audio and says scripted things.
 *
 * `MockAgentRuntime`'s thesis applied to speech: a kind mock produces a composer that shatters
 * on first contact with a real engine. So the checked-in scenarios reproduce the ugly cases on
 * purpose — a late partial that rewrites an earlier one, a stall with no events in it, an
 * engine that exits mid-sentence after committed text — and demo mode plays them behind a
 * microphone that is genuinely open (ticket 11).
 */

/** One scripted event and when it lands, in milliseconds after `start`. */
export interface SpeechStep {
  readonly at: number;
  readonly event: TranscriberEvent;
}

export interface SpeechScenario {
  readonly name: string;
  readonly steps: readonly SpeechStep[];
}

/**
 * The checked-in scenarios. Being in the repo is the point: "does the ghost survive a partial
 * that gets shorter?" becomes a file rather than a memory.
 */
export const speechScenarios = {
  /**
   * A partial that is revised three times, once to something *shorter*, before it commits, and
   * a second sentence that does the same. The ghost has to be replaced in place every time and
   * never accumulate.
   */
  rewrites: {
    name: 'rewrites',
    steps: [
      { at: 700, event: { type: 'partial', text: 'hola alice' } },
      { at: 1_300, event: { type: 'partial', text: 'hola @alice revisa el sesión nueva del' } },
      { at: 1_900, event: { type: 'partial', text: 'hola @alice revisa el session/new' } },
      { at: 2_600, event: { type: 'committed', text: 'Hola @alice, revisa el session/new' } },
      { at: 3_500, event: { type: 'partial', text: 'del adaptador' } },
      { at: 4_200, event: { type: 'partial', text: 'del adapter de Cursor y dime' } },
      { at: 5_000, event: { type: 'committed', text: 'del adapter de Cursor y dime si aguanta.' } },
    ],
  },
  /**
   * Five and a half seconds with no event at all, after a committed sentence. Nothing is wrong
   * — a slow decode looks exactly like this — and the composer must look like nothing is wrong.
   */
  stalls: {
    name: 'stalls',
    steps: [
      { at: 900, event: { type: 'committed', text: 'Bob, mira el retry loop de src/auth.ts' } },
      { at: 6_400, event: { type: 'partial', text: 'y dime si' } },
      { at: 7_000, event: { type: 'committed', text: 'y dime si tiene backoff.' } },
    ],
  },
  /**
   * The engine exits with a partial on screen. The committed sentence stays in the field, the
   * ghost goes, and the line says why — `failed` and `ended` are different events for this.
   */
  dies: {
    name: 'dies',
    steps: [
      { at: 900, event: { type: 'committed', text: 'Alice, el session/new del adapter' } },
      { at: 1_600, event: { type: 'partial', text: 'de Cursor devuelve' } },
      { at: 2_300, event: { type: 'failed', cause: 'engine_exited' } },
    ],
  },
} as const satisfies Record<string, SpeechScenario>;

export type SpeechScenarioName = keyof typeof speechScenarios;

export interface MockTranscriberOptions {
  readonly scenario?: SpeechScenario;
  readonly clock?: Clock;
  /** What the mock claims to emit. Defaults to true, because the scenarios use partials. */
  readonly partials?: boolean;
  /** What the mock claims to take. Defaults to `segments`, which exercises the renderer's cutting. */
  readonly takes?: 'segments' | 'stream';
}

export class MockTranscriber implements Transcriber {
  readonly id = 'mock' as const;
  readonly partials: boolean;
  readonly takes: 'segments' | 'stream';
  readonly #scenario: SpeechScenario;
  readonly #clock: Clock;
  readonly #queue = new AsyncQueue<TranscriberEvent>();
  readonly #abort = new AbortController();
  #fedBytes = 0;
  #marks = 0;
  #playing: Promise<void> | undefined;
  #done = false;

  constructor(options: MockTranscriberOptions = {}) {
    this.#scenario = options.scenario ?? speechScenarios.rewrites;
    this.#clock = options.clock ?? new SystemClock();
    this.partials = options.partials ?? true;
    this.takes = options.takes ?? 'segments';
  }

  /** How much audio arrived, so a test can assert the renderer really fed the microphone. */
  get fedBytes(): number {
    return this.#fedBytes;
  }

  get marks(): number {
    return this.#marks;
  }

  get events(): AsyncIterable<TranscriberEvent> {
    return this.#queue;
  }

  async start(_hint: SpeechHint): Promise<void> {
    this.#playing = this.#play();
  }

  feed(pcm: Uint8Array): 'taken' | 'dropped' {
    if (this.#done) return 'dropped';
    this.#fedBytes += pcm.byteLength;
    return 'taken';
  }

  mark(): void {
    this.#marks += 1;
  }

  async stop(): Promise<void> {
    if (this.#done) return;
    this.#abort.abort();
    await this.#playing;
    this.#finish({ type: 'ended', reason: 'user' });
  }

  async #play(): Promise<void> {
    const began = this.#clock.now();
    for (const step of this.#scenario.steps) {
      const wait = began + step.at - this.#clock.now();
      await this.#clock.sleep(wait, this.#abort.signal);
      if (this.#abort.signal.aborted) return;
      if (step.event.type === 'failed') {
        this.#finish(step.event);
        return;
      }
      this.#queue.push(step.event);
    }
  }

  #finish(last: TranscriberEvent): void {
    if (this.#done) return;
    this.#done = true;
    this.#queue.push(last);
    this.#queue.close();
  }
}
