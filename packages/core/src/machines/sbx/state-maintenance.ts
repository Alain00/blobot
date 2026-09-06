import type * as fs from 'node:fs';
import type * as cp from 'node:child_process';

export interface SbxStateMaintenance {
  readonly views: Readonly<Record<'rootfs' | 'home' | 'docker', string>>;
  /** No application writer or unverified nested mount may enter a tree operation. */
  assertHeld(): void;
  /** Releases only the private views. The lifecycle owner must stop this still-frozen VM. */
  dispose(): Promise<void>;
}

/**
 * Run as root inside an admitted guest, already in an unshared private mount namespace.
 * The host must verify the pinned engine, exact owned reference and complete mount boundary
 * before launching this function. Its additional checks refuse an unexpected guest topology.
 * Self-contained so the guest bootstrap can supply its own built-ins.
 */
export async function prepareSbxStateMaintenance(
  filesystem: typeof fs, commands: Pick<typeof cp, 'execFile'>,
  options: { readonly token: string; readonly role: 'source' | 'target' },
): Promise<SbxStateMaintenance> {
  const f = filesystem;
  const fail = (): never => { throw new Error('Machine state maintenance could not be established.'); };
  const read = (path: string): string => f.readFileSync(path, 'utf8').trim();
  const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
  const run = (command: string, args: readonly string[]): Promise<string> => new Promise((resolve, reject) => {
    commands.execFile(command, [...args], {
      env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C', TZ: 'UTC', HOME: '/root' },
      timeout: 30_000, maxBuffer: 1024 * 1024,
    }, (error, stdout) => error === null ? resolve(stdout) : reject(new Error('Machine maintenance command failed.')));
  });
  const mounts = () => read('/proc/self/mountinfo').split('\n').map(line => {
    const parts = line.split(' - ');
    const before = parts[0]?.split(' '), after = parts[1]?.split(' ');
    if (parts.length !== 2 || before === undefined || before.length < 6 || after === undefined || after.length < 3) return fail();
    return { path: before[4]!, kind: after[0]!, options: before[5]!.split(','), line };
  });
  const at = (path: string, kind: string) => {
    const found = mounts().filter(mount => mount.path === path);
    if (found.length !== 1 || found[0]!.kind !== kind) return fail();
    return found[0]!;
  };
  const pids = (path: string): number[] => read(path + '/cgroup.procs').split(/\s+/).filter(Boolean).map(value => {
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) return fail();
    return Number(value);
  });
  const daemonProcesses = () => f.readdirSync('/proc').filter(name => /^[1-9][0-9]*$/.test(name)).flatMap(name => {
    try {
      const comm = read('/proc/' + name + '/comm');
      if (!/^(dockerd|containerd|containerd-shim.*|runc)$/.test(comm)) return [];
      const stat = read('/proc/' + name + '/stat');
      const start = stat.slice(stat.lastIndexOf(') ') + 2).split(' ')[19];
      if (start === undefined || !/^[0-9]+$/.test(start)) return fail();
      return [{ pid: Number(name), comm, start }];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  });
  if (process.platform !== 'linux' || process.getuid?.() !== 0 ||
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(options.token) ||
      (options.role !== 'source' && options.role !== 'target')) fail();
  const relative = read('/proc/self/cgroup').match(/^0::(\/docker\/[a-f0-9]{64})$/)?.[1];
  if (relative === undefined || read('/proc/1/cgroup') !== '0::' + relative) return fail();
  const parent = '/sys/fs/cgroup/docker', container = '/sys/fs/cgroup' + relative;
  if (f.realpathSync(parent) !== parent || f.realpathSync(container) !== container ||
      read(parent + '/cgroup.type') !== 'domain' || read(container + '/cgroup.type') !== 'domain' ||
      read(container + '/cgroup.freeze') !== '0') fail();
  const siblings = f.readdirSync(parent).filter(name => f.lstatSync(parent + '/' + name).isDirectory());
  if (siblings.length !== 1 || siblings[0] !== relative.split('/').at(-1)) fail();
  const rootMount = at('/', 'overlay');
  if (!rootMount.line.includes('/run/bundles/' + relative.split('/').at(-1) + '/') ||
      /(?:^| )shared:[0-9]+(?: |$)/.test(rootMount.line) ||
      f.readlinkSync('/proc/self/ns/mnt') === f.readlinkSync('/proc/1/ns/mnt')) fail();
  at('/sys/fs/cgroup', 'cgroup2'); at('/run', 'tmpfs');
  at('/home/agent', 'ext4'); at('/var/lib/docker', 'ext4');
  if (f.realpathSync('/run') !== '/run') fail();

  // A graceful daemon shutdown preserves its container restart policy. Never docker-stop
  // each container, which would turn a temporary VM pause into an explicit manual stop.
  const before = daemonProcesses();
  const daemons = before.filter(item => item.comm === 'dockerd');
  if (daemons.length !== 1) fail();
  const info: unknown = JSON.parse(await run('/usr/bin/docker', ['info', '--format', '{{json .}}']));
  if (typeof info !== 'object' || info === null || !('LiveRestoreEnabled' in info) || info.LiveRestoreEnabled !== false) fail();
  const terminate = (expected: typeof before[number]): void => {
    const actual = daemonProcesses().find(item => item.pid === expected.pid);
    if (actual === undefined) return;
    if (actual.comm !== expected.comm || actual.start !== expected.start) fail();
    process.kill(actual.pid, 'SIGTERM');
  };
  terminate(daemons[0]!);
  let deadline = Date.now() + 120_000;
  while (daemonProcesses().some(item => item.comm === 'dockerd') && Date.now() < deadline) await delay(100);
  if (daemonProcesses().some(item => item.comm === 'dockerd')) fail();
  for (const daemon of before.filter(item => item.comm === 'containerd')) terminate(daemon);
  deadline = Date.now() + 30_000;
  while (daemonProcesses().length !== 0 && Date.now() < deadline) await delay(100);
  if (daemonProcesses().length !== 0) fail();
  await run('/usr/bin/sync', []);

  const maintenance = parent + '/blobot-state-' + options.token;
  f.mkdirSync(maintenance);
  f.writeFileSync(maintenance + '/cgroup.procs', String(process.pid));
  if (read('/proc/self/cgroup') !== '0::/docker/blobot-state-' + options.token ||
      pids(maintenance).join(',') !== String(process.pid) || pids(container).includes(process.pid)) fail();
  f.writeFileSync(container + '/cgroup.freeze', '1');
  deadline = Date.now() + 10_000;
  while (!/^frozen 1$/m.test(read(container + '/cgroup.events')) && Date.now() < deadline) await delay(20);

  const directory = '/run/blobot-state-' + options.token;
  const views = { rootfs: directory + '/rootfs', home: directory + '/home', docker: directory + '/docker' };
  const bound: string[] = [];
  const assertFrozen = () => {
    if (!/^frozen 1$/m.test(read(container + '/cgroup.events')) ||
        read('/proc/1/cgroup') !== '0::' + relative ||
        read('/proc/self/cgroup') !== '0::/docker/blobot-state-' + options.token ||
        pids(maintenance).join(',') !== String(process.pid) || daemonProcesses().length !== 0) fail();
  };
  const assertHeld = () => {
    assertFrozen();
    const table = mounts();
    for (const [tree, path] of Object.entries(views)) {
      const found = table.filter(mount => mount.path === path);
      if (found.length !== 1 || found[0]!.kind !== (tree === 'rootfs' ? 'overlay' : 'ext4') ||
          table.some(mount => mount.path.startsWith(path + '/')) ||
          !found[0]!.options.includes(options.role === 'source' ? 'ro' : 'rw')) fail();
    }
  };
  const dispose = async () => {
    for (const view of [...bound].reverse()) { await run('/usr/bin/umount', [view]); f.rmdirSync(view); }
    f.rmdirSync(directory);
    // Never thaw here, even after an error. A VM stop resets the owned sibling as measured
    // in research36; moving this process back into the frozen group would deadlock cleanup.
  };
  try {
    assertFrozen();
    if (mounts().some(mount => mount.path.startsWith('/home/agent/') || mount.path.startsWith('/var/lib/docker/'))) fail();
    f.mkdirSync(directory, { mode: 0o700 });
    for (const [tree, path] of Object.entries(views)) {
      f.mkdirSync(path, { mode: 0o700 });
      await run('/usr/bin/mount', ['--bind', tree === 'rootfs' ? '/' : tree === 'home' ? '/home/agent' : '/var/lib/docker', path]);
      bound.push(path);
      if (options.role === 'source') await run('/usr/bin/mount', ['-o', 'remount,bind,ro', path]);
    }
    assertHeld();
    return { views, assertHeld, dispose };
  } catch {
    try { await dispose(); } catch { /* The lifecycle owner stops this guest. */ }
    return fail();
  }
}
