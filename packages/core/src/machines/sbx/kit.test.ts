import { describe, expect, it } from 'vitest';
import { renderSbxKit, sbxKit, sbxNameFor } from './kit.js';

describe('a root blobot kit', () => {
  const options = { image: 'blobot-probe:fixture', guestNode: '/usr/bin/node', dataBytes: 1073741824, workspaceBytes: 2147483648 };

  it('declares exactly two private volumes without inheriting vendor grants or login', () => {
    const kit = sbxKit(options);
    expect(kit).not.toHaveProperty('extends');
    expect(kit.setup.install).toEqual([{ user: '0', command: 'chown 1000:1000 /home/agent /workspace && chmod 0700 /home/agent /workspace' }]);
    expect(kit.credentials).toEqual([]);
    expect(kit.permissions.network.allow).toEqual([]);
    expect(kit.volumes).toEqual([
      { path: '/home/agent', size: '1073741824', mode: '0700' },
      { path: '/workspace', size: '2147483648', mode: '0700' },
    ]);
    expect(JSON.parse(renderSbxKit(options))).toEqual(kit);
  });

  it('uses exact immutable Agent ids, never lossy team/name slugs', () => {
    expect(sbxNameFor('0198abcd-1111-7111-8111-000000000001')).toBe('blobot-0198abcd-1111-7111-8111-000000000001');
    expect(sbxNameFor('alice-1')).not.toBe(sbxNameFor('alice-2'));
    for (const id of ['Alice', 'alice/../bob', '', 'a'.repeat(97)]) expect(() => sbxNameFor(id)).toThrow();
  });

  it('requires explicit bounded volumes', () => {
    for (const size of [0, -1, Infinity, 512.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => sbxKit({ ...options, dataBytes: size })).toThrow();
    }
  });
});
