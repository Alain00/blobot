/** Guest-private manifest followed by the complete PAX stream; host frames remain opaque. */
export function sbxStateBundleHeader(metadata: Buffer): Buffer {
  if (!Buffer.isBuffer(metadata) || metadata.length === 0 || metadata.length > 64 * 1024 * 1024) {
    throw new Error('Machine state metadata exceeds its bound.');
  }
  const header = Buffer.alloc(12);
  header.write('BLBTST01', 'ascii');
  header.writeUInt32BE(metadata.length, 8);
  return header;
}

/**
 * Self-contained for a guest bootstrap. The manifest is bounded in guest memory and delivered
 * before a single archive byte. The receiver can plan/validate restoration before starting
 * tar; it need not buffer a multi-GiB archive or persist a payload on the host.
 */
export function createSbxStateBundleReader(consumer: {
  metadata(value: Buffer): Promise<void>;
  archive(value: Buffer): Promise<void>;
}): { write(chunk: Buffer): Promise<void>; finish(): void } {
  const header = Buffer.alloc(12);
  let headerBytes = 0;
  let metadata: Buffer | undefined;
  let metadataBytes = 0;
  let ready = false;
  let archiveBytes = 0;
  let ended = false;
  let busy = false;
  const invalid = (): never => { throw new Error('Machine state bundle is invalid.'); };
  return {
    async write(chunk) {
      if (ended || busy || !Buffer.isBuffer(chunk) || chunk.length === 0 || chunk.length > 65536) {
        ended = true; return invalid();
      }
      busy = true;
      try {
        let at = 0;
        if (headerBytes < 12) {
          const count = Math.min(12 - headerBytes, chunk.length);
          chunk.copy(header, headerBytes, at, at + count);
          headerBytes += count; at += count;
          if (headerBytes !== 12) return;
          if (header.subarray(0, 8).toString('ascii') !== 'BLBTST01') invalid();
          const length = header.readUInt32BE(8);
          if (length === 0 || length > 64 * 1024 * 1024) invalid();
          metadata = Buffer.alloc(length);
        }
        if (!ready) {
          if (metadata === undefined) invalid();
          const count = Math.min(metadata!.length - metadataBytes, chunk.length - at);
          chunk.copy(metadata!, metadataBytes, at, at + count);
          metadataBytes += count; at += count;
          if (metadataBytes !== metadata!.length) return;
          await consumer.metadata(metadata!);
          if (ended) invalid();
          metadata = undefined;
          ready = true;
        }
        if (at < chunk.length) {
          const value = chunk.subarray(at);
          archiveBytes += value.length;
          if (!Number.isSafeInteger(archiveBytes)) invalid();
          await consumer.archive(value);
          if (ended) invalid();
        }
      } catch {
        ended = true;
        invalid();
      } finally { busy = false; }
    },
    finish() {
      if (ended || busy || !ready || archiveBytes < 1024) { ended = true; invalid(); }
      ended = true;
    },
  };
}
