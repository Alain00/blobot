import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, posix } from 'node:path';
import { promisify } from 'node:util';
import { downloadVerified } from '../../speech/download.js';

const exec = promisify(execFile);
export const SBX_INSTALL_VERSION = 'v0.42.0-rc5';
const release = `https://github.com/docker/sbx-releases/releases/download/${SBX_INSTALL_VERSION}/`;
export interface SbxInstallArtifact {
  readonly file: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly kind: 'archive' | 'package';
}
const artifact = (file: string, bytes: number, sha256: string, kind: SbxInstallArtifact['kind']): SbxInstallArtifact =>
  ({ file, url: `${release}${file}`, bytes, sha256, kind });
const mac = artifact('DockerSandboxes-darwin.tar.gz', 136590091,
  '670ce2f469fe2a9d36046e448eb69769c0ebf77ac8ad9215b657dfd4c073916a', 'archive');
const ubuntu = {
  '24.04': {
    x64: artifact('DockerSandboxes-linux-amd64-ubuntu2404.deb', 94530904, '2d167aeb4885ef6427cb744aa5ac4434fe7f02862e21e3a859054cec2f25221c', 'package'),
    arm64: artifact('DockerSandboxes-linux-arm64-ubuntu2404.deb', 82477424, '77f70284a37890219c7c2df42d379fc0ce46334d6127c489386a8a5702e43da4', 'package'),
  },
  '26.04': {
    x64: artifact('DockerSandboxes-linux-amd64-ubuntu2604.deb', 94511052, 'b733beccc27c438e1553966304332006b389ba2e0579af891a302ed8e2ed273d', 'package'),
    arm64: artifact('DockerSandboxes-linux-arm64-ubuntu2604.deb', 82476148, '5d6014d636d5c61ca38be945229ffa7905e8c6a1c203ea9a75e2037bd3d81ed4', 'package'),
  },
};

/** Only exact, publisher-supported releases have an installation offer. */
export function sbxInstallArtifact(platform: string, arch: string, hostRelease: string): SbxInstallArtifact | undefined {
  if (platform === 'darwin' && arch === 'arm64' && Number(hostRelease.split('.')[0]) >= 23) return mac;
  if (platform !== 'linux' || (arch !== 'x64' && arch !== 'arm64')) return undefined;
  const values = new Map(hostRelease.split('\n').map((line) => {
    const [key, ...rest] = line.split('='); return [key, rest.join('=').replace(/^"|"$/g, '')];
  }));
  if (values.get('ID') !== 'ubuntu') return undefined;
  const version = values.get('VERSION_ID');
  return version === '24.04' || version === '26.04' ? ubuntu[version][arch] : undefined;
}

export async function sbxHostArtifact(): Promise<SbxInstallArtifact | undefined> {
  const { release: osRelease } = await import('node:os');
  return sbxInstallArtifact(process.platform, process.arch, process.platform === 'linux'
    ? await readFile('/etc/os-release', 'utf8').catch(() => '') : osRelease());
}

export async function sbxKvmAvailable(): Promise<boolean> {
  if (process.platform !== 'linux') return true;
  try { await access('/dev/kvm', constants.R_OK | constants.W_OK); return true; } catch { return false; }
}

async function digest(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Paths are checked before extraction; the archive's full pinned hash is a prerequisite. */
export function validateSbxArchiveMembers(names: string, details: string): void {
  const paths = names.trim().split('\n');
  if (paths.length < 2 || paths.length > 1000 || !paths.includes('bin/sbx')) throw new Error('Incomplete sandbox distribution.');
  for (const name of paths) {
    if (!/^(?:bin|libexec|completions)(?:\/[A-Za-z0-9._+-]+)*\/?$|^(?:LICENSE|THIRD-PARTY-NOTICES)$/.test(name) ||
      posix.isAbsolute(name) || name.split('/').some((part) => part === '..' || part === '.')) {
      throw new Error('Unexpected sandbox archive path.');
    }
  }
  // This exact distribution uses files/directories. Refuse links/devices before tar can follow them.
  const rows = details.trim().split('\n');
  if (rows.length !== paths.length || rows.some((line) => !/^[-d][rwxstST-]{9}\s/.test(line))) {
    throw new Error('Unexpected sandbox archive entry.');
  }
}

export interface SbxInstallationOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (received: number, total: number | undefined) => void;
  readonly fetch?: typeof fetch;
}
export type SbxInstallation =
  | { readonly kind: 'installed'; readonly executable: string }
  | { readonly kind: 'package'; readonly path: string };

