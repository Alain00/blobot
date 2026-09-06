/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { AgentStatus } from '@blobot/core/domain';
import type { BlobotApi, UiAgent, UiAgentMachine } from '../../../shared/api.js';
import { AgentMachine } from './AgentMachine.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren(); });

it('keeps a typed one-time code across status refreshes and sends it only to the active attempt', async () => {
  const agent: UiAgent = { id: 'alice', name: 'Alice', role: 'Engineer', runtimeLabel: 'Runtime', workspacePath: '/fixture',
    accepts: { images: true, textFiles: true }, machine: { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 4 * 1024 ** 3 } } };
  let view: UiAgentMachine = { placement: agent.machine!, power: 'awake', pendingMessages: 1, methods: [],
    operation: { id: 'attempt', phase: 'waiting', detail: 'Continue signing in.' },
    challenge: { kind: 'browser', url: 'https://example.com/login', input: 'Paste the code.' } };
  const listeners = new Set<() => void>();
  const answer = vi.fn(async () => { const { challenge: _challenge, ...rest } = view; view = rest; });
  Object.defineProperty(window, 'blobot', { configurable: true, value: {
    agentMachine: async () => structuredClone(view),
    engineSetup: async () => ({ readiness: { state: 'ready' }, canInstall: true, kvmAvailable: true }),
    onMachines: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
    onStatus: () => () => {}, onMessage: () => () => {}, answerMachineLogin: answer,
  } });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<AgentMachine teamId="team" agent={agent} status="failed" />));
  expect(host.textContent).toContain('Your message is queued until this agent can work');
  const input = host.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'one-use#state');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { for (const fn of listeners) fn(); });
  expect(input.value).toBe('one-use#state');
  expect(answer).not.toHaveBeenCalled();
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(answer).toHaveBeenCalledWith('team', 'alice', 'attempt', 'one-use#state');
  expect(host.querySelector('input')).toBeNull();
  expect(host.textContent).not.toContain('one-use#state');
});

it('refreshes readiness when the Machine sleeps without a runtime status event', async () => {
  const agent: UiAgent = { id: 'alice', name: 'Alice', role: 'Engineer', runtimeLabel: 'Runtime', workspacePath: '/fixture',
    accepts: { images: true, textFiles: true }, machinePower: 'awake',
    machine: { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 4 * 1024 ** 3 } } };
  let view: UiAgentMachine = { placement: agent.machine!, power: 'awake', pendingMessages: 0, methods: [],
    detection: { subject: { kind: 'agent', agentId: 'alice' }, readiness: 'ready', detail: 'Runtime checked.' } };
  const read = vi.fn(async () => structuredClone(view));
  Object.defineProperty(window, 'blobot', { configurable: true, value: {
    agentMachine: read,
    engineSetup: async () => ({ readiness: { state: 'ready' }, canInstall: true, kvmAvailable: true }),
    onMachines: () => () => {}, onStatus: () => () => {}, onMessage: () => () => {},
  } });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<AgentMachine teamId="team" agent={agent} status="idle" />));
  await act(async () => host.querySelector<HTMLButtonElement>('.agentmachinehead')!.click());
  expect(host.textContent).toContain('ready · Runtime checked.');
  expect(host.textContent).not.toContain('last check');
  view = { ...view, power: 'asleep' };
  await act(async () => root!.render(<AgentMachine teamId="team" agent={{ ...agent, machinePower: 'asleep' }} status="idle" />));
  expect(read).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('last check: ready · Runtime checked.');
});

const BOX_AGENT: UiAgent = {
  id: 'alice', name: 'Alice', role: 'Engineer', runtimeLabel: 'Runtime', workspacePath: '/fixture',
  accepts: { images: true, textFiles: true },
  machine: { kind: 'box', limits: { maxCpus: 2, maxMemoryBytes: 4 * 1024 ** 3 } },
};

