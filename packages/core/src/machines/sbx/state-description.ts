import type { SbxArchiveMember } from './state-archive-index.js';

/** The attribute codec/backend owns the opaque attribute bytes; all fields remain guest-private. */
export interface SbxStateDescription {
  readonly members: ReadonlyMap<string, SbxArchiveMember>;
  readonly attributes: Buffer;
}

/** Self-contained, bounded codec for the manifest sent before a tree's full archive. */
export function createSbxStateDescriptionCodec(): {
  encode(value: SbxStateDescription): Buffer;
  decode(bytes: Buffer): SbxStateDescription;
} {
  const maximum = 64 * 1024 * 1024;
  const invalid = (): never => { throw new Error('Machine state description is invalid.'); };
  const binary = (value: unknown): Buffer => {
    if (typeof value !== 'string') return invalid();
    const result = Buffer.from(value, 'base64');
    if (result.toString('base64') !== value) invalid();
    return result;
  };
  const path = (value: Buffer): string => {
    const key = value.toString('latin1');
    if (key.includes('\0') || (key !== '.' && (!key.startsWith('./') ||
        key.slice(2).split('/').some(part => part === '' || part === '.' || part === '..')))) invalid();
    return key;
  };
  return {
    encode(value) {
      const rows = [...value.members.values()].map(member => [
        member.path.toString('base64'), member.type, member.link.toString('base64'), member.sha256,
      ]);
      const result = Buffer.from(JSON.stringify([1, rows, value.attributes.toString('base64')]));
      if (result.length > maximum) invalid();
      return result;
    },
    decode(bytes) {
      if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maximum) invalid();
      try {
        const value: unknown = JSON.parse(bytes.toString('utf8'));
        if (!Array.isArray(value) || value.length !== 3 || value[0] !== 1 || !Array.isArray(value[1]) ||
            value[1].length === 0 || value[1].length > 1_000_000) return invalid();
        const members = new Map<string, SbxArchiveMember>();
        let nameBytes = 0;
        for (const row of value[1] as unknown[]) {
          if (!Array.isArray(row) || row.length !== 4 || !Number.isInteger(row[1]) || row[1] < 48 || row[1] > 54 ||
              typeof row[3] !== 'string' || !/^[a-f0-9]{64}$/.test(row[3])) return invalid();
          const name = binary(row[0]), key = path(name), link = binary(row[2]), type = row[1] as number;
          nameBytes += name.length + link.length;
          if (nameBytes > maximum || members.has(key)) invalid();
          if (key === '.') { if (members.size !== 0 || type !== 53) invalid(); }
          else if (members.get(key.slice(0, key.lastIndexOf('/')))?.type !== 53) invalid();
          if (type === 49) {
            const reference = members.get(path(link));
            if (reference === undefined || reference.type === 53) invalid();
          } else if (type === 50) { if (link.includes(0)) invalid(); }
          else if (link.length !== 0) invalid();
          members.set(key, { path: name, type, link, sha256: row[3] });
        }
        return { members, attributes: binary(value[2]) };
      } catch { return invalid(); }
    },
  };
}
