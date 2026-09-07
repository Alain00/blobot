export interface StateArchiveObserver {
  /** Guest-private data. Called only for a structurally accepted member header. */
  member(path: Buffer, type: number, link: Buffer, headers: Buffer): void;
  data(chunk: Buffer): void;
  end(): void;
}

/**
 * A bounded structural check for the exact full PAX dialect emitted by the maintenance
 * worker. Run this inside the guest: names and extended attributes are private state.
 * It complements a private mount view and controlled tar arguments; it is not a tar sandbox
 * or a proof that unencoded filesystem attributes were preserved. It emits no member data.
 * Keep the factory self-contained so a guest worker can carry its compiled function source.
 */
export function createStateArchiveVerifier(observer?: StateArchiveObserver): { write(chunk: Buffer): void; finish(): void } {
  const invalid = (): never => { throw new Error('Machine state archive is invalid.'); };
  const maximumMetadata = 1024 * 1024;
  let pending: Buffer = Buffer.alloc(0);
  let remaining = 0;
  let padding = 0;
  let metadata: Buffer | undefined;
  let metadataOffset = 0;
  let extendedHeader: Buffer | undefined;
  let encodedExtended: Buffer | undefined;
  let memberActive = false;
  let fields: Map<string, Buffer> | undefined;
  let zeroBlocks = 0;
  let rootSeen = false;
  let failed = false;
  const expected = new Map<string, number>();
  const seen = new Set<string>();
  let nameBytes = 0;

  const path = (bytes: Buffer): void => {
    // Byte-level checks also cover names that are not UTF-8. Never normalize a bad path.
    const value = bytes.toString('latin1');
    if (value.includes('\0') || (value !== '.' && !value.startsWith('./'))) invalid();
    const parts = value.split('/');
    if (parts.at(-1) === '') parts.pop(); // GNU tar's directory names have a trailing slash.
    if (parts.some((part, index) => index > 0 && (part === '' || part === '.' || part === '..'))) invalid();
  };
  const name = (bytes: Buffer): Buffer => {
    const end = bytes.indexOf(0);
    return end === -1 ? bytes : bytes.subarray(0, end);
  };
  const octal = (bytes: Buffer): number => {
    const value = bytes.toString('ascii').replace(/[\0 ]+$/g, '').replace(/^ +/, '');
    if (!/^[0-7]+$/.test(value)) invalid();
    const result = Number.parseInt(value, 8);
    if (!Number.isSafeInteger(result) || result < 0) invalid();
    return result;
  };
  const dumpdir = (bytes: Buffer): [string, number][] => {
    const entries: [string, number][] = [];
    let at = 0;
    while (at < bytes.length) {
      if (bytes[at] === 0) { if (at !== bytes.length - 1) invalid(); return entries; }
      // A fresh full archive has no excluded entries or rename history.
      if (bytes[at] !== 89 && bytes[at] !== 68) invalid(); // Y (included), D (directory)
      const end = bytes.indexOf(0, at + 1);
      if (end === -1) invalid();
      const entry = bytes.subarray(at + 1, end).toString('latin1');
      if (entry === '' || entry === '.' || entry === '..' || entry.includes('/')) invalid();
      entries.push([entry, bytes[at]!]);
      at = end + 1;
    }
    return invalid();
  };
  const pax = (bytes: Buffer): Map<string, Buffer> => {
    const result = new Map<string, Buffer>();
    let at = 0;
    while (at < bytes.length) {
      const space = bytes.indexOf(32, at);
      if (space === -1 || space - at > 8) invalid();
      const count = bytes.subarray(at, space).toString('ascii');
      if (!/^[1-9][0-9]*$/.test(count)) invalid();
      const end = at + Number(count);
      if (end > bytes.length || end <= space + 2 || bytes[end - 1] !== 10) invalid();
      const equals = bytes.indexOf(61, space + 1);
      if (equals <= space + 1 || equals >= end - 1) invalid();
      const keyBytes = bytes.subarray(space + 1, equals);
      if (keyBytes.some(byte => byte < 33 || byte > 126)) invalid();
      const key = keyBytes.toString('ascii');
      const value = bytes.subarray(equals + 1, end - 1);
      if (!['path', 'linkpath', 'size', 'uid', 'gid', 'uname', 'gname', 'mtime', 'hdrcharset',
        'GNU.dumpdir', 'GNU.sparse.size', 'GNU.sparse.numblocks', 'GNU.sparse.offset', 'GNU.sparse.numbytes',
        'SCHILY.acl.access', 'SCHILY.acl.default'].includes(key) && !/^SCHILY\.xattr\..+$/.test(key)) invalid();
      if (result.has(key) && key !== 'GNU.sparse.offset' && key !== 'GNU.sparse.numbytes') invalid();
      if (key === 'path') path(value);
      if (key === 'GNU.dumpdir') dumpdir(value);
      result.set(key, value);
      at = end;
    }
    return result;
  };
  const header = (bytes: Buffer): void => {
    if (bytes.every(byte => byte === 0)) { zeroBlocks++; return; }
    if (zeroBlocks !== 0 || bytes.subarray(257, 263).toString('latin1') !== 'ustar\0') invalid();
    let sum = 0;
    for (let index = 0; index < bytes.length; index++) sum += index >= 148 && index < 156 ? 32 : bytes[index]!;
    if (sum !== octal(bytes.subarray(148, 156))) invalid();
    const size = octal(bytes.subarray(124, 136));
    const type = bytes[156];
    if (type === 120) { // Per-member extended PAX header; no global state or GNU longnames.
      if (fields !== undefined || size > maximumMetadata || size === 0) invalid();
      metadata = Buffer.alloc(size);
      metadataOffset = 0;
      if (observer !== undefined) extendedHeader = Buffer.from(bytes);
    } else {
      if (type !== 0 && (type === undefined || type < 48 || type > 54)) invalid();
      const prefix = name(bytes.subarray(345, 500));
      const memberName = name(bytes.subarray(0, 100));
      const member = fields?.get('path') ?? (prefix.length === 0 ? memberName : Buffer.concat([prefix, Buffer.from('/'), memberName]));
      path(member);
      const memberPath = member.toString('latin1').replace(/\/$/, '');
      const isRoot = memberPath === '.';
      if (isRoot) { if (rootSeen || type !== 53) invalid(); rootSeen = true; }
      if (!rootSeen) invalid();
      if (seen.has(memberPath)) invalid();
      if (!isRoot && expected.get(memberPath) !== (type === 53 ? 68 : 89)) invalid();
      seen.add(memberPath);
      if (type === 53 && !fields?.has('GNU.dumpdir')) invalid();
      if (type !== 53 && fields?.has('GNU.dumpdir')) invalid();
      if (type === 53) for (const [child, kind] of dumpdir(fields!.get('GNU.dumpdir')!)) {
        const childPath = memberPath + '/' + child;
        if (expected.has(childPath)) invalid();
        nameBytes += childPath.length;
        if (expected.size >= 1_000_000 || nameBytes > 64 * 1024 * 1024) invalid();
        expected.set(childPath, kind);
      }
      const link = fields?.get('linkpath') ?? name(bytes.subarray(157, 257));
      if (type === 49) path(link); // Hardlinks must stay in the same archive tree.
      if (type !== 49 && type !== 50 && link.length !== 0) invalid();
      if (type === 50 && link.includes(0)) invalid(); // Absolute/dangling symlinks are legitimate.
      if (type !== 0 && type !== 48 && size !== 0) invalid();
      if (fields?.has('size')) {
        const declared = fields.get('size')!.toString('ascii');
        if (!/^[0-9]+$/.test(declared) || Number(declared) !== size) invalid();
      }
      if (observer !== undefined) {
        observer.member(Buffer.from(memberPath, 'latin1'), type === 0 ? 48 : type!, Buffer.from(link),
          encodedExtended === undefined ? Buffer.from(bytes) : Buffer.concat([encodedExtended, bytes]));
        encodedExtended = undefined;
        memberActive = size !== 0;
        if (!memberActive) observer.end();
      }
      fields = undefined;
    }
    remaining = size;
    padding = (512 - size % 512) % 512;
  };
  return {
    write(chunk) {
      if (failed) invalid();
      try {
        if (chunk.length > 64 * 1024) invalid();
        pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
        while (pending.length > 0) {
          if (remaining > 0) {
            const count = Math.min(remaining, pending.length);
            if (metadata !== undefined) { pending.copy(metadata, metadataOffset, 0, count); metadataOffset += count; }
            else if (memberActive) observer!.data(pending.subarray(0, count));
            remaining -= count;
            pending = pending.subarray(count);
            if (remaining === 0 && metadata !== undefined) {
              fields = pax(metadata);
              if (extendedHeader !== undefined) {
                encodedExtended = Buffer.concat([extendedHeader, metadata, Buffer.alloc((512 - metadata.length % 512) % 512)]);
                extendedHeader = undefined;
              }
              metadata = undefined;
            } else if (remaining === 0 && memberActive) { memberActive = false; observer!.end(); }
          } else if (padding > 0) {
            const count = Math.min(padding, pending.length);
            if (pending.subarray(0, count).some(byte => byte !== 0)) invalid();
            padding -= count; pending = pending.subarray(count);
          } else {
            if (pending.length < 512) break;
            const block = pending.subarray(0, 512); pending = pending.subarray(512);
            header(block);
          }
        }
      } catch { failed = true; invalid(); }
    },
    finish() {
      if (failed || remaining !== 0 || padding !== 0 || pending.length !== 0 ||
          metadata !== undefined || fields !== undefined || !rootSeen || zeroBlocks < 2 || seen.size !== expected.size + 1) invalid();
      failed = true; // Terminal: callers cannot append a second archive after acceptance.
    },
  };
}
