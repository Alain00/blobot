import { describe, expect, it } from 'vitest';
import { acceptsOf, contentBlockOf } from './attachments.js';

describe('what an ACP agent says it takes', () => {
  it('reads the capability both runtimes actually advertise', () => {
    // Observed on this machine: the Claude bridge 0.70.0 and OpenCode 1.18.4 both send this.
    expect(acceptsOf({ promptCapabilities: { image: true, embeddedContext: true } })).toEqual({
      images: true,
      textFiles: true,
    });
  });

  it('treats silence as no', () => {
    // The spec says everything past text and `resource_link` is opt-in. A composer that offers
    // a paperclip against a silent runtime is offering a refusal.
    expect(acceptsOf(undefined)).toEqual({ images: false, textFiles: false });
    expect(acceptsOf({ loadSession: true })).toEqual({ images: false, textFiles: false });
    expect(acceptsOf({ promptCapabilities: { image: true } })).toEqual({
      images: true,
      textFiles: false,
    });
  });
});

describe('an attachment as a content block', () => {
  const bytes = new Uint8Array([104, 105]); // "hi"

  it('embeds an image, and never links one', () => {
    const block = contentBlockOf({ kind: 'image', mimeType: 'image/png', data: bytes });
    expect(block).toEqual({ type: 'image', mimeType: 'image/png', data: 'aGk=' });
  });

  it('gives a pasted image no name, rather than an invented one', () => {
    // A made-up `pasted-image-1.png` is a filename for a file that exists nowhere under it,
    // and the agent will repeat it back.
    expect(contentBlockOf({ kind: 'image', mimeType: 'image/png', data: bytes })).not.toHaveProperty(
      'uri',
    );
    expect(
      contentBlockOf({ kind: 'image', mimeType: 'image/png', data: bytes, name: 'shot.png' }),
    ).toMatchObject({ uri: 'attachment:///shot.png' });
  });

  it('embeds a text file with its name, because the schema demands a uri and a wall of code needs one', () => {
    expect(
      contentBlockOf({ kind: 'text', mimeType: 'text/plain', data: bytes, name: 'notes.md' }),
    ).toEqual({
      type: 'resource',
      resource: { uri: 'attachment:///notes.md', mimeType: 'text/plain', text: 'hi' },
    });
  });

  it('says attachment: and not file:, because there is no file at that location', () => {
    const block = contentBlockOf({
      kind: 'text',
      mimeType: 'text/plain',
      data: bytes,
      name: 'notes.md',
    }) as { resource: { uri: string } };
    expect(block.resource.uri.startsWith('file:')).toBe(false);
  });
});
