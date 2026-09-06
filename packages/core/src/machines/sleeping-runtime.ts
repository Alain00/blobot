import type { AgentEvent } from '../events.js';
import type { Clock } from '../clock.js';
import type {
  AgentRuntime, AvailableCommand, PermissionHandler, Prompt, RuntimeLifecycle, Unsubscribe,
} from '../runtime.js';
import type { Machine, MachineStartRequest } from './machine.js';
import { DEFAULT_MACHINE_IDLE_MS, machineIdleMs, type MachinePower } from './power.js';
import { machineLimits, type MachineLimits } from './resources.js';

export interface SleepingRuntimeOptions {
  readonly machine: Machine;
  readonly startRequest: MachineStartRequest;
  readonly clock: Clock;
  /** Reconstructs the adapter with the latest provider session, never its original session. */
  readonly create: (resumeSessionId: string | undefined) => AgentRuntime;
  readonly resumeSessionId?: string;
  readonly idleAfterMs?: number;
  /** Mailbox, Routine holds and other application work can prevent automatic sleep. */
  readonly canSleep: () => boolean;
  readonly onPowerChange?: (power: MachinePower) => void;
  readonly onSessionOpened?: (sessionId: string) => void;
}

/**
 * An AgentRuntime that remains addressable while its execution sleeps. Internal sleep/wake
 * does not publish a false process death or reset the orchestrator's in-flight turn fold.
 * A prompt reserves execution synchronously, then wakes before forwarding the same prompt.
 */
export class SleepingRuntime implements AgentRuntime {
  readonly #options: SleepingRuntimeOptions;
  #runtime: AgentRuntime;
  #power: MachinePower = 'asleep';
  #lifecycle: RuntimeLifecycle = 'created';
  #closed = false;
  #busy = 0;
  #idleAfterMs: number;
  #lastActivity: number;
  #timer: AbortController | undefined;
  #transition: Promise<void> = Promise.resolve();
  #detach: Unsubscribe[] = [];
  readonly #events = new Set<(event: AgentEvent) => void>();
  readonly #lifecycles = new Set<(value: RuntimeLifecycle) => void>();
  readonly #commands = new Set<(commands: readonly AvailableCommand[]) => void>();
  #permission: PermissionHandler | undefined;
  #startedOnce = false;
  #activitySequence = 0;

  constructor(options: SleepingRuntimeOptions) {
    this.#options = options;
    this.#idleAfterMs = machineIdleMs(options.idleAfterMs ?? DEFAULT_MACHINE_IDLE_MS);
    this.#lastActivity = options.clock.now();
    this.#runtime = options.create(options.resumeSessionId);
  }

