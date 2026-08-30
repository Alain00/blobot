import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attachmentFromBytes, attachmentFromPath, dataUrlOf } from './attachments.js';

const dir = await mkdtemp(join(tmpdir(), 'blobot-attachments-'));
const write = async (name: string, bytes: number | string): Promise<string> => {
  const path = join(dir, name);
  await writeFile(path, typeof bytes === 'string' ? bytes : Buffer.alloc(bytes));
  return path;
};

describe('picking a file up', () => {
  it('takes an image and a text file, and nothing else', async () => {
    expect(await attachmentFromPath(await write('shot.png', 8), 0)).toMatchObject({
      attachment: { kind: 'image', mimeType: 'image/png', name: 'shot.png', bytes: 8 },
    });
    expect(await attachmentFromPath(await write('notes.md', 'hello'), 0)).toMatchObject({
      attachment: { kind: 'text', name: 'notes.md', bytes: 5 },
    });
    // A PDF is protocol-legal to embed and there is no evidence either runtime does anything
    // with it, so it is refused by name rather than dropped in silence.
    expect(await attachmentFromPath(await write('spec.pdf', 8), 0)).toEqual({
      error: 'spec.pdf is not an image or a text file, and blobot can only send those two.',
    });
  });

  it('refuses a file over the line, naming the size and the limit', async () => {
    const refusal = await attachmentFromPath(await write('huge.png', 5_000_000), 0);
    expect(refusal).toEqual({
      error:
        'huge.png is 5.0 MB and the limit is 4.0 MB. ' +
        'blobot sends the file as it is, so a smaller one is the only way through.',
    });

    // Never a truncation. Half a text file with no marker is worse here than in a peer message,
    // because the other half was a thing the user could see.
    const long = await attachmentFromPath(await write('long.md', 'x'.repeat(60_000)), 0);
    expect(long).toMatchObject({ error: expect.stringContaining('the limit is 50 KB') });
  });

  it('leaves a pasted image unnamed rather than inventing a filename', () => {
    const picked = attachmentFromBytes(new Uint8Array([1, 2]), 'image/png', 7);
    expect(picked).toEqual({
      attachment: {
        id: expect.any(String),
        kind: 'image',
        mimeType: 'image/png',
        bytes: 2,
        data: new Uint8Array([1, 2]),
        at: 7,
      },
    });
  });

  it('refuses pasted bytes of a kind blobot does not send', () => {
    expect(attachmentFromBytes(new Uint8Array([1]), 'image/svg+xml', 0, 'logo.svg')).toEqual({
      error: 'logo.svg is not an image or a text file, and blobot can only send those two.',
    });
  });

  it('makes a picture only for an image', async () => {
    const image = await attachmentFromPath(await write('a.png', 2), 0);
    const text = await attachmentFromPath(await write('a.md', 'hi'), 0);
    expect('attachment' in image && dataUrlOf(image.attachment)).toBe('data:image/png;base64,AAA=');
    expect('attachment' in text && dataUrlOf(text.attachment)).toBe(undefined);
  });
});
