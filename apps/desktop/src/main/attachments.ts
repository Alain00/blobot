import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import {
  IMAGE_ATTACHMENT_LIMIT,
  TEXT_ATTACHMENT_LIMIT,
  attachmentNotSupported,
  attachmentTooLarge,
  uuidv7,
} from '@blobot/core';
import type { AttachmentKind } from '@blobot/core/domain';
import type { AttachmentContent } from '@blobot/core';

/**
 * Picking a file up, on the side of the app that is allowed to read one.
 *
 * The renderer never touches the filesystem: the paperclip and a drop both send a **path**, and
 * this reads it, so the two checks below happen before any bytes cross the process boundary. A
 * paste is the exception by necessity — there is no path — and its bytes arrive already in hand
 * and take exactly the same checks.
 *
 * Both checks run **here, at pickup**, and never at send. That is the difference between a rule
 * and a trap: nobody writes a paragraph against a file that was never going to travel.
 */

/**
 * The image types worth naming. `image/*` would let a `.svg` through, which is a script that a
 * runtime may or may not rasterise, and a `.tiff`, which no provider takes.
 */
const IMAGE_TYPES = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
]);

/**
 * What blobot will read as text, by extension.
 *
 * A list and not a sniff: "is this file text" is a guess, and a guess that says yes to a binary
 * hands a runtime a screenful of replacement characters. An extension is the user's own claim
 * about what they made.
 */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.yaml', '.yml', '.toml',
  '.log', '.diff', '.patch', '.html', '.css', '.scss', '.xml', '.sql', '.sh', '.bash', '.zsh',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp',
  '.cs', '.php', '.swift', '.lua', '.ini', '.conf', '.env', '.gitignore',
]);

export type PickedUp = { readonly attachment: AttachmentContent } | { readonly error: string };

/** A path, from the paperclip or from a drop. */
export async function attachmentFromPath(path: string, now: number): Promise<PickedUp> {
  const name = basename(path);
  const kind = kindOf(path);
  if (kind === undefined) return { error: attachmentNotSupported(name) };
  // Measured before it is read: refusing a 900 MB video should not mean loading one first.
  const size = (await stat(path)).size;
  const refusal = checkSize(kind, name, size);
  if (refusal !== undefined) return { error: refusal };
  const data = new Uint8Array(await readFile(path));
  return {
    attachment: {
      id: uuidv7(now),
      kind,
      mimeType: mimeOf(path, kind),
      name,
      bytes: data.byteLength,
      data,
      at: now,
    },
  };
}

/**
 * Bytes from the clipboard, which is the case with no path and no filename.
 *
 * It is given none. An invented `pasted-image-1.png` is a filename in an agent's context for a
 * file that exists nowhere under it, and the agent will repeat it back.
 */
export function attachmentFromBytes(
  data: Uint8Array,
  mimeType: string,
  now: number,
  name?: string,
): PickedUp {
  const kind: AttachmentKind | undefined = mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('text/')
      ? 'text'
      : undefined;
  if (kind === undefined || (kind === 'image' && ![...IMAGE_TYPES.values()].includes(mimeType))) {
    return { error: attachmentNotSupported(name ?? 'that') };
  }
  const refusal = checkSize(kind, name ?? 'the pasted image', data.byteLength);
  if (refusal !== undefined) return { error: refusal };
  return {
    attachment: {
      id: uuidv7(now),
      kind,
      mimeType,
      bytes: data.byteLength,
      data,
      at: now,
      ...(name === undefined ? {} : { name }),
    },
  };
}

/**
 * The two ceilings, applied.
 *
 * An image is measured in bytes and a text file in characters, because those are the units the
 * two costs are actually in. Never a truncation: half a text file with no marker is worse here
 * than in a peer message, because the other half was a thing the user could see.
 */
function checkSize(kind: AttachmentKind, name: string, bytes: number): string | undefined {
  const limit = kind === 'image' ? IMAGE_ATTACHMENT_LIMIT : TEXT_ATTACHMENT_LIMIT;
  return bytes > limit ? attachmentTooLarge(name, bytes, limit) : undefined;
}

function kindOf(path: string): AttachmentKind | undefined {
  const extension = extname(path).toLowerCase();
  if (IMAGE_TYPES.has(extension)) return 'image';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  return undefined;
}

function mimeOf(path: string, kind: AttachmentKind): string {
  const extension = extname(path).toLowerCase();
  return kind === 'image' ? (IMAGE_TYPES.get(extension) ?? 'image/png') : 'text/plain';
}

/** An image for the renderer to draw, which is the one thing it is handed bytes for. */
export function dataUrlOf(attachment: AttachmentContent): string | undefined {
  if (attachment.kind !== 'image') return undefined;
  return `data:${attachment.mimeType};base64,${Buffer.from(attachment.data).toString('base64')}`;
}
