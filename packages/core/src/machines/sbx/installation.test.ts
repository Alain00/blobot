import { describe, expect, it } from 'vitest';
import { sbxInstallArtifact, validateSbxArchiveMembers } from './installation.js';

describe('sandbox installation admission', () => {
  it('offers exact supported host releases and publisher-pinned artifacts', () => {
    expect(sbxInstallArtifact('darwin', 'arm64', '23.0.0')?.kind).toBe('archive');
    expect(sbxInstallArtifact('darwin', 'x64', '25.0.0')).toBeUndefined();
    expect(sbxInstallArtifact('darwin', 'arm64', '22.0.0')).toBeUndefined();
    expect(sbxInstallArtifact('linux', 'x64', 'ID=ubuntu\nVERSION_ID="24.04"')?.file).toContain('amd64-ubuntu2404.deb');
    expect(sbxInstallArtifact('linux', 'arm64', 'ID=ubuntu\nVERSION_ID="26.04"')?.sha256).toHaveLength(64);
    expect(sbxInstallArtifact('linux', 'x64', 'ID=debian\nVERSION_ID="24.04"')).toBeUndefined();
    expect(sbxInstallArtifact('linux', 'x64', 'ID=ubuntu\nVERSION_ID="22.04"')).toBeUndefined();
    expect(sbxInstallArtifact('win32', 'arm64', '')).toBeUndefined();
  });
  it('rejects archive escape paths and links before extraction', () => {
    const listing = '-rwxr-xr-x user group 1 date bin/sbx\ndrwxr-xr-x user group 0 date bin/';
    expect(() => validateSbxArchiveMembers('bin/sbx\nbin/', listing)).not.toThrow();
    for (const path of ['../bin', 'bin/../outside', '/bin', 'libexec/./file', 'bin/file name']) {
      expect(() => validateSbxArchiveMembers(`bin/sbx\n${path}`, listing)).toThrow();
    }
    expect(() => validateSbxArchiveMembers('bin/sbx\nbin/link', listing.replace('drwx', 'lrwx'))).toThrow();
  });
});
