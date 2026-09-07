import type { AgentEvent } from '../events.js';
import type { Clock } from '../clock.js';
import type {
  AgentRuntime, AvailableCommand, PermissionHandler, Prompt, RuntimeLifecycle, Unsubscribe,
} from '../runtime.js';
import type { Machine, MachineStartRequest } from './machine.js';
import { DEFAULT_MACHINE_IDLE_MS, machineIdleMs, type MachinePower } from './power.js';
import { machineLimits, type MachineLimits } from './resources.js';
import { runtimeImageBuild } from './runtime-image.js';

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
  /** Explicit launch may check a guest login before a bridge accepts a conversation. */
  readonly beforeRuntimeStart?: () => Promise<void>;
  /** Personal files stay borrowed until both provider and Machine finish shutting down. */
  readonly acquireResources?: () => Promise<() => Promise<void>>;
}

/**
 * An AgentRuntime that remains addressable while its execution sleeps. Internal sleep/wake
 * does not publish a false process death or reset the orchestrator's in-flight turn fold.
 * A prompt reserves execution synchronously, then wakes before forwarding the same prompt.
 */
export class SleepingRuntime implements AgentRuntime {
  readonly #options: SleepingRuntimeOptions;
  #runtime: AgentRuntime | undefined;
  #creationFailure: { readonly error: unknown } | undefined;
  #power: MachinePower = 'asleep';
  #lifecycle: RuntimeLifecycle = 'created';
  #closed = false;
  #busy = 0;
  #idleAfterMs: number;
  #lastActivity: number;
  #timer: AbortController | undefined;
  #remedyAbort: AbortController | undefined;
  #wakeAbort: AbortController | undefined;
  #transition: Promise<void> = Promise.resolve();
  #detach: Unsubscribe[] = [];
  readonly #events = new Set<(event: AgentEvent) => void>();
  readonly #lifecycles = new Set<(value: RuntimeLifecycle) => void>();
  readonly #commands = new Set<(commands: readonly AvailableCommand[]) => void>();
  #permission: PermissionHandler | undefined;
  #startedOnce = false;
  #activitySequence = 0;
  #releaseResources: (() => Promise<void>) | undefined;

