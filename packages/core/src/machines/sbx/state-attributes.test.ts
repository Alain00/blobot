import { runInNewContext } from 'node:vm';
import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createSbxStateAttributeCodec, createSbxStateAttributeBackend, type SbxInodeAttributes } from './state-attributes.js';
import { selectSbxArchiveMembers } from './state-archive-index.js';
import type { SbxStateDescription } from './state-description.js';

const member = (path: string, type = 48, link = '') => ({ path: Buffer.from(path, 'latin1'), type,
  link: Buffer.from(link, 'latin1'), sha256: 'a'.repeat(64) });
const attributes = (flags = 0, fsx = 0): SbxInodeAttributes => [0x80000 | flags, [fsx, 0, 0, 0, 0], (flags & 0x70).toString(16), '303874', []];
const codec = createSbxStateAttributeCodec();
const describeTree = (file: SbxInodeAttributes, type = 48): SbxStateDescription => ({
  members: new Map([['.', member('.', 53)], ['./file', member('./file', type)]]),
  attributes: codec.encode(new Map([['.', attributes()], ['./file', file]])),
});
const path = '/run/blobot-state-00000000-0000-0000-0000-000000000000/home';

describe('guest inode attribute coverage', () => {
  it('round-trips raw names, 64-bit masks and binary xattr names without process identity metadata', () => {
    const create = runInNewContext(`(${createSbxStateAttributeCodec.toString()})`, { Buffer }) as typeof createSbxStateAttributeCodec;
    const members = new Map([['.', member('.', 53)], ['./\xff\n', member('./\xff\n')]]);
    const values = new Map<string, SbxInodeAttributes>([
      ['.', attributes()], ['./\xff\n', ['enotty', 'enotty', '8000000000000000', '8000000000000000',
        [[Buffer.from('user.\xff', 'latin1').toString('base64'), 4, 'b'.repeat(64)]]]],
    ]);
    const bytes = create().encode(values);
    expect(create().encode(create().decode(bytes, members))).toEqual(bytes);
  });

  it.each([
    ['enotty', [0, 0, 0, 0, 0], '10', '203034', []],
    ['skipped', 'skipped', '0', '303874', []],
    [0x80000, [0, 0, 0, 0], '0', '303874', []],
    [0x80000, [0, 0, -1, 0, 0], '0', '303874', []],
    [0x80000, [0, 0, 0, 0, 0], '80', '70', []],
    [0x80000, [0, 0, 0, 0, 0], '00', '303874', []],
  ].map(value => ({ value })))('rejects partial API results or invented coverage', ({ value }) => {
    const tree = describeTree(attributes());
    const rows = JSON.parse(tree.attributes.toString()); rows[1] = [rows[1][0], ...value];
    expect(() => codec.decode(Buffer.from(JSON.stringify(rows)), tree.members)).toThrow('attributes could not be verified');
  });

  it('requires exact archive order, complete membership and sorted unique xattrs', () => {
    const tree = describeTree(attributes()), rows = JSON.parse(tree.attributes.toString());
    expect(() => codec.decode(Buffer.from(JSON.stringify(rows.slice(1))), tree.members)).toThrow();
    expect(() => codec.decode(Buffer.from(JSON.stringify(rows.toReversed())), tree.members)).toThrow();
    const value = [Buffer.from('user.x').toString('base64'), 1, 'a'.repeat(64)];
    rows[1][5] = [value, value];
    expect(() => codec.decode(Buffer.from(JSON.stringify(rows)), tree.members)).toThrow();
  });
});

describe('guest attribute restoration admission', () => {
  const noCommands = () => ({ spawn: vi.fn(() => { throw new Error('No mutation expected'); }) });

  it.each([
    [0, 0], [8, 32], [16, 8], [32, 16], [64, 128], [128, 64],
    [0x10000, 0], [0x20000, 0], [0x20000000, 512], [0x200300f8, 760],
  ])('admits the measured directory flags %s with corresponding FSX %s', (flags, fsx) => {
    const backend = createSbxStateAttributeBackend(noCommands(), codec, '');
    expect(() => backend.preflight(describeTree(attributes(flags, fsx), 53))).not.toThrow();
  });

  it('refuses unknown bits, inconsistent APIs and project state before streaming', () => {
    const backend = createSbxStateAttributeBackend(noCommands(), codec, '');
    expect(() => backend.preflight(describeTree(attributes(0x1000000)))).toThrow();
    expect(() => backend.preflight(describeTree(attributes(16, 0)))).toThrow();
    expect(() => backend.preflight(describeTree([0x80000, [0, 0, 0, 5, 0], '0', '303874', []]))).toThrow();
    expect(() => backend.preflight(describeTree(attributes(0x20000000, 512)))).toThrow();
  });

  it('selects equal-PAX attribute differences instead of declaring a no-op', () => {
    const backend = createSbxStateAttributeBackend(noCommands(), codec, '');
    const source = describeTree(attributes(16, 8)), target = describeTree(attributes());
    const plan = backend.plan(path, source, target, () => {});
    expect(plan.changed).toEqual(new Set(['./file']));
    expect(selectSbxArchiveMembers(source.members, target.members, plan.changed)?.toString()).toBe('./\0./file\0');
  });

  it.each([
    { value: ['enotty', 'enotty', '10', '203034', []] as SbxInodeAttributes, type: 48 },
    { value: ['skipped', 'skipped', '0', '303874', []] as SbxInodeAttributes, type: 50 },
    { value: ['skipped', 'skipped', '0', '303874', []] as SbxInodeAttributes, type: 54 },
  ])('refuses a rewritten inode with unqueried attributes before any helper starts', async ({ value, type }) => {
    const commands = noCommands(), backend = createSbxStateAttributeBackend(commands, codec, '');
    const source = describeTree(value, type), plan = backend.plan(path, source, source, () => {});
    expect(() => backend.preflight(source)).not.toThrow();
    await expect(plan.prepare(Buffer.from('./\0./file\0'))).rejects.toThrow('attributes could not be verified');
    expect(commands.spawn).not.toHaveBeenCalled();
  });

  it('permits an unchanged unqueried entry without turning its attributes into zeros', async () => {
    const source = describeTree(['enotty', 'enotty', '10', '203034', []]);
    const requests: unknown[] = [];
    const commands = { spawn: vi.fn((_command, _args, _options) => {
      const child = spawn(process.execPath, ['-e', "process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('true'));"], { stdio: ['pipe', 'pipe', 'pipe'] });
      const original = child.stdin.end.bind(child.stdin);
      child.stdin.end = ((bytes: Buffer) => { requests.push(JSON.parse(bytes.toString())); return original(bytes); }) as typeof child.stdin.end;
      return child;
    }) };
    const backend = createSbxStateAttributeBackend(commands, codec, 'unused');
    const plan = backend.plan(path, source, source, () => {});
    expect(plan.changed.size).toBe(0);
    await plan.prepare(null);
    expect(requests).toEqual([{ op: 'prepare', root: path, expected: [] }]);
  });
});
