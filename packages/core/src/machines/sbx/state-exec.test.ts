import { Script } from 'node:vm';
import { expect, it } from 'vitest';
import { prepareSbxStateExec, sbxStateExecSource } from './state-exec.js';

const options = { name: 'owned-box', guestNode: '/usr/bin/node', token: '00000000-0000-0000-0000-000000000000', role: 'source' as const, maximumTreeBytes: 1024 ** 3 };

it('serializes the real guest stack within Linux single-argument limits and keeps configuration outside code', () => {
  const source = sbxStateExecSource();
  expect(() => new Script(source)).not.toThrow();
  expect(Buffer.byteLength(source)).toBeLessThan(128 * 1024 - 1);
  const args = prepareSbxStateExec(options);
  expect(args.slice(0, 10)).toEqual(['exec', '-i', '-u', '0', 'owned-box', '/usr/bin/unshare', '--mount', '--propagation', 'private', '/usr/bin/node']);
  expect(args[11]).toBe(source);
  expect(JSON.parse(args[12]!)).toEqual({ token: options.token, role: 'source', maximumTreeBytes: 1024 ** 3 });
});

it('rejects unsafe or invalid guest configurations before starting an exec', () => {
  expect(() => prepareSbxStateExec({ ...options, name: '--other' })).toThrow();
  expect(() => prepareSbxStateExec({ ...options, guestNode: 'node' })).toThrow();
  expect(() => prepareSbxStateExec({ ...options, maximumTreeBytes: Infinity })).toThrow();
  expect(() => prepareSbxStateExec({ ...options, token: '../other' })).toThrow();
});
