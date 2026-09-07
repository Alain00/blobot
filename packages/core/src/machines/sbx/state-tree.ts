import type * as cp from 'node:child_process';
import type * as crypto from 'node:crypto';
import type { createStateArchiveVerifier } from './state-archive.js';
import type { createSbxArchiveIndex, SbxArchiveMember } from './state-archive-index.js';
import type { SbxTreeDigest } from './state-transfer.js';

/**
 * Read one already-held private tree using the measured full GNU PAX dialect. This returns
 * guest-private inventory, never a protocol reply. Inode-attribute preflight is separate;
 * successfully archiving a tree does not prove that tar represents all of its state.
 * Self-contained for the guest bootstrap.
 */
export async function readSbxStateTree(
  builtins: {
    readonly commands: { spawn(command: string, args: readonly string[], options: cp.SpawnOptions): cp.ChildProcess };
    readonly crypto: Pick<typeof crypto, 'createHash'>;
  },
  archives: { readonly verify: typeof createStateArchiveVerifier; readonly index: typeof createSbxArchiveIndex },
  options: {
    readonly path: string;
    readonly maxBytes: number;
    readonly assertHeld: () => void;
    readonly emit?: (chunk: Buffer) => Promise<void>;
  },
): Promise<{ readonly digest: SbxTreeDigest; readonly members: ReadonlyMap<string, SbxArchiveMember> }> {
  const fail = (): never => { throw new Error('Machine state archive could not be verified.'); };
  if (!options.path.startsWith('/') || options.path.includes('\0') ||
      !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1024) fail();
  options.assertHeld();
  const index = archives.index(archives.verify, builtins.crypto.createHash);
  const hash = builtins.crypto.createHash('sha256');
  let bytes = 0, warnings = false;
  const child = builtins.commands.spawn('/usr/bin/tar', [
    '--incremental', '--sort=name', '--format=pax',
    '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime',
    '--numeric-owner', '--acls', '--xattrs', '--xattrs-include=*',
    '--sparse', '--sparse-version=0.0', '--atime-preserve=system',
    '-C', options.path, '-cf', '-', '.',
  ], { env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'pipe'] });
  // Observe errors immediately, including before the async iterator starts reading stdout.
  const completed = new Promise<boolean>(resolve => {
    child.once('error', () => resolve(false));
    child.once('close', code => resolve(code === 0));
  });
  child.stderr?.on('data', () => { warnings = true; });
  let accepted = false;
  try {
    if (child.stdout === null || child.stderr === null) return fail();
    for await (const value of child.stdout) {
      const data: Buffer = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
      bytes += data.length;
      if (!Number.isSafeInteger(bytes) || bytes > options.maxBytes) fail();
      hash.update(data);
      for (let at = 0; at < data.length; at += 65536) {
        const chunk = data.subarray(at, at + 65536);
        index.write(chunk);
        await options.emit?.(chunk);
      }
    }
    if (!await completed || warnings) fail();
    const members = index.finish();
    options.assertHeld();
    accepted = true;
    return { digest: { bytes, sha256: hash.digest('hex') }, members };
  } catch {
    return fail();
  } finally {
    if (!accepted && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 1000);
      await completed;
      clearTimeout(force);
    }
  }
}
