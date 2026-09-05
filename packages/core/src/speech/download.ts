import { createHash } from 'node:crypto';
import { mkdir, open, rename, rm, stat, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * A verified download (ticket 09): streamed to `<file>.part`, hashed as it is written,
 * resumable with `Range` from whatever the `.part` already holds, renamed into place only when
 * the hash matches. Nothing is run or loaded unverified.
 *
 * Node's `fetch`, no PTY: nothing here is a vendor's installer drawing its own bar, and the
 * one live PTY is for signing in.
 */
export interface DownloadRequest {
  readonly url: string;
  readonly sha256: string;
  /** Where the verified file ends up. The `.part` sits beside it. */
  readonly to: string;
  /** The size, when known, so the figure can say `412 MB of 574 MB` before the first byte. */
  readonly bytes?: number;
  readonly onProgress?: (received: number, total: number | undefined) => void;
  readonly signal?: AbortSignal;
  /** `chmod 755` on the result: a binary written by `fs` is not executable until it is. */
  readonly executable?: boolean;
  readonly fetch?: typeof fetch;
}

export type DownloadOutcome =
  | { readonly ok: true; readonly bytes: number }
  /** The `.part` is kept: retry resumes from it. */
  | { readonly ok: false; readonly kind: 'network'; readonly error: string; readonly received: number }
  /** The `.part` is deleted, because it was wrong. */
  | { readonly ok: false; readonly kind: 'checksum'; readonly error: string }
  /** The caller cancelled; the `.part` is deleted, because cancel means *not this*. */
  | { readonly ok: false; readonly kind: 'cancelled' };

export const CHECKSUM_MISMATCH = 'checksum did not match · deleted · try again';

export async function downloadVerified(request: DownloadRequest): Promise<DownloadOutcome> {
  const part = `${request.to}.part`;
  const doFetch = request.fetch ?? fetch;
  await mkdir(dirname(request.to), { recursive: true });

  // What is already there is hashed before a byte is asked for, so a resumed download ends
  // with the whole file's hash and not the tail's.
  const hash = createHash('sha256');
  let received = 0;
  const held = await stat(part).catch(() => undefined);
  if (held !== undefined && held.size > 0) {
    const handle = await open(part, 'r');
    try {
      for await (const chunk of handle.createReadStream()) hash.update(chunk as Buffer);
    } finally {
      await handle.close();
    }
    received = held.size;
  }
  if (request.bytes !== undefined && received > request.bytes) {
    await rm(part, { force: true });
    received = 0;
  }

  let response: Response;
  try {
    response = await doFetch(request.url, {
      headers: received > 0 ? { Range: `bytes=${received}-` } : {},
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      redirect: 'follow',
    });
  } catch (error) {
    if (request.signal?.aborted === true) return cancelled(part);
    return { ok: false, kind: 'network', error: describe(error), received };
  }

  // A server that ignores `Range` answers 200 with the whole file; start over in that case.
  let append = received > 0 && response.status === 206;
  if (received > 0 && response.status === 200) {
    received = 0;
    append = false;
  }
  if (!response.ok || response.body === null) {
    return { ok: false, kind: 'network', error: `${response.status} ${response.statusText}`.trim(), received };
  }
  const total = totalOf(response, received, request.bytes);
  const freshHash = append ? hash : createHash('sha256');

  let out: Awaited<ReturnType<typeof open>> | undefined;
  try {
    out = await open(part, append ? 'a' : 'w');
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      request.signal?.throwIfAborted();
      // Await disk writes too: ENOSPC must reject the download, never emit an unhandled
      // stream error or leave a promise waiting forever for a drain that cannot happen.
      await out.writeFile(chunk);
      freshHash.update(chunk);
      received += chunk.byteLength;
      request.onProgress?.(received, total);
    }
    request.signal?.throwIfAborted();
    await out.close();
    out = undefined;
  } catch (error) {
    await out?.close().catch(() => {});
    if (request.signal?.aborted === true) return cancelled(part);
    // A failed write can be partial. Resume from bytes actually on disk, not bytes fetched.
    return { ok: false, kind: 'network', error: describe(error), received: (await stat(part).catch(() => undefined))?.size ?? 0 };
  }

  if ((request.bytes !== undefined && received !== request.bytes) || freshHash.digest('hex') !== request.sha256.toLowerCase()) {
    await rm(part, { force: true });
    return { ok: false, kind: 'checksum', error: CHECKSUM_MISMATCH };
  }
  await rename(part, request.to);
  if (request.executable === true) await chmod(request.to, 0o755);
  return { ok: true, bytes: received };
}

async function cancelled(part: string): Promise<DownloadOutcome> {
  await rm(part, { force: true });
  return { ok: false, kind: 'cancelled' };
}

function totalOf(response: Response, offset: number, known: number | undefined): number | undefined {
  const range = response.headers.get('content-range');
  const fromRange = range === null ? undefined : Number(range.split('/')[1]);
  if (fromRange !== undefined && Number.isFinite(fromRange)) return fromRange;
  const length = response.headers.get('content-length');
  if (length !== null && Number.isFinite(Number(length))) return offset + Number(length);
  return known;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
