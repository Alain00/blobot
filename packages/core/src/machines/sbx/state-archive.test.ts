import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createStateArchiveVerifier } from './state-archive.js';
import { createSbxArchiveIndex, selectSbxArchiveMembers } from './state-archive-index.js';
import { readSbxStateTree } from './state-tree.js';

function header(name: string, size = 0, type = '0', link = ''): Buffer {
  const block = Buffer.alloc(512);
  block.write(name); block.write('0000644\0', 100); block.write('0000000\0', 108); block.write('0000000\0', 116);
  block.write(size.toString(8).padStart(11, '0') + '\0', 124);
  block.write('00000000000\0', 136); block.fill(32, 148, 156); block.write(type, 156); block.write(link, 157);
  block.write('ustar\0' + '00', 257);
  checksum(block);
  return block;
}
function checksum(block: Buffer) {
  block.fill(32, 148, 156);
  block.write(block.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0') + '\0 ', 148);
}
function extended(entries: [string, string][]): Buffer {
  const records = entries.map(([key, value]) => {
    const body = Buffer.from(` ${key}=${value}\n`);
    let length = body.length + 1;
    while (String(length).length + body.length !== length) length = String(length).length + body.length;
    return Buffer.concat([Buffer.from(String(length)), body]);
  });
  const data = Buffer.concat(records);
  return Buffer.concat([header('./PaxHeaders/member', data.length, 'x'), data, Buffer.alloc((512 - data.length % 512) % 512)]);
}
const root = (entries = 'Yfile\0\0') => Buffer.concat([extended([['GNU.dumpdir', entries]]), header('./', 0, '5')]);
const end = () => Buffer.alloc(1024);
function verify(bytes: Buffer, step = 19) {
  const verifier = createStateArchiveVerifier();
  for (let at = 0; at < bytes.length; at += step) verifier.write(bytes.subarray(at, at + step));
  verifier.finish();
}

describe('guest full-state PAX validation', () => {
  it('accepts fragmented complete archives, binary xattrs, sparse 0.0 fields and confined hardlinks', () => {
    verify(Buffer.concat([root('Yfile\0Yhardlink\0Ysymlink\0\0'), extended([['SCHILY.xattr.user.fixture', '\0\xff'], ['mtime', '1788635508.123456789'],
      ['GNU.sparse.size', '1048576'], ['GNU.sparse.numblocks', '2'], ['GNU.sparse.offset', '0'], ['GNU.sparse.numbytes', '0'],
      ['GNU.sparse.offset', '1048576'], ['GNU.sparse.numbytes', '0']]), header('./file'),
    header('./hardlink', 0, '1', './file'), header('./symlink', 0, '2', '/absolute/target'), end()]));
  });
  it('can be embedded without access to host filenames or module imports', () => {
    const create = runInNewContext(`(${createStateArchiveVerifier.toString()})`, { Buffer }) as typeof createStateArchiveVerifier;
    const verifier = create(); verifier.write(Buffer.concat([root(), header('./file'), end()])); verifier.finish();
  });
  it.each(['/etc/outside', './../outside', './a/../../outside', './a//file', './a/./file'])(
    'rejects member and hardlink escape %s before accepting the archive', name => {
      expect(() => verify(Buffer.concat([root(), header(name), end()]))).toThrow('archive is invalid');
      expect(() => verify(Buffer.concat([root(), header('./link', 0, '1', name), end()]))).toThrow('archive is invalid');
      expect(() => verify(Buffer.concat([root(), extended([['path', name]]), header('./file'), end()]))).toThrow('archive is invalid');
    });
  it.each(['Nexcluded\0\0', 'Rold\0Tnew\0\0', 'Y../outside\0\0', 'Yfile\0', '\0trailing'])(
    'rejects an incomplete or unsafe dumpdir', value => {
      expect(() => verify(Buffer.concat([extended([['GNU.dumpdir', value]]), header('./', 0, '5'), end()]))).toThrow('archive is invalid');
    });
  it('rejects an unsafe extended hardlink path and permits an absolute symlink', () => {
    const prefix = Buffer.concat([root('Ylink\0\0'), extended([['linkpath', '/outside']])]);
    expect(() => verify(Buffer.concat([prefix, header('./link', 0, '1'), end()]))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([prefix, header('./link', 0, '2'), end()]))).not.toThrow();
  });
  it('requires the full root and authoritative directory inventories', () => {
    expect(() => verify(Buffer.concat([header('./file'), end()]))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([header('./', 0, '5'), end()]))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([root(), header('./nested/', 0, '5'), end()]))).toThrow('archive is invalid');
  });
  it('rejects omitted members, unexpected members, duplicate members and wrong dumpdir types', () => {
    expect(() => verify(Buffer.concat([root(), end()]))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([root(), header('./unexpected'), end()]))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([root(), header('./file'), header('./file'), end()]))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([root('Dfile\0\0'), header('./file'), end()]))).toThrow('archive is invalid');
  });
  it('rejects corrupt checksums, truncated payloads, concatenated archives and nonzero padding', () => {
    const broken = header('./file'); broken[10] = 1;
    expect(() => verify(Buffer.concat([root(), broken, end()]))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([root(), header('./file', 1024), Buffer.alloc(512)]))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([root(), end(), root(), end()]))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([root(), header('./file', 1), Buffer.alloc(512, 1), end()]))).toThrow('archive is invalid');
  });
  it('bounds PAX metadata and refuses formats outside the worker contract', () => {
    expect(() => verify(header('./PaxHeaders/huge', 1024 * 1024 + 1, 'x'))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([root(), extended([['GNU.volume.filename', '/outside']]), header('./file'), end()]))).toThrow('archive is invalid');
    expect(() => verify(Buffer.concat([header('./global', 1, 'g'), Buffer.alloc(512), end()]))).toThrow('archive is invalid');
  });
});

