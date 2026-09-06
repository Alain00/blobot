import { randomUUID } from 'node:crypto';
import { MachineLogin, machinePlacement, type AgentRecord, type SleepingRuntime } from '@blobot/core';
import type { UiAgentMachine, UiLoginChallenge, SetupProgress } from '../shared/machines.js';
import { DesktopBoxMachine } from './machines.js';
import { imageFor, loginFor } from './runtime-for.js';

export interface MachineLoginAccess {
  readonly record: AgentRecord;
  readonly machine: DesktopBoxMachine;
  readonly execution: SleepingRuntime;
  readonly retry: () => Promise<void>;
  readonly pendingMessages?: () => number;
}
interface Attempt {
  readonly id: string;
  readonly abort: AbortController;
  task: Promise<void>;
  login?: MachineLogin;
  challenge?: UiLoginChallenge;
  operation: SetupProgress;
}

/** Ephemeral, per-Agent sign-in. The adapter interprets vendor output; this service owns UI lifetime. */
export class MachineLogins {
  readonly #attempts = new Map<string, Attempt>();
  constructor(readonly lookup: (teamId: string, agentId: string) => MachineLoginAccess,
    readonly changed: () => void, readonly openBrowser: (url: string) => Promise<void>) {}
  #key(teamId: string, agentId: string): string { return JSON.stringify([teamId, agentId]); }
  view(teamId: string, agentId: string): UiAgentMachine {
    const access = this.lookup(teamId, agentId);
    const attempt = this.#attempts.get(this.#key(teamId, agentId));
    return { placement: machinePlacement(access.record.machine), power: access.execution.power,
      pendingMessages: access.pendingMessages?.() ?? 0,
      methods: loginFor(access.record.runtimeId)?.methods ?? [],
      ...(access.machine.lastDetection === undefined ? {} : { detection: access.machine.lastDetection }),
      ...(attempt === undefined ? {} : { operation: attempt.operation }),
      ...(attempt?.challenge === undefined ? {} : { challenge: attempt.challenge }),
    };
  }
  start(teamId: string, agentId: string, method: string): string {
    const key = this.#key(teamId, agentId), previous = this.#attempts.get(key);
    if (previous !== undefined && !['done', 'failed', 'cancelled'].includes(previous.operation.phase)) {
      throw new Error('This agent already has a sign-in in progress.');
    }
    const access = this.lookup(teamId, agentId);
    const spec = loginFor(access.record.runtimeId)?.spec(method), image = imageFor(access.record.runtimeId);
    if (spec === undefined || image === undefined) throw new Error('No sandbox sign-in is available for this runtime.');
    const id = randomUUID();
    const attempt: Attempt = { id, abort: new AbortController(), task: Promise.resolve(),
      operation: { id, phase: 'starting', detail: 'Preparing this agent’s sign-in…' } };
    this.#attempts.set(key, attempt); this.changed();
    const update = (phase: SetupProgress['phase'], detail: string) => {
      attempt.operation = { id, phase, detail }; this.changed();
    };
    attempt.task = Promise.resolve().then(async () => {
      let ready = false;
      const deadline = AbortSignal.any([attempt.abort.signal, AbortSignal.timeout(15 * 60_000)]);
      await access.execution.remedy(async (executionSignal) => {
        const signal = executionSignal;
        signal.throwIfAborted();
        const login = new MachineLogin(access.machine, image.guestNode, spec);
        attempt.login = login;
        await login.run(signal, (challenge) => {
          // A private callback's state stays in its relay; renderer receives only the browser challenge.
          if (challenge.kind === 'browser') {
            const { callback: _callback, ...publicChallenge } = challenge;
            attempt.challenge = publicChallenge;
          } else attempt.challenge = challenge;
          update('waiting', 'Continue this agent’s sign-in.');
        });
        delete attempt.challenge; delete attempt.login;
        signal.throwIfAborted();
        update('checking', 'Checking this agent’s runtime…');
        const detection = await access.machine.checkRuntime();
        ready = detection.readiness === 'ready';
        update('checking', detection.detail);
      }, deadline);
      attempt.abort.signal.throwIfAborted();
      if (ready) {
        update('done', 'Runtime login checked. Retrying pending messages.');
        void access.retry().catch((error: unknown) => {
          update('failed', error instanceof Error ? error.message : 'This agent could not reopen. Try again.');
        });
      } else update('done', access.machine.lastDetection?.detail ?? 'Runtime status could not be checked.');
    }).catch((error: unknown) => {
      const cancelled = attempt.abort.signal.aborted || access.execution.lifecycle === 'stopped';
      update(cancelled ? 'cancelled' : 'failed', cancelled ? 'Sign-in cancelled.'
        : error instanceof Error ? error.message : 'Sign-in did not complete.');
    }).finally(() => { delete attempt.challenge; delete attempt.login; this.changed(); });
    return id;
  }
  #attempt(teamId: string, agentId: string, id: string): Attempt {
    const attempt = this.#attempts.get(this.#key(teamId, agentId));
    if (attempt?.id !== id) throw new Error('This sign-in is no longer active.');
    return attempt;
  }
  respond(teamId: string, agentId: string, id: string, value: string): void {
    const attempt = this.#attempt(teamId, agentId, id);
    if (attempt.login === undefined) throw new Error('This sign-in is not waiting for input.');
    attempt.login.respond(value); delete attempt.challenge;
    attempt.operation = { id, phase: 'waiting', detail: 'Waiting for the runtime…' }; this.changed();
  }
  async open(teamId: string, agentId: string, id: string): Promise<void> {
    const attempt = this.#attempt(teamId, agentId, id);
    if (attempt.challenge?.kind !== 'browser') throw new Error('There is no browser step for this sign-in.');
    await this.openBrowser(attempt.challenge.url);
  }
  cancel(teamId: string, agentId: string, id: string): void {
    const attempt = this.#attempt(teamId, agentId, id);
    attempt.abort.abort();
    attempt.operation = { id, phase: 'checking', detail: 'Cancelling sign-in and stopping this sandbox…' };
    this.changed();
  }
  async close(): Promise<void> {
    for (const attempt of this.#attempts.values()) attempt.abort.abort();
    await Promise.all([...this.#attempts.values()].map((attempt) => attempt.task));
    this.#attempts.clear();
  }
}
