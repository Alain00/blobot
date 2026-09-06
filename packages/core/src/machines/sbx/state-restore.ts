import type * as fs from 'node:fs';
import type * as cp from 'node:child_process';
import type * as crypto from 'node:crypto';
import type { createStateArchiveVerifier } from './state-archive.js';
import type { createSbxArchiveIndex, selectSbxArchiveMembers, SbxArchiveMember } from './state-archive-index.js';

/**
 * Guest-only streaming extraction into an already-held candidate. Attribute operations are
 * mandatory hooks: tar alone omits inode flags and leaves surplus directory xattrs behind.
 * Callers must validate those hooks' complete plan before changing any candidate state.
 * Self-contained for the guest bootstrap; never invoke it against an unadmitted filesystem.
 */
export async function receiveSbxStateArchive(
  builtins: {
    readonly fs: typeof fs;
    readonly commands: { spawn(command: string, args: readonly string[], options: cp.SpawnOptions): cp.ChildProcess };
    readonly crypto: Pick<typeof crypto, 'createHash'>;
  },
  archives: {
    readonly verify: typeof createStateArchiveVerifier;
    readonly index: typeof createSbxArchiveIndex;
    readonly select: typeof selectSbxArchiveMembers;
  },
  options: {
    readonly path: string;
    readonly privateDirectory: string;
    readonly source: ReadonlyMap<string, SbxArchiveMember>;
    readonly target: ReadonlyMap<string, SbxArchiveMember>;
    readonly assertHeld: () => void;
    /** Includes removals, selected paths and ancestors; all source attributes preflight first. */
    readonly prepareAttributes: (selection: Buffer | null) => Promise<void>;
    readonly finishAttributes: () => Promise<void>;
  },
): Promise<{ write(chunk: Buffer): Promise<void>; finish(): Promise<void>; abort(): Promise<void> }> {
  const f = builtins.fs;
  const fail = (): never => { throw new Error('Machine state restoration could not be verified.'); };
  if (!/^\/run\/blobot-state-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(options.privateDirectory) ||
      !['rootfs', 'home', 'docker'].some(tree => options.path === options.privateDirectory + '/' + tree) ||
      f.realpathSync(options.privateDirectory) !== options.privateDirectory) fail();
  const directory = f.lstatSync(options.privateDirectory);
  if (!directory.isDirectory() || directory.uid !== 0 || (directory.mode & 0o777) !== 0o700) fail();
  options.assertHeld();
  const selection = archives.select(options.source, options.target);
  await options.prepareAttributes(selection);
  options.assertHeld();
  const inventory = archives.index(archives.verify, builtins.crypto.createHash);
  let child: cp.ChildProcess | undefined;
  let completed: Promise<boolean> | undefined;
  let warnings = false, ended = false;
  const abort = async (): Promise<void> => {
    ended = true;
    if (child !== undefined && child.exitCode === null && child.signalCode === null) {
      child.stdin?.destroy(); child.kill('SIGTERM');
      const force = setTimeout(() => child?.kill('SIGKILL'), 1000);
      await completed;
      clearTimeout(force);
    }
  };
  if (selection !== null) {
    // A regular tmpfs file survives fd inheritance and reopening through /proc/self/fd/3.
    // Node stdio:'pipe' is not reopenable that way. Unlink immediately after spawning so no
    // pathname persists; the descriptor and private names disappear with the helper/VM.
    const file = options.privateDirectory + '/selection';
    let fd: number | undefined;
    try {
      fd = f.openSync(file, f.constants.O_CREAT | f.constants.O_EXCL | f.constants.O_RDWR | f.constants.O_NOFOLLOW, 0o600);
      let at = 0;
      while (at < selection.length) {
        const written = f.writeSync(fd, selection, at, selection.length - at, at);
        if (written <= 0) fail();
        at += written;
      }
      child = builtins.commands.spawn('/usr/bin/tar', [
        '--incremental', '--numeric-owner', '--acls', '--xattrs', '--xattrs-include=*',
        '--delay-directory-restore', '--no-recursion', '--null', '--verbatim-files-from',
        '--no-wildcards', '--anchored', '--no-unquote',
        '-C', options.path, '-xpf', '-', '-T', '/proc/self/fd/3',
      ], { env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', TZ: 'UTC' }, stdio: ['pipe', 'ignore', 'pipe', fd] });
      completed = new Promise<boolean>(resolve => {
        child!.once('error', () => resolve(false));
        child!.once('close', code => resolve(code === 0));
      });
      child.stdin?.on('error', () => {});
      child.stderr?.on('data', () => { warnings = true; });
      if (child.stdin === null || child.stderr === null) fail();
    } catch {
      await abort(); return fail();
    } finally {
      if (fd !== undefined) {
        try { f.closeSync(fd); f.unlinkSync(file); }
        catch { await abort(); fail(); }
      }
    }
  }
  return {
    async write(chunk) {
      if (ended) fail();
      try {
        inventory.write(chunk);
        if (child !== undefined) await new Promise<void>((resolve, reject) => {
          child!.stdin!.write(chunk, error => error ? reject(error) : resolve());
        });
      } catch { await abort(); fail(); }
    },
    async finish() {
      if (ended) fail();
      try {
        const received = inventory.finish();
        if (received.size !== options.source.size || [...received].some(([key, entry]) => {
          const expected = options.source.get(key);
          return expected === undefined || expected.sha256 !== entry.sha256 || expected.type !== entry.type ||
            !expected.path.equals(entry.path) || !expected.link.equals(entry.link);
        })) fail();
        if (child !== undefined) {
          child.stdin!.end();
          if (!await completed || warnings) fail();
        }
        options.assertHeld();
        await options.finishAttributes();
        options.assertHeld();
        ended = true;
      } catch { await abort(); fail(); }
    },
    abort,
  };
}
