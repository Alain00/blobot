import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { sbxClientEnvironment } from './client-environment.js';

/** Both fields are required: reusing an engine name must never adopt another Agent's data. */
export interface SbxReference {
  readonly name: string;
  readonly id: string;
}

export interface SbxDataTransferOptions {
  readonly source: SbxReference;
  readonly target: SbxReference;
  readonly guestNode: string;
  readonly sbxExecutable?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

// Canonical PAX headers retain precise mtimes, numeric owners, ACLs and xattrs. Excluding
// atime/ctime makes reading the tree itself harmless to the comparison. Fixed header names
// avoid tar's PID-derived defaults. The whole archive remains in guest/client pipes.
const ARCHIVE_ARGS = [
  '--sort=name', '--format=pax', '--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime',
  '--acls', '--xattrs', '--xattrs-include=*', '--sparse', '--sparse-version=0.0', '--numeric-owner', '--one-file-system',
  '-C', '/', '-cf', '-', 'home/agent', 'workspace',
] as const;

const DIGEST_SOURCE = `
const {spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=createHash('sha256');
const child=spawn('tar',${JSON.stringify(ARCHIVE_ARGS)},{stdio:['ignore','pipe','ignore']});
child.stdout.on('data',chunk=>hash.update(chunk));
child.on('error',()=>process.exit(1));
child.on('close',code=>{if(code!==0)process.exit(1);process.stdout.write(hash.digest('hex'));});
`;

function validateReference(ref: SbxReference): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+$/.test(ref.name) ||
      !/^[a-zA-Z0-9-]+$/.test(ref.id)) throw new Error('Invalid sandbox reference.');
}

/**
 * Copy only an already-quiesced Agent's two private trees. The caller holds the lifecycle
 * lock and keeps both guests' application writers stopped until this finishes. This function
 * never deletes either sandbox, changes a binding, logs payloads, or writes a host archive.
 * It may start a stopped guest because that is sbx exec's documented behavior.
 */
export async function copySbxData(options: SbxDataTransferOptions): Promise<{ readonly bytes: number }> {
  validateReference(options.source);
  validateReference(options.target);
  if (options.source.name === options.target.name || options.source.id === options.target.id) {
    throw new Error('Replacement must be a different sandbox.');
  }
  if (!options.guestNode.startsWith('/') || options.guestNode.includes('\0')) throw new Error('Invalid guest Node path.');
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Invalid transfer timeout.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, timeoutMs);
  const executable = options.sbxExecutable ?? 'sbx';
  const env = sbxClientEnvironment();
  const run = (args: readonly string[]) => new Promise<string>((resolve, reject) => {
    execFile(executable, [...args], { env, signal: controller.signal, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      // Raw errors include guest stderr and arguments; neither belongs in a user log.
      if (error !== null) reject(new Error('Sandbox data verification could not complete.'));
      else resolve(stdout);
    });
  });
  const verifyReferences = async () => {
    const parsed: unknown = JSON.parse(await run(['ls', '--json']));
    if (typeof parsed !== 'object' || parsed === null || !('sandboxes' in parsed) || !Array.isArray(parsed.sandboxes)) {
      throw new Error('Sandbox inventory could not be verified.');
    }
    for (const ref of [options.source, options.target]) {
      const found = parsed.sandboxes.filter((value: unknown) => typeof value === 'object' && value !== null &&
        'name' in value && value.name === ref.name);
      if (found.length !== 1 || found[0].id !== ref.id) throw new Error('A sandbox changed before data transfer.');
    }
  };
  const digest = async (ref: SbxReference) => {
    const value = await run(['exec', '-u', '0', ref.name, options.guestNode, '-e', DIGEST_SOURCE]);
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Sandbox data digest could not be verified.');
    return value;
  };
  let reader: ChildProcess | undefined;
  let writer: ChildProcess | undefined;
  try {
    if (controller.signal.aborted) throw new Error('Sandbox data transfer was cancelled.');
    await verifyReferences();
    const before = await digest(options.source);
    reader = spawn(executable, ['exec', '-u', '0', options.source.name, 'tar', ...ARCHIVE_ARGS], {
      env, signal: controller.signal, stdio: ['ignore', 'pipe', 'ignore'],
    });
    writer = spawn(executable, ['exec', '-i', '-u', '0', options.target.name, 'tar',
      '--acls', '--xattrs', '--xattrs-include=*', '--sparse', '--numeric-owner', '-C', '/', '-xpf', '-'], {
      env, signal: controller.signal, stdio: ['pipe', 'ignore', 'ignore'],
    });
    const completed = (child: ChildProcess) => new Promise<void>((resolve, reject) => {
      child.once('error', () => reject(new Error('Sandbox data transfer could not start.')));
      child.once('close', (code) => code === 0 ? resolve() : reject(new Error('Sandbox data transfer did not finish.')));
    });
    const readerDone = completed(reader);
    const writerDone = completed(writer);
    let bytes = 0;
    if (reader.stdout === null || writer.stdin === null) throw new Error('Sandbox data pipes are unavailable.');
    reader.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; });
    await Promise.all([readerDone, writerDone, pipeline(reader.stdout, writer.stdin, { signal: controller.signal })]);
    await verifyReferences();
    const [after, restored] = await Promise.all([digest(options.source), digest(options.target)]);
    if (before !== after || before !== restored) throw new Error('Sandbox data changed or was not fully preserved.');
    return { bytes };
  } catch {
    // Keep file names, process output and all payloads out of the application error channel.
    throw new Error(controller.signal.aborted
      ? 'Sandbox data transfer was cancelled or timed out; the original was kept.'
      : 'Sandbox data transfer could not be verified; the original was kept.');
  } finally {
    controller.abort();
    reader?.kill();
    writer?.kill();
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