async function drawMachine(agent: UiAgent, initial: UiAgentMachine, status: AgentStatus = 'failed') {
  let view = initial;
  const read = vi.fn<BlobotApi['agentMachine']>(async () => structuredClone(view));
  const retry = vi.fn<BlobotApi['retryMachine']>(async () => {});
  const startLogin = vi.fn<BlobotApi['startMachineLogin']>(async () => 'login-attempt');
  const cancelStartup = vi.fn<BlobotApi['cancelMachineStart']>(async () => {});
  const engineSetup = vi.fn<BlobotApi['engineSetup']>(async () => ({
    readiness: { state: 'ready' }, canInstall: true, kvmAvailable: true,
    previewEnabled: true, configuredMachines: [],
  }));
  const listeners = new Set<() => void>();
  const api = {
    agentMachine: read, retryMachine: retry, startMachineLogin: startLogin,
    cancelMachineStart: cancelStartup, engineSetup,
    onMachines: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    onStatus: () => () => {}, onMessage: () => () => {},
  } satisfies Pick<BlobotApi, 'agentMachine' | 'retryMachine' | 'startMachineLogin' |
    'cancelMachineStart' | 'engineSetup' | 'onMachines' | 'onStatus' | 'onMessage'>;
  Object.defineProperty(window, 'blobot', { configurable: true, value: api });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(<AgentMachine teamId="team" agent={agent} status={status} />));
  const button = (label: string) => [...host.querySelectorAll('button')].find((node) => node.textContent === label);
  const update = async (next: UiAgentMachine) => {
    view = next;
    await act(async () => { for (const listener of listeners) listener(); });
  };
  return { host, read, retry, startLogin, cancelStartup, engineSetup, button, update };
}

it('shows a local startup refusal and lets the user retry the same Agent', async () => {
  const agent = { ...BOX_AGENT, machine: { kind: 'local' } } satisfies UiAgent;
  const f = await drawMachine(agent, {
    placement: { kind: 'local' }, power: 'asleep', pendingMessages: 1, methods: [],
    failure: 'The installed runtime could not start.',
  });
  expect(f.host.querySelector('[role="alert"]')?.textContent).toContain('could not start');
  expect(f.button('try again')).toBeDefined();
  await act(async () => f.button('try again')!.click());
  expect(f.retry).toHaveBeenCalledExactlyOnceWith('team', 'alice');
  expect(f.read).toHaveBeenCalledTimes(2);
  expect(f.engineSetup).not.toHaveBeenCalled();
});

it('shows download progress and cancels startup without discarding the queued-message indication', async () => {
  const f = await drawMachine(BOX_AGENT, {
    placement: BOX_AGENT.machine!, power: 'waking', pendingMessages: 2, methods: [],
    preparation: { id: 'image', phase: 'downloading', detail: 'Downloading runtime.', received: 25 * 1024 ** 2, total: 100 * 1024 ** 2 },
  }, 'idle');
  expect(f.host.querySelector('[role="status"]')?.textContent).toContain('25 MB of 100 MB');
  expect(f.host.textContent).toContain('2 messages are queued');
  expect(f.button('cancel startup')).toBeDefined();
  await act(async () => f.button('cancel startup')!.click());
  expect(f.cancelStartup).toHaveBeenCalledExactlyOnceWith('team', 'alice');
  expect(f.host.textContent).toContain('2 messages are queued');
  expect(f.engineSetup).not.toHaveBeenCalled();
});

it.each(['ready', 'unknown', 'not_installed'] as const)('does not offer sign-in when runtime readiness is %s', async (readiness) => {
  const f = await drawMachine(BOX_AGENT, {
    placement: BOX_AGENT.machine!, power: 'awake', pendingMessages: 0,
    methods: [{ id: 'device', label: 'Runtime account', detail: 'Enable device login in account settings.' }],
    detection: { subject: { kind: 'agent', agentId: 'alice' }, readiness, detail: 'Runtime check.' },
  });
  expect([...f.host.querySelectorAll('button')].some((button) => button.textContent?.startsWith('sign in to'))).toBe(false);
  expect(f.startLogin).not.toHaveBeenCalled();
});

it('shows login requirements inline and associates them with the actionable sign-in method', async () => {
  const f = await drawMachine(BOX_AGENT, {
    placement: BOX_AGENT.machine!, power: 'awake', pendingMessages: 0,
    methods: [{ id: 'device', label: 'Runtime account', detail: 'Enable device login in account settings.' }],
    detection: { subject: { kind: 'agent', agentId: 'alice' }, readiness: 'needs_sign_in', detail: 'Sign in required.' },
  });
  const button = f.button('sign in to Runtime account')!;
  expect(button).toBeDefined();
  const description = document.getElementById(button.getAttribute('aria-describedby')!);
  expect(description?.textContent).toContain('Enable device login in account settings');
  expect(description?.closest('[hidden]')).toBeNull();
  await act(async () => button.click());
  expect(f.startLogin).toHaveBeenCalledExactlyOnceWith('team', 'alice', 'device');
  expect(f.engineSetup).not.toHaveBeenCalled();
});