  constructor(options: SleepingRuntimeOptions) {
    this.#options = options;
    this.#idleAfterMs = machineIdleMs(options.idleAfterMs ?? DEFAULT_MACHINE_IDLE_MS);
    this.#lastActivity = options.clock.now();
    try { this.#runtime = options.create(options.resumeSessionId); }
    catch (error) { this.#creationFailure = { error }; }
  }

  get agentId() { return this.#options.machine.location().agentId; }
  get sessionId() { return this.#runtime?.sessionId ?? this.#options.resumeSessionId ?? ''; }
  get lifecycle() { return this.#lifecycle; }
  get power() { return this.#power; }
  get personaIsSessionBound() { return this.#runtime?.personaIsSessionBound ?? false; }
  get availableCommands() { return this.#runtime?.availableCommands ?? []; }
  get accepts() { return this.#runtime?.accepts ?? { images: false, textFiles: false }; }
  get optionGroups() { return this.#runtime?.optionGroups ?? []; }
  get machineImage() { return this.#runtime?.machineImage; }

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

  /** Run a user-requested sign-in with the Machine awake and no provider session attached. */
  async remedy<T>(work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (this.#closed || this.#busy !== 0 || this.#lifecycle === 'starting') {
      throw new Error('Wait for this agent to finish before signing in.');
    }
    this.#busy += 1;
    this.#activitySequence += 1;
    this.#timer?.abort();
    this.#setLifecycle('starting');
    const abort = new AbortController();
    this.#remedyAbort = abort;
    const cancelled = signal === undefined ? abort.signal : AbortSignal.any([abort.signal, signal]);
    try {
      let result!: T;
      await this.#serialize(async () => {
        cancelled.throwIfAborted();
        try {
          this.#unsubscribeRuntime();
          this.#startedOnce = true;
          await this.#runtime?.stop();
          cancelled.throwIfAborted();
          this.#setPower('waking');
          this.#releaseResources ??= await this.#options.acquireResources?.();
          await this.#options.machine.start(this.#startRequest(cancelled));
          cancelled.throwIfAborted();
          this.#setPower('awake');
          result = await work(cancelled);
          cancelled.throwIfAborted();
        } finally {
          try {
            await this.#shutdown();
            this.#setPower('asleep');
          } catch (error) {
            this.#setPower('unknown');
            throw error;
          }
        }
      });
      return result;
    } finally {
      this.#remedyAbort = undefined;
      if (!this.#closed) this.#setLifecycle('dead');
      this.#busy -= 1;
    }
  }

  async *sendPrompt(prompt: Prompt, onAdmitted?: () => void): AsyncIterable<AgentEvent> {
    if (this.#closed) throw new Error('Agent execution is closed.');
    this.#busy += 1;
    this.#activitySequence += 1;
    this.#timer?.abort();
    try {
      await this.#wake(true);
      if (this.#closed) throw new Error('Agent execution is closed.');
      yield* this.#runtime!.sendPrompt(prompt, onAdmitted);
    } finally {
      this.#busy -= 1;
      this.#touch();
    }
  }

  async cancel(): Promise<void> { await this.#runtime?.cancel(); }

  async restart(): Promise<void> {
    this.#busy += 1;
    this.#timer?.abort();
    try {
      await this.#wake(true);
      if (this.#closed) throw new Error('Agent execution is closed.');
      await this.#runtime!.restart();
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
        if (busy) await this.#runtime?.cancel();
        await this.#shutdown();
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
        await this.#shutdown();
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

  /** Cancel only preparation, retaining queued work and permitting a later explicit retry. */
  async cancelStart(): Promise<void> {
    if (this.#power !== 'waking' || this.#wakeAbort === undefined) return;
    this.#wakeAbort.abort(new Error('Machine startup was cancelled. Retry when ready.'));
    await this.#transition;
  }

  /** Eviction/quit, unlike sleep, closes this service and rejects future prompts. */
  async stop(): Promise<void> {
    this.#closed = true;
    this.#timer?.abort();
    this.#remedyAbort?.abort();
    this.#wakeAbort?.abort();
    await this.#serialize(async () => {
      this.#unsubscribeRuntime();
      const results = await Promise.allSettled([this.#shutdown()]);
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
    this.#runtime?.setPermissionHandler(handler);
  }

  async #wake(verifyBeforeWork = false): Promise<void> {
    await this.#serialize(async () => {
      if (this.#closed) throw new Error('Agent execution is closed.');
      if (this.#lifecycle === 'dead') throw new Error('Agent execution needs to be reopened.');
      if (this.#power === 'awake') {
        if (verifyBeforeWork) await this.#beforeWork();
        return;
      }
      this.#setPower('waking');
      const abort = new AbortController();
      this.#wakeAbort = abort;
      const signal = this.#options.startRequest.signal === undefined ? abort.signal
        : AbortSignal.any([abort.signal, this.#options.startRequest.signal]);
      try {
        if (this.#creationFailure !== undefined) {
          const { error } = this.#creationFailure; this.#creationFailure = undefined; throw error;
        }
        if (this.#releaseResources && this.#startedOnce) await this.#shutdown();
        this.#releaseResources ??= await this.#options.acquireResources?.();
        if (this.#runtime === undefined || this.#startedOnce) {
          const sessionId = this.sessionId || undefined;
          this.#unsubscribeRuntime();
          this.#runtime = this.#options.create(sessionId);
        }
        await this.#options.machine.start(this.#startRequest(signal));
        if (this.#closed) return;
        signal.throwIfAborted();
        await this.#options.beforeRuntimeStart?.();
        if (this.#closed) return;
        signal.throwIfAborted();
        this.#startedOnce = true;
        this.#subscribeRuntime();
        if (this.#permission !== undefined) this.#runtime.setPermissionHandler(this.#permission);
        await this.#runtime.start();
        if (this.#closed) { await this.#runtime?.stop(); return; }
        signal.throwIfAborted();
        this.#setPower('awake');
        this.#options.onSessionOpened?.(this.#runtime.sessionId);
      } catch (error) {
        // Even a failure before adapter.start() closes this adapter below. A retry needs a
        // fresh process wrapper, including when Machine startup itself was what failed.
        this.#startedOnce = true;
        this.#unsubscribeRuntime();
        await this.#shutdown().catch(() => {});
        this.#setPower('unknown');
        this.#setLifecycle('dead');
        // Adapters already own their actionable launch/sign-in refusal. Do not erase it.
        throw error instanceof Error ? error : new Error('Agent execution could not wake. Its stored data was kept.');
      } finally {
        if (this.#wakeAbort === abort) this.#wakeAbort = undefined;
      }
      if (verifyBeforeWork && !this.#closed) await this.#beforeWork();
    });
  }

  #startRequest(signal: AbortSignal): MachineStartRequest {
    const image = this.#runtime?.machineImage;
    const build = image === undefined ? undefined : runtimeImageBuild(image, process.arch);
    if (this.#options.machine.kind === 'box' && image !== undefined && build === undefined) {
      throw new Error('This runtime has no Machine image for this host architecture.');
    }
    return { ...this.#options.startRequest, signal,
      ...(build === undefined ? {} : { runtime: { image: build.reference } }),
    };
  }

  async #beforeWork(): Promise<void> {
    try { await this.#options.machine.beforeWork?.(); }
    catch {
      this.#timer?.abort();
      this.#unsubscribeRuntime();
      this.#setPower('unknown');
      this.#setLifecycle('dead');
      await this.#shutdown().catch(() => {});
      throw new Error('This Machine could not be verified before work. Its stored data was kept.');
    }
  }

  #subscribeRuntime(): void {
    this.#unsubscribeRuntime();
    this.#detach = [
      this.#runtime!.onEvent((event) => { for (const listener of this.#events) listener(event); }),
      this.#runtime!.onCommandsChange((commands) => { for (const listener of this.#commands) listener(commands); }),
      this.#runtime!.onLifecycleChange((lifecycle) => {
        // These belong to an unexpected process loss, not intentional internal sleep/wake.
        if (this.#power === 'awake' && (lifecycle === 'dead' || lifecycle === 'stopped')) {
          this.#timer?.abort();
          this.#setPower('unknown');
          this.#setLifecycle('dead');
          this.#unsubscribeRuntime();
          void this.#serialize(async () => {
            try { await this.#shutdown(); this.#setPower('asleep'); }
            catch { this.#setPower('unknown'); }
          });
        }
      }),
    ];
  }
  #unsubscribeRuntime(): void { for (const detach of this.#detach) detach(); this.#detach = []; }
  async #shutdown(): Promise<void> {
    const results = await Promise.allSettled([this.#runtime?.stop()]);
    results.push(...await Promise.allSettled([this.#options.machine.stop()]));
    if (results.some((result) => result.status === 'rejected')) throw new Error('Agent execution did not fully stop.');
    const release = this.#releaseResources;
    this.#releaseResources = undefined;
    await release?.();
  }
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
