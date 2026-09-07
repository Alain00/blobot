import type * as cp from 'node:child_process';
import type { SbxArchiveMember } from './state-archive-index.js';
import type { SbxStateDescription } from './state-description.js';
import type { SbxStateAttributeBackend } from './state-filesystem.js';

/** A failed/skipped API is recorded explicitly; neither is a zero-valued attribute word. */
export type SbxInodeAttributes = readonly [
  flags: number | 'enotty' | 'skipped',
  fsx: readonly [number, number, number, number, number] | 'enotty' | 'skipped',
  statx: string,
  statxMask: string,
  xattrs: readonly (readonly [nameBase64: string, bytes: number, sha256: string])[],
];

/** Bounded canonical metadata in archive order, independent of inode numbers/ctime/devices. */
export function createSbxStateAttributeCodec(): {
  decode(bytes: Buffer, members: ReadonlyMap<string, SbxArchiveMember>): ReadonlyMap<string, SbxInodeAttributes>;
  encode(attributes: ReadonlyMap<string, SbxInodeAttributes>): Buffer;
} {
  const fail = (): never => { throw new Error('Machine state attributes could not be verified.'); };
  const uint = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffffff;
  return {
    decode(bytes, members) {
      if (bytes.length === 0 || bytes.length > 64 * 1024 ** 2) fail();
      try {
        const rows: unknown = JSON.parse(bytes.toString('utf8'));
        if (!Array.isArray(rows) || rows.length !== members.size) return fail();
        const result = new Map<string, SbxInodeAttributes>();
        const entries = [...members];
        for (let at = 0; at < rows.length; at++) {
          const row: unknown = rows[at];
          const [key, member] = entries[at]!;
          if (!Array.isArray(row) || row.length !== 6 || row[0] !== member.path.toString('base64')) return fail();
          const [flags, fsx, statx, mask, xattrs] = row.slice(1) as unknown[];
          let actualType = member.type, linked = member;
          while (actualType === 49) {
            const reference = members.get(linked.link.toString('latin1'));
            if (reference === undefined || result.get(reference.path.toString('latin1')) === undefined) return fail();
            linked = reference; actualType = linked.type;
          }
          if (actualType === 48 || actualType === 53) {
            if (flags === 'enotty') { if (fsx !== 'enotty') fail(); }
            else if (!uint(flags) || !Array.isArray(fsx) || fsx.length !== 5 || !fsx.every(uint)) fail();
          } else if (flags !== 'skipped' || fsx !== 'skipped') fail();
          if (typeof statx !== 'string' || typeof mask !== 'string' ||
              !/^(0|[1-9a-f][0-9a-f]{0,15})$/.test(statx) || !/^(0|[1-9a-f][0-9a-f]{0,15})$/.test(mask) ||
              (BigInt('0x' + statx) & ~BigInt('0x' + mask)) !== 0n || !Array.isArray(xattrs)) fail();
          let previous: Buffer | undefined;
          for (const xattr of xattrs as unknown[]) {
            if (!Array.isArray(xattr) || xattr.length !== 3 || typeof xattr[0] !== 'string' ||
                !Number.isInteger(xattr[1]) || xattr[1] < 0 || xattr[1] > 65536 ||
                typeof xattr[2] !== 'string' || !/^[a-f0-9]{64}$/.test(xattr[2])) return fail();
            const name = Buffer.from(xattr[0], 'base64');
            if (name.toString('base64') !== xattr[0] || name.length === 0 || name.length > 255 || name.includes(0) ||
                (previous !== undefined && Buffer.compare(previous, name) >= 0)) fail();
            previous = name;
          }
          result.set(key, [flags, fsx, statx, mask, xattrs] as SbxInodeAttributes);
        }
        return result;
      } catch { return fail(); }
    },
    encode(attributes) {
      const bytes = Buffer.from(JSON.stringify([...attributes].map(([path, value]) => [Buffer.from(path, 'latin1').toString('base64'), ...value])));
      if (bytes.length === 0 || bytes.length > 64 * 1024 ** 2) fail();
      return bytes;
    },
  };
}

/**
 * Private attribute backend. Unknown source attributes may survive only through untouched,
 * equal entries in the admitted same-image candidate. They are never fabricated for replay.
 * The Python helper opens data descriptors only for regular files/directories.
 */
