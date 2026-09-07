import { describe, expect, it } from 'vitest';
import { copySbxData } from './data-transfer.js';

describe('private Machine data transfer', () => {
  const options = {
    source: { name: 'blobot-source', id: 'source-id' },
    target: { name: 'blobot-target', id: 'target-id' },
    guestNode: '/usr/bin/node',
  };
  it('rejects an identical source and replacement before opening a client', async () => {
    await expect(copySbxData({ ...options, target: options.source })).rejects.toThrow('different sandbox');
    await expect(copySbxData({ ...options, target: { ...options.target, id: options.source.id } })).rejects.toThrow('different sandbox');
  });
  it('rejects unaddressable references and invalid deadlines', async () => {
    await expect(copySbxData({ ...options, source: { ...options.source, name: '--cloud' } })).rejects.toThrow('reference');
    await expect(copySbxData({ ...options, timeoutMs: Infinity })).rejects.toThrow('timeout');
    await expect(copySbxData({ ...options, guestNode: 'node' })).rejects.toThrow('Node path');
  });
  it('does not start any client when already cancelled', async () => {
    await expect(copySbxData({ ...options, sbxExecutable: '/must/not/run', signal: AbortSignal.abort() }))
      .rejects.toThrow('cancelled');
  });
  it('reports failure without leaking client stderr or arguments', async () => {
    await expect(copySbxData({ ...options, sbxExecutable: '/not-a-real-binary-sensitive-path' }))
      .rejects.toThrow('Sandbox data transfer could not be verified; the original was kept.');
  });
});
