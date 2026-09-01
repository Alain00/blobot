/**
 * The slice of a WebSocket the remote Transcribers use, so a test can hand them a fake and
 * main can hand them Node's own. Node 22+ ships a WHATWG `WebSocket` (undici's) whose
 * constructor takes a `headers` bag, which is how a key rides on the upgrade.
 */
export interface SocketLike {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
  addEventListener(type: 'close', listener: (event: { readonly code: number; readonly reason: string }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
}

export type SocketFactory = (url: string, headers: Record<string, string>) => SocketLike;

/** Node's global WebSocket, with the headers undici accepts on the constructor. */
export const nodeSocket: SocketFactory = (url, headers) => {
  const Ctor = (globalThis as { WebSocket?: new (url: string, options?: unknown) => SocketLike }).WebSocket;
  if (Ctor === undefined) throw new Error('no WebSocket in this runtime');
  return new Ctor(url, { headers });
};

/** How much may sit unsent on the socket before a chunk is dropped rather than queued. */
export const SOCKET_BACKLOG_LIMIT = 256 * 1024;

/** Wait for `open`, or fail with the first error/close. */
export function opened(socket: SocketLike, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out opening the connection')), timeoutMs);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('the connection failed'));
    });
    socket.addEventListener('close', (event) => {
      clearTimeout(timer);
      reject(new Error(`closed before opening · ${event.code} ${event.reason}`.trim()));
    });
  });
}

/** Text out of a message event, whatever the runtime wrapped it in. */
export function textOf(data: unknown): string | undefined {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data as Uint8Array);
  return undefined;
}

/**
 * 16 kHz to 24 kHz, for the one provider whose live path takes only 24 kHz (OpenAI). Linear:
 * two samples in, three out, which for speech at these rates is well inside what the model
 * hears. Whole samples only; a trailing odd sample is carried to the next call by the caller.
 */
export function resample16to24(pcm: Int16Array): Int16Array {
  const pairs = Math.floor(pcm.length / 2);
  const out = new Int16Array(pairs * 3);
  for (let i = 0; i < pairs; i += 1) {
    const a = pcm[2 * i] as number;
    const b = pcm[2 * i + 1] as number;
    const next = 2 * i + 2 < pcm.length ? (pcm[2 * i + 2] as number) : b;
    out[3 * i] = a;
    out[3 * i + 1] = Math.round(a + (b - a) * (2 / 3));
    out[3 * i + 2] = Math.round(b + (next - b) * (1 / 3));
  }
  return out;
}

export function base64Of(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}