export function createSbxStateAttributeBackend(
  commands: { spawn(command: string, args: readonly string[], options: cp.SpawnOptions): cp.ChildProcess },
  codec: ReturnType<typeof createSbxStateAttributeCodec>,
  script: string,
): SbxStateAttributeBackend {
  const fail = (): never => { throw new Error('Machine state attributes could not be verified.'); };
  const same = (a: SbxInodeAttributes | undefined, b: SbxInodeAttributes | undefined) => JSON.stringify(a) === JSON.stringify(b);
  const known = (value: SbxInodeAttributes, type: number): boolean => {
    if (typeof value[0] !== 'number' || typeof value[1] === 'string') return false;
    const flags = value[0], fsx = value[1];
    const policy = type === 53 ? 0x200300f8 : 0xf8;
    if ((flags & ~policy) !== 0x80000 || fsx.slice(1).some(field => field !== 0)) return false;
    const mapping = [[8, 32], [16, 8], [32, 16], [64, 128], [128, 64], [0x20000000, 512]];
    let wanted = 0;
    for (const [flag, xflag] of mapping) if ((flags & flag!) !== 0) wanted |= xflag!;
    return fsx[0] === wanted && (BigInt('0x' + value[2]) & ~0x2070n) === 0n &&
      (BigInt('0x' + value[2]) & 0x70n) === BigInt(flags & 0x70);
  };
  const run = async (request: unknown, assertHeld: () => void): Promise<Buffer> => {
    assertHeld();
    const input = Buffer.from(JSON.stringify(request));
    if (input.length > 64 * 1024 ** 2) fail();
    const child = commands.spawn('/usr/bin/python3', ['-I', '-B', '-c', script], {
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', TZ: 'UTC' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let warning = false, accepted = false;
    const completed = new Promise<boolean>(resolve => {
      child.once('error', () => resolve(false)); child.once('close', code => resolve(code === 0));
    });
    child.stdin?.on('error', () => {});
    child.stderr?.on('data', () => { warning = true; });
    try {
      if (child.stdin === null || child.stdout === null || child.stderr === null) return fail();
      // Python consumes the entire bounded request before producing its bounded response.
      child.stdin.end(input);
      const chunks: Buffer[] = [];
      let count = 0;
      for await (const value of child.stdout) {
        const chunk = Buffer.from(value as Uint8Array); count += chunk.length;
        if (count > 64 * 1024 ** 2) fail();
        chunks.push(chunk);
      }
      if (!await completed || warning) return fail();
      assertHeld();
      accepted = true;
      return Buffer.concat(chunks);
    } catch { return fail(); }
    finally {
      if (!accepted && child.exitCode === null && child.signalCode === null) {
        child.stdin?.destroy(); child.kill('SIGTERM');
        const force = setTimeout(() => child.kill('SIGKILL'), 1000);
        await completed; clearTimeout(force);
      }
    }
  };
  const names = (members: ReadonlyMap<string, SbxArchiveMember>) => [...members.values()].map(member => member.path.toString('base64'));
  const inspect = async (path: string, members: ReadonlyMap<string, SbxArchiveMember>, assertHeld: () => void) => {
    const bytes = await run({ op: 'scan', root: path, paths: names(members) }, assertHeld);
    return codec.encode(codec.decode(bytes, members));
  };
  return {
    inspect,
    preflight(description) {
      // Unknowns remain conditional on an untouched target entry. Known unrepresentable
      // policies/project state refuse before the source streams any archive to the receiver.
      for (const [key, value] of codec.decode(description.attributes, description.members)) {
        const member = description.members.get(key)!;
        if (typeof value[0] === 'number' && !known(value, member.type === 49 ? 48 : member.type)) fail();
      }
    },
    plan(path, source, target, assertHeld) {
      const a = codec.decode(source.attributes, source.members), b = codec.decode(target.attributes, target.members);
      const changed = new Set([...a.keys()].filter(key => !same(a.get(key), b.get(key))));
      let selected: Set<string> | undefined, prepared = false, finished = false;
      return {
        changed,
        async prepare(selection) {
          if (prepared) fail();
          selected = new Set(selection === null ? [] : selection.subarray(0, -1).toString('latin1').split('\0').map(key => key.replace(/\/$/, '')));
          for (const [key, value] of a) {
            if (selected.has(key)) {
              const member = source.members.get(key)!;
              if (!known(value, member.type === 49 ? 48 : member.type)) fail();
            } else if (!same(value, b.get(key)) || source.members.get(key)!.sha256 !== target.members.get(key)?.sha256) fail();
          }
          for (const key of selected) if (!a.has(key)) fail();
          const touched = [...b.keys()].filter(key => selected!.has(key) || !a.has(key));
          // Clear only measured protections on touched candidate inodes; never mutate source.
          const expected = touched.map(key => [Buffer.from(key, 'latin1').toString('base64'), ...b.get(key)!]);
          await run({ op: 'prepare', root: path, expected }, assertHeld);
          prepared = true;
        },
        async finish() {
          if (!prepared || finished || selected === undefined) fail();
          const expected = [...a].filter(([key]) => selected!.has(key)).map(([key, value]) => [Buffer.from(key, 'latin1').toString('base64'), ...value]);
          await run({ op: 'finish', root: path, expected }, assertHeld);
          const after = await inspect(path, source.members, assertHeld);
          if (!after.equals(codec.encode(a))) fail();
          finished = true;
        },
      };
    },
  };
}

/** Static guest code; path/metadata requests travel only through its private stdin pipe. */
export const SBX_STATE_ATTRIBUTE_HELPER = String.raw`
import sys,os,stat,json,base64,hashlib,struct,fcntl,ctypes
MAX=64*1024*1024
GET,SET,GETX=0x80086601,0x40086602,0x801c581f
def fail(): raise RuntimeError('State attributes unavailable')
def decode(s):
    if not isinstance(s,str): fail()
    b=base64.b64decode(s,validate=True)
    if base64.b64encode(b).decode()!=s: fail()
    return b
def encoded(b): return base64.b64encode(b).decode()
def main():
    if sys.byteorder!='little' or os.uname().machine not in ['aarch64','x86_64'] or os.geteuid()!=0: fail()
    raw=sys.stdin.buffer.read(MAX+1)
    if len(raw)>MAX: fail()
    request=json.loads(raw);root=os.fsencode(request['root'])
    if not root.startswith(b'/run/blobot-state-') or root.rsplit(b'/',1)[1] not in [b'rootfs',b'home',b'docker']: fail()
    if os.path.realpath(root)!=root or not stat.S_ISDIR(os.lstat(root).st_mode): fail()
    libc=ctypes.CDLL(None,use_errno=True)
    libc.statx.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_uint,ctypes.c_void_p]
    libc.statx.restype=ctypes.c_int
    def path(name):
        rel=decode(name)
        if rel==b'.': return root
        if not rel.startswith(b'./') or any(p in [b'',b'.',b'..'] for p in rel[2:].split(b'/')) or b'\0' in rel: fail()
        p=root
        for part in rel[2:].split(b'/')[:-1]:
            p+=b'/'+part
            if not stat.S_ISDIR(os.lstat(p).st_mode): fail()
        return root+b'/'+rel[2:]
    def xattrs(p):
        values=[]
        for n in sorted(os.fsencode(n) for n in os.listxattr(p,follow_symlinks=False)):
            v=os.getxattr(p,n,follow_symlinks=False)
            values.append([encoded(n),len(v),hashlib.sha256(v).hexdigest()])
        return values
    def query(p):
        s=os.lstat(p);raw=ctypes.create_string_buffer(256)
        if libc.statx(-100,p,0x100|0x800,0x7ff,raw): fail()
        attrs=format(struct.unpack_from('<Q',raw.raw,8)[0],'x');mask=format(struct.unpack_from('<Q',raw.raw,56)[0],'x')
        flags=fsx='skipped'
        if stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode):
            fd=os.open(p,os.O_RDONLY|os.O_NOATIME|os.O_NOFOLLOW|os.O_NONBLOCK)
            try:
                try:
                    b=bytearray(4);fcntl.ioctl(fd,GET,b,True);flags=struct.unpack('<I',b)[0]
                except OSError as e:
                    if e.errno!=25: raise
                    flags='enotty'
                try:
                    b=bytearray(28);fcntl.ioctl(fd,GETX,b,True);fsx=list(struct.unpack('<5I8x',b))
                except OSError as e:
                    if e.errno!=25: raise
                    fsx='enotty'
            finally: os.close(fd)
        return [flags,fsx,attrs,mask,xattrs(p)]
    def setflags(p,wanted):
        s=os.lstat(p)
        if not (stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode)): fail()
        fd=os.open(p,os.O_RDONLY|os.O_NOATIME|os.O_NOFOLLOW|os.O_NONBLOCK)
        try: fcntl.ioctl(fd,SET,struct.pack('<I',wanted))
        finally: os.close(fd)
    op=request['op']
    if op=='scan':
        result=[[name,*query(path(name))] for name in request['paths']]
    elif op in ['prepare','finish']:
        expected=request['expected']
        if op=='prepare':
            # Preflight all touched entries before the first candidate mutation.
            for row in expected:
                if query(path(row[0]))!=row[1:]: fail()
            for row in sorted(expected,key=lambda r:decode(r[0]).count(b'/')):
                p=path(row[0]);flags=row[1]
                if isinstance(flags,int) and flags&0x30: setflags(p,flags&~0x30)
        else:
            # Tar restores xattr values and ACLs, but retains surplus xattr names on dirs.
            # Prune names before setting protections, then restore flags bottom-up.
            for row in expected:
                p=path(row[0]);wanted={decode(x[0]) for x in row[5]}
                for name in os.listxattr(p,follow_symlinks=False):
                    if os.fsencode(name) not in wanted: os.removexattr(p,name,follow_symlinks=False)
            for row in sorted(expected,key=lambda r:decode(r[0]).count(b'/'),reverse=True):
                p=path(row[0]);current=query(p)
                if not isinstance(row[1],int): fail()
                if current[0]!=row[1]: setflags(p,row[1])
            for row in expected:
                if query(path(row[0]))!=row[1:]: fail()
        result=True
    else: fail()
    out=json.dumps(result,separators=(',',':')).encode()
    if len(out)>MAX: fail()
    sys.stdout.buffer.write(out)
try: main()
except BaseException:
    sys.stderr.write('State attributes unavailable\n');sys.exit(1)
`;
