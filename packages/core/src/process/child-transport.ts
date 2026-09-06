import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { MachineTransport } from '../machines/machine.js';

/**
 * A spawned process as a `MachineTransport`, and the two questions every adapter asks about a
 * binary before it spawns one.
 *
 * Shared because it is about processes and pipes, not about a provider: runtimes and guest helpers speak lines on stdio and shut down on stdin EOF. What differs — which binary, which arguments, which environment — stays in the
 * adapter that owns it.
 */
export function childTransport(
  child: ChildProcessWithoutNullStreams,
  onStderr: ((line: string) => void) | undefined,
  options: { readonly killAfterMs?: number } = {},
): MachineTransport {
  const killAfterMs = options.killAfterMs ?? 2_000;
  const closeListeners = new Set<(reason: string | undefined) => void>();
  let closedBy: string | undefined;
  let closed = false;

  const announceClose = (reason: string | undefined): void => {
    if (closed) return;
    closed = true;
    closedBy = reason;
    for (const listener of closeListeners) listener(reason);
  };

  child.on('error', (error) => announceClose(error.message));
  // A guest bootstrap can refuse before consuming the pending protocol input. Its closed
  // pipe must fail this transport, not crash the Electron main process with an unhandled EPIPE.
  child.stdin.on('error', (error) => announceClose(error.message));
  child.on('exit', (code, signal) => {
    announceClose(
      code === 0 || code === null
        ? signal === null
          ? undefined
          : `the agent process was killed by ${signal}`
        : `the agent process exited with code ${code}`,
    );
  });

  if (onStderr !== undefined) {
    createInterface({ input: child.stderr }).on('line', onStderr);
  } else {
    // Diagnostics still need draining when nobody displays them, or a full pipe stalls exec.
    child.stderr.resume();
  }

  return {
    write(line: string): void {
      if (child.stdin.destroyed) return;
      child.stdin.write(line);
    },
    lines(): AsyncIterable<string> {
      return createInterface({ input: child.stdout, crlfDelay: Infinity });
    },
    async close(): Promise<void> {
      if (child.exitCode !== null) return;
      // Both runtimes exit on stdin EOF, so a clean stop is closing the pipe. The kill is the
      // fallback for a process that has stopped reading it.
      child.stdin.end();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, killAfterMs);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    onClose(listener: (reason: string | undefined) => void): () => void {
      if (closed) {
        listener(closedBy);
        return () => undefined;
      }
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
  };
}

/** The first executable of that name on `PATH`, or nothing. */
export function searchPath(binary: string): string | undefined {
  for (const entry of (process.env.PATH ?? '').split(':')) {
    if (entry.length === 0) continue;
    const candidate = join(entry, binary);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
}

export function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