/** A verified private macOS distribution, or a verified package for the OS's GUI installer. */
export class SbxInstaller {
  #pending: Promise<SbxInstallation> | undefined;
  constructor(readonly directory: string) {}
  get executable(): string { return join(this.directory, 'engine', SBX_INSTALL_VERSION, 'bin', 'sbx'); }
  install(options: SbxInstallationOptions = {}): Promise<SbxInstallation> {
    if (this.#pending !== undefined) return this.#pending;
    const task = this.#install(options).finally(() => { this.#pending = undefined; });
    this.#pending = task; return task;
  }
  async #install(options: SbxInstallationOptions): Promise<SbxInstallation> {
    options.signal?.throwIfAborted();
    const build = await sbxHostArtifact();
    if (build === undefined) throw new Error('Sandbox installation is unavailable for this computer.');
    const downloads = join(this.directory, 'downloads');
    await mkdir(downloads, { recursive: true, mode: 0o700 });
    const archive = join(downloads, build.file);
    const cached = await stat(archive).catch(() => undefined);
    if (cached?.size !== build.bytes || await digest(archive) !== build.sha256) {
      if (cached !== undefined) await rm(archive);
      const result = await downloadVerified({ ...options, url: build.url, bytes: build.bytes, sha256: build.sha256, to: archive });
      if (!result.ok) throw new Error(result.kind === 'cancelled' ? 'Sandbox installation cancelled.' : result.error);
    }
    options.signal?.throwIfAborted();
    if (build.kind === 'package') return { kind: 'package', path: archive };
    const root = join(this.directory, 'engine');
    await mkdir(root, { recursive: true, mode: 0o700 });
    const destination = join(root, SBX_INSTALL_VERSION);
    // Never replace a directory already in use, including an incomplete/unrecognized one.
    if (await lstat(destination).catch(() => undefined)) {
      throw new Error('A sandbox installation already occupies this version. Its files were kept.');
    }
    const staging = await mkdtemp(join(root, '.install-'));
    try {
      const commandOptions = { timeout: 60_000, maxBuffer: 1024 * 1024,
        ...(options.signal === undefined ? {} : { signal: options.signal }) };
      const [names, details] = await Promise.all([
        exec('/usr/bin/tar', ['-tzf', archive], commandOptions),
        exec('/usr/bin/tar', ['-tvzf', archive], commandOptions),
      ]);
      validateSbxArchiveMembers(names.stdout, details.stdout);
      await exec('/usr/bin/tar', ['-xzf', archive, '-C', staging], commandOptions);
      // No symlinks, special files, setuid or group/world-writable executables in the published tree.
      const verifyTree = async (directory: string): Promise<void> => {
        for (const name of await readdir(directory)) {
          const path = join(directory, name), info = await lstat(path);
          if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()) || (info.mode & 0o6022) !== 0) {
            throw new Error('Unexpected sandbox distribution permissions.');
          }
          if (info.isDirectory()) await verifyTree(path);
        }
      };
      await verifyTree(staging);
      for (const binary of ['bin/sbx', 'libexec/containerd-shim-nerdbox-v1']) {
        await access(join(staging, binary), constants.X_OK);
        await exec('/usr/bin/codesign', ['--verify', '--strict', '-R', '=anchor apple generic and certificate leaf[subject.OU] = "9BNSXJN65R"', join(staging, binary)], commandOptions);
      }
      options.signal?.throwIfAborted();
      await rename(staging, destination);
      // The verified private installation owns the bytes now. Linux packages remain until
      // the OS installer has consumed them; returning their path is not an installation receipt.
      await rm(archive, { force: true }).catch(() => {});
      return { kind: 'installed', executable: this.executable };
    } catch {
      throw new Error(options.signal?.aborted === true ? 'Sandbox installation cancelled.'
        : 'The downloaded sandbox software could not be unpacked or verified. Try again.');
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
}
