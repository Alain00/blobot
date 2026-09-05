import type { FoundPicture } from '../acp/pictures.js';
import type { SessionUpdate } from '../acp/wire.js';

/**
 * Codex's own place for a picture, which is not ACP's.
 *
 * `.scratch/agent-media/01` measured one turn against four runtimes and Codex was the only one to
 * put a picture **nowhere in ACP's envelope**: `content` carries the text and the image lives in
 * `rawOutput.result.content`, which is MCP's own result shape passed straight through. So the
 * shared canonical reader finds nothing and this is the adapter's half, which is exactly the split
 * `adapters/acp/` exists to make -- the first measured case where it does not cover something.
 *
 * If a later Codex starts sending it canonically as well, `PictureWatch.from` merges the two by
 * bytes and the count does not change. That is asserted rather than hoped for.
 */
export function picturesInRawOutput(update: SessionUpdate): FoundPicture[] {
  const content = (update.rawOutput as { readonly result?: { readonly content?: unknown } } | undefined)
    ?.result?.content;
  if (!Array.isArray(content)) return [];
  const found: FoundPicture[] = [];
  for (const block of content as readonly { type?: string; data?: string }[]) {
    if (block.type !== 'image') continue;
    const encoded = block.data;
    if (encoded === undefined || encoded === '') continue;
    found.push({
      data: Uint8Array.from(Buffer.from(encoded, 'base64')),
      key: encoded,
      ...(update.toolCallId === undefined ? {} : { toolCallId: update.toolCallId }),
    });
  }
  return found;
}