describe('held guest archive process', () => {
  const data = () => Buffer.concat([root(), header('./file'), end()]);
  const commands = (bytes: Buffer, stderr = '', linger = false) => ({
    spawn: vi.fn(() => spawn(process.execPath, ['-e',
      "process.stdout.write(Buffer.from(process.argv[1], 'base64'), () => { process.stderr.write(process.argv[2]); if (process.argv[3] === 'yes') setInterval(() => {}, 1000); });",
      bytes.toString('base64'), stderr, linger ? 'yes' : 'no'], { stdio: ['ignore', 'pipe', 'pipe'] })),
  });
  const archives = { verify: createStateArchiveVerifier, index: createSbxArchiveIndex };

  it('streams verified bytes with backpressure and rechecks maintenance after its helper exits', async () => {
    const bytes = data(), held = vi.fn(), chunks: Buffer[] = [];
    const run = runInNewContext(`(${readSbxStateTree.toString()})`, { Buffer, setTimeout, clearTimeout }) as typeof readSbxStateTree;
    const result = await run({ commands: commands(bytes), crypto: { createHash } }, archives, {
      path: '/private-view', maxBytes: 10240, assertHeld: held,
      async emit(chunk) { await new Promise(resolve => setImmediate(resolve)); chunks.push(Buffer.from(chunk)); },
    });
    expect(Buffer.concat(chunks)).toEqual(bytes);
    expect(result.digest).toEqual({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    expect(result.members.size).toBe(2);
    expect(held).toHaveBeenCalledTimes(2);
  });

  it.each(['warning', 'truncated', 'bound', 'sink', 'lost maintenance'] as const)('refuses %s without private diagnostics', async kind => {
    const child = commands(kind === 'truncated' ? data().subarray(0, 1536) : data(), kind === 'warning' ? '/private/name' : '', kind === 'sink');
    let checks = 0;
    await expect(readSbxStateTree({ commands: child, crypto: { createHash } }, archives, {
      path: '/private-view', maxBytes: kind === 'bound' ? 1024 : 10240,
      assertHeld() { if (++checks === 2 && kind === 'lost maintenance') throw new Error('/private/changed'); },
      async emit() { if (kind === 'sink') throw new Error('/private/failed'); },
    })).rejects.toThrow('Machine state archive could not be verified.');
    const process = child.spawn.mock.results[0]?.value;
    expect(process?.exitCode !== null || process?.signalCode !== null).toBe(true);
  });
});

describe('guest archive restore selection', () => {
  const file = (name: string, text: string) => {
    const data = Buffer.from(text);
    return Buffer.concat([header(name, data.length), data, Buffer.alloc((512 - data.length % 512) % 512)]);
  };
  const index = (data: Buffer, step = 65536) => {
    const result = createSbxArchiveIndex(createStateArchiveVerifier, createHash);
    for (let at = 0; at < data.length; at += step) result.write(data.subarray(at, at + step));
    return result.finish();
  };
  const names = (value: Buffer | null) => value?.toString().split('\0').slice(0, -1);

  it('selects only changed files and the parent dumpdir needed to delete target-only children', () => {
    const source = index(Buffer.concat([root('Ychanged\0Ykeep\0\0'), file('./changed', 'new'), file('./keep', 'same'), end()]), 7);
    const target = index(Buffer.concat([root('Ychanged\0Ykeep\0Yextra\0\0'), file('./changed', 'old'), file('./keep', 'same'), file('./extra', 'delete'), end()]));
    expect(names(selectSbxArchiveMembers(source, target))).toEqual(['./', './changed']);
    expect(source.get('./keep')?.sha256).toEqual(target.get('./keep')?.sha256);
  });

  it('returns null for identical archives so an empty tar selector never restores everything', () => {
    const data = Buffer.concat([root(), file('./file', 'same'), end()]);
    expect(selectSbxArchiveMembers(index(data, 1), index(data, 521))).toBeNull();
  });

  it('relinks unchanged hardlink members when their referenced inode is replaced', () => {
    const archive = (text: string) => Buffer.concat([root('Yfile\0Ylink\0Ychain\0\0'), file('./file', text),
      header('./link', 0, '1', './file'), header('./chain', 0, '1', './link'), end()]);
    const source = index(archive('new')), target = index(archive('old'));
    expect(source.get('./link')?.sha256).toEqual(target.get('./link')?.sha256);
    expect(names(selectSbxArchiveMembers(source, target))).toEqual(['./', './file', './link', './chain']);
  });

  it('replays attribute-only changes with hardlinks and ancestors even when every PAX byte matches', () => {
    const source = index(Buffer.concat([root('Yfile\0Ylink\0Yother\0\0'), file('./file', 'same'),
      header('./link', 0, '1', './file'), file('./other', 'untouched'), end()]));
    expect(selectSbxArchiveMembers(source, source)).toBeNull();
    expect(names(selectSbxArchiveMembers(source, source, new Set(['./file'])))).toEqual(['./', './file', './link']);
    expect(() => selectSbxArchiveMembers(source, source, new Set(['./missing']))).toThrow('attribute path is missing');
  });

  it('preserves literal unusual names in the NUL-delimited selector', () => {
    const odd = ['-option', 'line\nbreak', ' leading\t ', 'back\\slash', 'literal[*]?', 'café'];
    const archive = (text: string) => Buffer.concat([root(odd.map(name => 'Y' + name + '\0').join('') + '\0'),
      ...odd.map(name => file('./' + name, text)), end()]);
    expect(names(selectSbxArchiveMembers(index(archive('new')), index(archive('old'))))).toEqual(['./', ...odd.map(name => './' + name)]);
  });

  it('includes metadata-only changes and retains directory spelling for tar selection', () => {
    const archive = (mtime: string) => Buffer.concat([root('Ddir\0\0'),
      extended([['GNU.dumpdir', '\0'], ['mtime', mtime]]), header('./dir/', 0, '5'), end()]);
    expect(names(selectSbxArchiveMembers(index(archive('1.000000001')), index(archive('1.000000002'))))).toEqual(['./', './dir/']);
  });

  it('does not release an inventory for a truncated or incomplete archive', () => {
    expect(() => index(Buffer.concat([root(), file('./file', 'value')]))).toThrow('archive is invalid');
    expect(() => index(Buffer.concat([root(), end()]))).toThrow('archive is invalid');
  });

  it('can serialize both guest factories without host imports', () => {
    const create = runInNewContext(`(${createSbxArchiveIndex.toString()})`, { Buffer }) as typeof createSbxArchiveIndex;
    const verify = runInNewContext(`(${createStateArchiveVerifier.toString()})`, { Buffer }) as typeof createStateArchiveVerifier;
    const result = create(verify, createHash);
    result.write(Buffer.concat([root(), file('./file', 'guest'), end()]));
    expect(result.finish().get('./file')?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => result.finish()).toThrow('inventory is invalid');
  });
});
