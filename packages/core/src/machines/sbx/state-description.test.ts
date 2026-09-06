import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { createSbxStateDescriptionCodec } from './state-description.js';

const row = (path: string, type = 48, link = '') => [Buffer.from(path, 'latin1').toString('base64'), type, Buffer.from(link, 'latin1').toString('base64'), 'a'.repeat(64)];
const data = (rows: unknown[]) => Buffer.from(JSON.stringify([1, rows, Buffer.from([0, 255, 10]).toString('base64')]));

describe('guest state description', () => {
  it('round-trips raw names, symlinks, hardlinks and opaque attributes in an isolated bootstrap', () => {
    const create = runInNewContext(`(${createSbxStateDescriptionCodec.toString()})`, { Buffer }) as typeof createSbxStateDescriptionCodec;
    const codec = create();
    const bytes = data([row('.', 53), row('./dir', 53), row('./dir/\xff\nfile'), row('./hardlink', 49, './dir/\xff\nfile'), row('./link', 50, '/absolute/target')]);
    const result = codec.decode(bytes);
    expect(codec.encode(result)).toEqual(bytes);
    expect(result.members.get('./dir/\xff\nfile')?.path).toEqual(Buffer.from('./dir/\xff\nfile', 'latin1'));
    expect(result.attributes).toEqual(Buffer.from([0, 255, 10]));
  });

  it.each([
    [row('./file')], [row('.', 48)], [row('.', 53), row('./../escape')],
    [row('.', 53), row('./parent/child')], [row('.', 53), row('./file'), row('./file')],
    [row('.', 53), row('./link', 49, './missing')], [row('.', 53), row('./link', 49, '.')],
    [row('.', 53), row('./link', 50, 'bad\0target')], [row('.', 53), row('./file', 48, '/link')],
  ].map(rows => ({ rows })))('rejects an incomplete or unsafe manifest before restoration', ({ rows }) => {
    expect(() => createSbxStateDescriptionCodec().decode(data(rows))).toThrow('description is invalid');
  });

  it('rejects malformed JSON and noncanonical base64 without echoing private contents', () => {
    const codec = createSbxStateDescriptionCodec();
    expect(() => codec.decode(Buffer.from('private invalid'))).toThrow('Machine state description is invalid.');
    expect(() => codec.decode(data([['Lg==\n', 53, '', 'a'.repeat(64)]]))).toThrow('Machine state description is invalid.');
  });
});
