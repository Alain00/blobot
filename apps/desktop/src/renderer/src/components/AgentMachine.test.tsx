/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { UiAgent, UiAgentMachine } from '../../../shared/api.js';
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
  expect(host.textContent).toContain('Your message is waiting');
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