  get agentId() { return this.#runtime.agentId; }
  get sessionId() { return this.#runtime.sessionId; }
  get lifecycle() { return this.#lifecycle; }
  get power() { return this.#power; }
  get personaIsSessionBound() { return this.#runtime.personaIsSessionBound; }
  get availableCommands() { return this.#runtime.availableCommands; }
  get accepts() { return this.#runtime.accepts; }
  get optionGroups() { return this.#runtime.optionGroups; }
  get machineImage() { return this.#runtime.machineImage; }

  async start(): Promise<void> {
    if (this.#lifecycle !== 'created') throw new Error('Agent execution has already started.');
    this.#setLifecycle('starting');
    await this.#wake();
    if (this.#closed) return;
    this.#setLifecycle('ready');
    this.#touch();
  }

  async retryStart(): Promise<void> {
    if (this.#closed) throw new Error('Agent execution is closed.');
    if (this.#busy !== 0 || this.#lifecycle === 'starting') {
      throw new Error('Agent execution is already busy.');
    }
    if (this.#lifecycle === 'ready') return;
    this.#setLifecycle('starting');
    await this.#wake();
    if (this.#closed) return;
    this.#setLifecycle('ready');
    this.#touch();
  }

  async *sendPrompt(prompt: Prompt, onAdmitted?: () => void): AsyncIterable<AgentEvent> {
    if (this.#closed) throw new Error('Agent execution is closed.');
    this.#busy += 1;
    this.#activitySequence += 1;
    this.#timer?.abort();
    try {
      await this.#wake();
      await this.#beforeWork();
      yield* this.#runtime.sendPrompt(prompt, onAdmitted);
    } finally {
      this.#busy -= 1;
      this.#touch();
    }
  }

  async cancel(): Promise<void> { await this.#runtime.cancel(); }

  async restart(): Promise<void> {
    this.#busy += 1;
    this.#timer?.abort();
    try {
      await this.#wake();
      await this.#beforeWork();
      await this.#runtime.restart();
    } finally {
      this.#busy -= 1;
      this.#touch();
    }
  }

  setIdleAfterMs(value: number): void {
    this.#idleAfterMs = machineIdleMs(value);
    this.#schedule();
  }

  /** Readiness may inspect an awake execution, but must never wake one or race its sleep. */
  async inspect<T>(read: () => Promise<T>): Promise<T | undefined> {
    let result: T | undefined;
    await this.#serialize(async () => {
      if (this.#closed || this.#power !== 'awake') return;
      this.#busy += 1;
      this.#timer?.abort();
      try { result = await read(); }
      finally { this.#busy -= 1; this.#schedule(); }
    });
    return result;
  }

  /** Warn BEFORE stopping busy work. Arriving prompts queue behind the replacement and wake. */
  async reconfigure(limits: MachineLimits, confirmInterruption?: () => Promise<boolean>): Promise<boolean> {
    const desired = machineLimits(limits);
    const change = this.#options.machine.reconfigure;
    if (change === undefined) throw new Error('Resource changes are not available for this Machine.');
    const sequence = this.#activitySequence;
    const busy = this.#busy !== 0 || !this.#options.canSleep();
    if (busy) {
      if (confirmInterruption === undefined) throw new Error('Confirm before interrupting this Agent’s work to change its Machine.');
      if (!await confirmInterruption()) return false;
    }
    await this.#serialize(async () => {
      if (this.#closed || this.#lifecycle === 'dead') throw new Error('This Agent execution must be reopened first.');
      if (sequence !== this.#activitySequence || (!busy && (this.#busy !== 0 || !this.#options.canSleep()))) {
        throw new Error('New work arrived. Confirm the resource change again before interrupting it.');
      }
      this.#timer?.abort();
      this.#setPower('sleeping');
      this.#unsubscribeRuntime();
      try {
        if (busy) await this.#runtime.cancel();
        await this.#runtime.stop();
        await this.#options.machine.stop();
        await change.call(this.#options.machine, desired);
        this.#setPower('asleep');
      } catch {
        this.#setPower('unknown');
        this.#setLifecycle('dead');
        throw new Error('The resource change did not complete. Stored Machine data was kept for recovery.');
      }
    });
    await this.#wake();
    this.#touch();
    return true;
  }

  /** A quiet Machine sleeps; a pending prompt or external hold always wins. */
  async sleep(): Promise<boolean> {
    let slept = false;
    await this.#serialize(async () => {
      if (this.#closed || this.#busy !== 0 || this.#power !== 'awake' || !this.#options.canSleep()) return;
      this.#timer?.abort();
      this.#setPower('sleeping');
      this.#unsubscribeRuntime();
      try {
        await this.#runtime.stop();
        await this.#options.machine.stop();
        this.#setPower('asleep');
        slept = true;
      } catch {
        this.#setPower('unknown');
        this.#setLifecycle('dead');
        throw new Error('Agent execution could not be put to sleep.');
      }
    });
    return slept;
  }

  /** Eviction/quit, unlike sleep, closes this service and rejects future prompts. */
  async stop(): Promise<void> {
    this.#closed = true;
    this.#timer?.abort();
    await this.#serialize(async () => {
      this.#unsubscribeRuntime();
      const results = await Promise.allSettled([this.#runtime.stop()]);
      results.push(...await Promise.allSettled([this.#options.machine.stop()]));
      this.#setLifecycle('stopped');
      this.#setPower(results.every((result) => result.status === 'fulfilled') ? 'asleep' : 'unknown');
      if (results.some((result) => result.status === 'rejected')) throw new Error('Agent execution did not fully stop.');
    });
  }

  onEvent(listener: (event: AgentEvent) => void): Unsubscribe {
    this.#events.add(listener); return () => this.#events.delete(listener);
  }
  onLifecycleChange(listener: (value: RuntimeLifecycle) => void): Unsubscribe {
    this.#lifecycles.add(listener); return () => this.#lifecycles.delete(listener);
  }
  onCommandsChange(listener: (value: readonly AvailableCommand[]) => void): Unsubscribe {
    this.#commands.add(listener); return () => this.#commands.delete(listener);
  }
  setPermissionHandler(handler: PermissionHandler): void {
    this.#permission = handler;
    this.#runtime.setPermissionHandler(handler);
  }

  async #wake(): Promise<void> {
    await this.#serialize(async () => {
      if (this.#closed) throw new Error('Agent execution is closed.');
      if (this.#lifecycle === 'dead') throw new Error('Agent execution needs to be reopened.');
      if (this.#power === 'awake') return;
      this.#setPower('waking');
      try {
        await this.#options.machine.start(this.#options.startRequest);
        if (this.#startedOnce) {
          const sessionId = this.#runtime.sessionId || undefined;
          this.#unsubscribeRuntime();
          this.#runtime = this.#options.create(sessionId);
        }
        this.#startedOnce = true;
        this.#subscribeRuntime();
        if (this.#permission !== undefined) this.#runtime.setPermissionHandler(this.#permission);
        await this.#runtime.start();
        if (this.#closed) { await this.#runtime.stop(); return; }
        this.#setPower('awake');
        this.#options.onSessionOpened?.(this.#runtime.sessionId);
      } catch (error) {
        // Even a failure before adapter.start() closes this adapter below. A retry needs a
        // fresh process wrapper, including when Machine startup itself was what failed.
        this.#startedOnce = true;
        this.#unsubscribeRuntime();
        await this.#runtime.stop().catch(() => {});
        await this.#options.machine.stop().catch(() => {});
        this.#setPower('unknown');
        this.#setLifecycle('dead');
        // Adapters already own their actionable launch/sign-in refusal. Do not erase it.
        throw error instanceof Error ? error : new Error('Agent execution could not wake. Its stored data was kept.');
      }
    });
  }

  async #beforeWork(): Promise<void> {
    try { await this.#options.machine.beforeWork?.(); }
    catch {
      this.#timer?.abort();
      this.#unsubscribeRuntime();
      this.#setPower('unknown');
      this.#setLifecycle('dead');
      await this.#runtime.stop().catch(() => {});
      await this.#options.machine.stop().catch(() => {});
      throw new Error('This Machine could not be verified before work. Its stored data was kept.');
    }
  }

  #subscribeRuntime(): void {
    this.#unsubscribeRuntime();
    this.#detach = [
      this.#runtime.onEvent((event) => { for (const listener of this.#events) listener(event); }),
      this.#runtime.onCommandsChange((commands) => { for (const listener of this.#commands) listener(commands); }),
      this.#runtime.onLifecycleChange((lifecycle) => {
        // These belong to an unexpected process loss, not intentional internal sleep/wake.
        if (this.#power === 'awake' && (lifecycle === 'dead' || lifecycle === 'stopped')) {
          this.#timer?.abort();
          this.#setPower('unknown');
          this.#setLifecycle('dead');
        }
      }),
    ];
  }
  #unsubscribeRuntime(): void { for (const detach of this.#detach) detach(); this.#detach = []; }
  #serialize(work: () => Promise<void>): Promise<void> {
    const next = this.#transition.then(work);
    this.#transition = next.catch(() => {});
    return next;
  }
  #setPower(power: MachinePower): void {
    if (this.#power === power) return;
    this.#power = power;
    this.#options.onPowerChange?.(power);
  }
  #setLifecycle(value: RuntimeLifecycle): void {
    if (this.#lifecycle === value) return;
    this.#lifecycle = value;
    for (const listener of this.#lifecycles) listener(value);
  }
  #touch(): void { this.#lastActivity = this.#options.clock.now(); this.#schedule(); }
  #schedule(minDelayMs = 0): void {
    this.#timer?.abort();
    if (this.#closed || this.#idleAfterMs === 0 || this.#busy !== 0 || this.#power !== 'awake') return;
    const timer = new AbortController();
    this.#timer = timer;
    const remaining = Math.min(2_147_483_647, Math.max(minDelayMs, this.#lastActivity + this.#idleAfterMs - this.#options.clock.now(), 0));
    void this.#options.clock.sleep(remaining, timer.signal).then(async () => {
      if (timer.signal.aborted || this.#closed) return;
      if (this.#options.clock.now() < this.#lastActivity + this.#idleAfterMs) { this.#schedule(); return; }
      if (!await this.sleep()) {
        // A Routine or queued mail holds it awake. Check sparingly, never a zero-delay loop.
        this.#schedule(Math.min(60_000, this.#idleAfterMs));
      }
    }).catch(() => {
      // A failed external hold check must not permanently disable idle reclamation.
      // Stop failures already changed power to unknown, which prevents another timer.
      if (!timer.signal.aborted) this.#schedule(Math.min(60_000, this.#idleAfterMs));
    });
  }
}
