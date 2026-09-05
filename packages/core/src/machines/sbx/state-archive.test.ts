import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createStateArchiveVerifier } from './state-archive.js';

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
