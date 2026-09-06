import { createServer } from 'node:net';
import { expect, it, vi } from 'vitest';
import { LocalMachine } from '../machines/local-machine.js';
import type { MachineSpawnRequest } from '../machines/machine.js';
import { admittedLoginCallback, validateLoginCallback, openLoginCallbackRelay } from './login-callback.js';

it('admits only the exact one-attempt OAuth callback, with one state and no arbitrary URL', () => {
  const callback = { port: 1455, path: '/auth/callback', state: 'a'.repeat(43) };
  const path = `/auth/callback?code=one-use&state=${callback.state}`;
  expect(() => validateLoginCallback(callback)).not.toThrow();
  expect(admittedLoginCallback('GET', path, callback)).toBe(path);
  for (const candidate of [path.replace('code=', 'other='), path.replace(callback.state, 'wrong'),
    `${path}&state=${callback.state}`, `${path}&code=second`, `//elsewhere${path}`, '/secret', `https://localhost${path}`]) {
    expect(admittedLoginCallback('GET', candidate, callback)).toBeUndefined();
  }
  expect(admittedLoginCallback('POST', path, callback)).toBeUndefined();
  expect(() => validateLoginCallback({ ...callback, port: 80 })).toThrow();
  expect(() => validateLoginCallback({ ...callback, path: '/../secret' })).toThrow();
});

it('relays one admitted callback to one Machine using stdin, then closes both loopback listeners', async () => {
  const reserve = createServer();
  await new Promise<void>((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const address = reserve.address();
  if (address === null || typeof address === 'string') throw new Error('No test port');
  const port = address.port;
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  const machine = new LocalMachine({ agentId: 'callback-fixture', workspacePath: '/tmp' });
  const write = vi.fn();
  const spawn = vi.fn((_request: MachineSpawnRequest) => ({
    write, lines: async function* () { yield '{"status":200}'; },
    close: async () => {}, onClose: () => () => {},
  }));
  machine.spawn = spawn;
  const state = 'b'.repeat(43);
  const close = await openLoginCallbackRelay(machine, '/guest/node', { port, path: '/auth/callback', state });
  try {
    const request = (query: string) => fetch(`http://localhost:${port}/auth/callback?${query}`);
    expect((await request('code=not-admitted&state=wrong')).status).toBe(400);
    expect(spawn).not.toHaveBeenCalled();
    const accepted = await request(`code=one-use&state=${state}`);
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).not.toContain('one-use');
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spawn.mock.calls[0])).not.toContain('one-use');
    expect(write).toHaveBeenCalledWith(`${JSON.stringify({ port, path: `/auth/callback?code=one-use&state=${state}` })}\n`);
    expect((await request(`code=replay&state=${state}`)).status).toBe(400);
    expect(spawn).toHaveBeenCalledTimes(1);
  } finally { await close(); }
  await expect(fetch(`http://localhost:${port}/auth/callback`)).rejects.toThrow();
});
