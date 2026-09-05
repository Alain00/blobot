/**
 * A **Picture**: something an Agent showed the user, or something blobot caught it being handed.
 *
 * `.scratch/agent-media/`, tickets 03, 09 and 10. The word is the one that map settled on, and
 * the two sources are named because half of these were not *shown* by anybody: a `shown` Picture
 * was handed over deliberately, a `observed` one was lifted out of a tool result blobot was
 * watching and the agent's own model may never have seen it.
 *
 * Everything here is pure arithmetic and blobot's own words, so `@blobot/core/domain` can hold it
 * and the renderer can draw a refusal without learning that SQLite exists.
 */

/** Which of the two ways a Picture reached blobot, and therefore which frame it gets. */
export type PictureSource = 'shown' | 'observed';

/**
 * The ceiling on one Picture, in bytes, and the app's **first disk bound**.
 *
 * Its own constant rather than `IMAGE_ATTACHMENT_LIMIT`, on ticket 09's argument: that number is
 * about what a provider accepts and what fits on one stdin line, and nothing here crosses a wire.
 * The question this one answers is what a screenshot of a screen actually weighs, so it is set
 * generously — a full-page capture at retina width is routinely past 4 MB, and refusing it would
 * refuse the ordinary case.
 */
export const PICTURE_LIMIT = 24_000_000;

/**
 * Why a Picture is not on screen.
 *
 * Five, and the first deliberately merges three mechanisms: a reader cannot act differently on
 * *truncated* than on *corrupt*, and naming the mechanism would be the protocol enum this repo
 * bans in the same breath as `turn stopped · the context window is full`. What a reader actually
 * needs is only ever whether the picture is gone or whether blobot chose not to keep it.
 */
export type PictureNotDrawn =
  /** Truncated, corrupt, or it would not decode. */
  | 'unreadable'
  /** A PDF, a video, anything blobot has no way to draw. */
  | 'not_a_picture'
  /** Past `PICTURE_LIMIT`. Observed only: a shown one is refused in words at the tool. */
  | 'too_large'
  /** The store would not take it. */
  | 'not_kept'
  /** The row is here on a later replay and the bytes are not. */
  | 'bytes_gone';

/**
 * That reason, in blobot's words.
 *
 * Never a protocol enum, never a mime type, never *failed*, *error* or *invalid*, and never an
 * apology: the line reports, it does not perform regret. The same shape as `stoppedBecause`.
 */
export function pictureNotDrawnBecause(reason: PictureNotDrawn): string {
  switch (reason) {
    case 'unreadable':
      return 'its bytes did not arrive whole';
    case 'not_a_picture':
      return 'it is not a picture blobot can draw';
    case 'too_large':
      return 'it is larger than blobot will keep';
    case 'not_kept':
      return 'blobot could not keep it';
    case 'bytes_gone':
      return 'its bytes are gone';
  }
}

/** What a Picture turned out to be, once its bytes were looked at rather than believed. */
export interface PictureMeasurement {
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
}

/**
 * What the bytes actually are, read out of the header.
 *
 * The runtime's `mimeType` is a claim and this is the check, which is what makes `unreadable` a
 * measured state rather than a guess: a truncated PNG has a signature and no `IHDR`, and a text
 * block that was never an image has neither. `undefined` means blobot could not read it and will
 * say so, which is the whole of ticket 10's first row.
 *
 * Four kinds, matching `main/attachments.ts`'s inbound list for the same reason it gives: `image/*`
 * would admit an SVG, which is a script, and a TIFF, which nothing draws.
 */
export function measurePicture(data: Uint8Array): PictureMeasurement | undefined {
  return png(data) ?? jpeg(data) ?? gif(data) ?? webp(data);
}

function png(data: Uint8Array): PictureMeasurement | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 24 || !signature.every((byte, index) => data[index] === byte)) return undefined;
  // `IHDR` is always the first chunk, so its absence is a file that stopped before it began.
  if (String.fromCharCode(...data.subarray(12, 16)) !== 'IHDR') return undefined;
  return { mimeType: 'image/png', width: uint32(data, 16), height: uint32(data, 20) };
}

/**
 * JPEG, by walking the segment markers to the frame header.
 *
 * There is no fixed offset: the dimensions live in whichever `SOF` marker the encoder used, after
 * however many application and quantisation segments came first. Walking it is also the decode
 * check — a truncated file runs off the end and answers `undefined`.
 */
function jpeg(data: Uint8Array): PictureMeasurement | undefined {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return undefined;
    const marker = data[offset + 1] ?? 0;
    // The frame headers, minus the four that are not frames at all (`DHT`, `JPG`, `DAC`, and the
    // restart markers), which is why this is a list rather than a range.
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        mimeType: 'image/jpeg',
        height: uint16(data, offset + 5),
        width: uint16(data, offset + 7),
      };
    }
    offset += 2 + uint16(data, offset + 2);
  }
  return undefined;
}

function gif(data: Uint8Array): PictureMeasurement | undefined {
  const header = String.fromCharCode(...data.subarray(0, 6));
  if (data.length < 10 || (header !== 'GIF87a' && header !== 'GIF89a')) return undefined;
  return {
    mimeType: 'image/gif',
    width: uint16le(data, 6),
    height: uint16le(data, 8),
  };
}

/** WebP, lossy and lossless both, which are three different chunk layouts under one signature. */
function webp(data: Uint8Array): PictureMeasurement | undefined {
  if (data.length < 30) return undefined;
  if (String.fromCharCode(...data.subarray(0, 4)) !== 'RIFF') return undefined;
  if (String.fromCharCode(...data.subarray(8, 12)) !== 'WEBP') return undefined;
  const chunk = String.fromCharCode(...data.subarray(12, 16));
  if (chunk === 'VP8 ') {
    return { mimeType: 'image/webp', width: uint16le(data, 26) & 0x3fff, height: uint16le(data, 28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    // 14 bits of width then 14 of height, packed little-endian after the one-byte signature.
    const bits = uint32le(data, 21);
    return {
      mimeType: 'image/webp',
      width: (bits % 0x4000) + 1,
      height: (Math.floor(bits / 0x4000) % 0x4000) + 1,
    };
  }
  if (chunk === 'VP8X') {
    return {
      mimeType: 'image/webp',
      width: uint24le(data, 24) + 1,
      height: uint24le(data, 27) + 1,
    };
  }
  return undefined;
}

const byte = (data: Uint8Array, at: number): number => data[at] ?? 0;
const uint16 = (data: Uint8Array, at: number): number => (byte(data, at) << 8) | byte(data, at + 1);
const uint16le = (data: Uint8Array, at: number): number => byte(data, at) | (byte(data, at + 1) << 8);
const uint24le = (data: Uint8Array, at: number): number =>
  byte(data, at) | (byte(data, at + 1) << 8) | (byte(data, at + 2) << 16);
const uint32 = (data: Uint8Array, at: number): number =>
  (byte(data, at) * 0x1000000) + ((byte(data, at + 1) << 16) | (byte(data, at + 2) << 8) | byte(data, at + 3));
// Arithmetic rather than `|` for the high byte: a bitwise or coerces to a signed 32-bit integer,
// which turns a perfectly ordinary large value negative.
const uint32le = (data: Uint8Array, at: number): number =>
  byte(data, at) +
  byte(data, at + 1) * 0x100 +
  byte(data, at + 2) * 0x10000 +
  byte(data, at + 3) * 0x1000000;
