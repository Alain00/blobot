import { describe, expect, it } from 'vitest';
import { PICTURE_LIMIT, measurePicture, pictureNotDrawnBecause } from './pictures.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

describe('measuring a picture rather than believing one', () => {
  it('reads a PNG', () => {
    expect(measurePicture(PNG)).toEqual({ mimeType: 'image/png', width: 1, height: 1 });
  });

  it('reads a GIF', () => {
    expect(measurePicture(GIF)).toEqual({ mimeType: 'image/gif', width: 1, height: 1 });
  });

  it('reads a JPEG by walking to its frame header', () => {
    // Hand-built rather than fetched: `SOI`, one application segment to walk past, then `SOF0`
    // carrying 8 by 16. The walk is the decode check, so it has to be exercised on a real shape.
    const jpeg = Buffer.from([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x08, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(measurePicture(jpeg)).toEqual({ mimeType: 'image/jpeg', width: 8, height: 16 });
  });

  it('answers nothing for a PNG that stopped before its header', () => {
    // This is what makes `its bytes did not arrive whole` a measurement. A truncated file keeps
    // its signature, so believing the signature is exactly the mistake.
    expect(measurePicture(PNG.subarray(0, 12))).toBeUndefined();
  });

  it('answers nothing for prose', () => {
    expect(measurePicture(new TextEncoder().encode('I took a screenshot.'))).toBeUndefined();
  });
});

describe("the reasons, in blobot's words", () => {
  it('never names a mechanism, a status or a mime type', () => {
    const said = (
      ['unreadable', 'not_a_picture', 'too_large', 'not_kept', 'bytes_gone'] as const
    ).map(pictureNotDrawnBecause);
    for (const sentence of said) {
      expect(sentence).not.toMatch(/error|failed|invalid|unsupported|image\/|base64|—/i);
      // No apology: the line reports, it does not perform regret.
      expect(sentence).not.toMatch(/sorry|could not be|unfortunately/i);
    }
    expect(new Set(said).size).toBe(5);
  });
});

describe('the ceiling', () => {
  it('is generous, because a full page at retina width is routinely past four megabytes', () => {
    // Its own constant with its own argument, never `IMAGE_ATTACHMENT_LIMIT`, whose reasoning is
    // about what a provider accepts on one stdin line and nothing here crosses a wire.
    expect(PICTURE_LIMIT).toBeGreaterThan(4_000_000);
  });
});
