import { createServer } from 'node:net';
import { Server } from 'node:http';
import { afterEach } from 'vitest';

afterEach(() => vi.restoreAllMocks());
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

it.each(['EAFNOSUPPORT', 'EPROTONOSUPPORT', 'EADDRNOTAVAIL'])('keeps IPv4 callbacks when IPv6 is unavailable (%s)', async (code) => {
  const reserve = createServer();
  await new Promise<void>((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const address = reserve.address();
  if (address === null || typeof address === 'string') throw new Error('No test port');
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  const listen = Server.prototype.listen;
  vi.spyOn(Server.prototype, 'listen').mockImplementation(function (this: Server, ...args) {
    if (args.includes('::1')) {
      queueMicrotask(() => this.emit('error', Object.assign(new Error('IPv6 unavailable'), { code })));
      return this;
    }
    return listen.apply(this, args);
  });
  const machine = new LocalMachine({ agentId: 'callback-fixture', workspacePath: '/tmp' });
  const close = await openLoginCallbackRelay(machine, '/guest/node', { port: address.port, path: '/auth/callback', state: 'a'.repeat(43) });
  try { expect((await fetch(`http://127.0.0.1:${address.port}/auth/callback`)).status).toBe(400); }
  finally { await close(); }
});

it('refuses an occupied IPv6 callback port and closes its IPv4 listener', async () => {
  const reserve = createServer();
  await new Promise<void>((resolve) => reserve.listen(0, '::1', resolve));
  const address = reserve.address();
  if (address === null || typeof address === 'string') throw new Error('No test port');
  try {
    const machine = new LocalMachine({ agentId: 'callback-fixture', workspacePath: '/tmp' });
    await expect(openLoginCallbackRelay(machine, '/guest/node', { port: address.port, path: '/auth/callback', state: 'a'.repeat(43) }))
      .rejects.toThrow('port is in use');
    await expect(fetch(`http://127.0.0.1:${address.port}/auth/callback`)).rejects.toThrow();
  } finally { await new Promise<void>((resolve) => reserve.close(() => resolve())); }
});
