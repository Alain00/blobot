import { describe, expect, it } from 'vitest';
import { SBX_DEVELOPMENT_PIN, verifySbxBoundary, verifySbxMailboxRule, verifySbxReference, verifySbxVersion, verifySbxNetworkRules, verifySbxNetworkCheck, verifySbxStopped, readSbxNetworkRules } from './observations.js';

const limits = { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 };
const sample = () => ({
  uid: 0, cpus: 2, memoryKiB: 2066016, sshAbsent: true,
  roots: ['/home/agent', '/workspace'].map((path, device) => ({ path, uid: 1000, gid: 1000, mode: 0o700, directory: true, device })),
  mountinfo: '112 101 254:64 / /home/agent rw,relatime - ext4 /dev/vde rw\n' +
    '113 101 254:80 / /workspace rw,relatime - ext4 /dev/vdf rw\n' +
    '114 101 0:27 /resolv.conf /etc/resolv.conf ro,relatime - virtiofs bind-a rw\n' +
    '115 101 0:28 /hosts /etc/hosts ro,relatime - virtiofs bind-b rw\n',
});
describe('limited sbx observation admission', () => {
  it('requires a single private Docker device and the exact home/Docker capacities', () => {
    const storage = { homeBytes: 8 * 1024 ** 3, dockerBytes: 20 * 1024 ** 3 };
    const base = sample();
    const docker = { path: '/var/lib/docker', uid: 0, gid: 0, mode: 0o710, directory: true, device: 3, blockBytes: storage.dockerBytes };
    const line = '120 101 254:96 / /var/lib/docker rw,relatime - ext4 /dev/vdg rw\n';
    const observed = { ...base, roots: [...base.roots.map(root => ({ ...root, blockBytes: storage.homeBytes })), docker], mountinfo: base.mountinfo + line };
    const baseline = verifySbxBoundary(observed, limits, 0, undefined, undefined, storage);
    expect(() => verifySbxBoundary(observed, limits, 0, baseline, undefined, { ...storage, dockerBytes: 50 * 1024 ** 3 })).toThrow('capacity');
    expect(() => verifySbxBoundary({ ...observed, mountinfo: observed.mountinfo + line }, limits, 0, baseline, undefined, storage)).toThrow('mount');
    expect(() => verifySbxBoundary({ ...observed, mountinfo: observed.mountinfo + '121 120 0:32 / /var/lib/docker/overlay2/workload/merged rw - overlay overlay rw\n' }, limits, 0, baseline, undefined, storage)).not.toThrow();
    expect(() => verifySbxBoundary({ ...observed, roots: [...observed.roots.slice(0, 2), { ...docker, device: 0 }] }, limits, 0, baseline, undefined, storage)).toThrow('separate devices');
  });
  it('admits exactly the declared worktree and Git mounts, with escaped spaces and no private workspace volume', () => {
    const workspace = { path: '/Users/test/agent work', commonGit: ['/Users/test/repo/.git'] };
    const sampleValue = sample();
    const observed = { ...sampleValue, roots: sampleValue.roots.slice(0, 1),
      mountinfo: sampleValue.mountinfo.split('\n').filter((line) => !line.includes(' /workspace ')).join('\n') +
        '116 101 0:29 / /Users/test/agent\\040work rw,relatime - virtiofs work rw\n' +
        '117 101 0:30 / /Users/test/repo/.git rw,relatime - virtiofs git rw\n',
    };
    expect(() => verifySbxBoundary(observed, limits, 0, undefined, workspace)).not.toThrow();
    expect(() => verifySbxBoundary(observed, limits, 0)).toThrow();
    expect(() => verifySbxBoundary({ ...observed, mountinfo: observed.mountinfo + '118 101 0:31 / /Users/test/repo rw - virtiofs checkout rw\n' }, limits, 0, undefined, workspace)).toThrow();
  });
  it('reads RC5’s null empty scoped list, but refuses missing or malformed rule inventories', () => {
    expect(readSbxNetworkRules({ rules: null })).toEqual([]);
    expect(readSbxNetworkRules({ rules: [] })).toEqual([]);
    for (const value of [{}, { rules: {} }, { rules: false }, { rules: [null] }, { rules: [{}] }]) {
      expect(() => readSbxNetworkRules(value)).toThrow();
    }
  });
  it('requires an observed stopped state for the exact owned ID', () => {
    const reference = { name: 'blobot-alice', id: 'owned-id' };
    expect(() => verifySbxStopped({ sandboxes: [{ ...reference, status: 'stopped' }] }, reference)).not.toThrow();
    for (const patch of [{ status: 'running' }, { status: 'unknown' }, { id: 'replacement' }]) {
      expect(() => verifySbxStopped({ sandboxes: [{ ...reference, status: 'stopped', ...patch }] }, reference)).toThrow();
    }
  });
  it('accepts an implicit default deny without requiring the synthetic empty-policy row', () => {
    expect(() => verifySbxNetworkRules([])).not.toThrow();
    expect(() => verifySbxNetworkRules([{ status: 'active', decision: 'deny', resource_type: 'network', resources: ['**'] }])).not.toThrow();
    for (const rule of [{ status: 'active', decision: 'allow' }, { status: 'inactive', decision: 'deny' }, {}]) {
      expect(() => verifySbxNetworkRules([rule])).toThrow();
    }
    const target = 'blobot-admission.invalid:443';
    const check = { action: 'net:connect:tcp', allowed: false, context: 'sandbox:blobot-alice',
      deny_kind: 'implicit', governance: { active: false }, resource_type: 'net:domain',
      resource_value: target, target, type: 'network' };
    expect(() => verifySbxNetworkCheck(check, 'blobot-alice', target, false)).not.toThrow();
    for (const patch of [{ allowed: true }, { context: 'global' }, { governance: { active: true } }, { target: 'other' }, { deny_kind: 'explicit' }]) {
      expect(() => verifySbxNetworkCheck({ ...check, ...patch }, 'blobot-alice', target, false)).toThrow();
    }
    expect(() => verifySbxNetworkCheck({ ...check, allowed: true }, 'blobot-alice', target, true)).not.toThrow();
  });
  it('requires both pinned peers and the exact recorded sandbox ID', () => {
    const version = { client: SBX_DEVELOPMENT_PIN, server: { ...SBX_DEVELOPMENT_PIN, state: 'running' } };
    expect(() => verifySbxVersion(version)).not.toThrow();
    expect(() => verifySbxVersion({ ...version, server: { ...version.server, revision: 'other' } })).toThrow();
    const reference = { name: 'blobot-alice', id: 'engine-id' };
    expect(() => verifySbxReference({ sandboxes: [reference] }, reference)).not.toThrow();
    expect(() => verifySbxReference({ sandboxes: [{ ...reference, id: 'reused-name' }] }, reference)).toThrow();
    expect(() => verifySbxReference({ sandboxes: [reference, reference] }, reference)).toThrow();
    expect(() => verifySbxReference({}, reference)).toThrow();
  });
  it('reads the effective mount flags, ignores ephemeral device names, and remembers observed memory', () => {
    const observed = sample();
    const baseline = verifySbxBoundary(observed, limits, 0);
    expect(baseline.memoryKiB).toBe(2066016);
    expect(() => verifySbxBoundary({ ...observed, uid: 1000, mountinfo: observed.mountinfo.replace('/dev/vde', '/dev/vdx') }, limits, 1000, baseline)).not.toThrow();
    expect(() => verifySbxBoundary({ ...observed, memoryKiB: 2066015 }, limits, 0, baseline)).toThrow();
  });
  it.each([
    { sshAbsent: false }, { cpus: 3 }, { memoryKiB: 3 * 1024 ** 2 }, { uid: 1000 },
    { roots: [] }, { mountinfo: '' },
  ])('refuses an unverified boundary: %j', (patch) => {
    expect(() => verifySbxBoundary({ ...sample(), ...patch }, limits, 0)).toThrow();
  });
  it('refuses writable host files, unexpected mounts, shared devices and loosened permissions', () => {
    const observed = sample();
    expect(() => verifySbxBoundary({ ...observed, mountinfo: observed.mountinfo.replace('ro,relatime', 'rw,relatime') }, limits, 0)).toThrow();
    expect(() => verifySbxBoundary({ ...observed, mountinfo: observed.mountinfo + '120 101 0:29 / /private rw - virtiofs host rw\n' }, limits, 0)).toThrow();
    expect(() => verifySbxBoundary({ ...observed, roots: observed.roots.map((root) => ({ ...root, device: 1 })) }, limits, 0)).toThrow();
    expect(() => verifySbxBoundary({ ...observed, roots: observed.roots.map((root) => ({ ...root, mode: 0o755 })) }, limits, 0)).toThrow();
  });
  it('accepts only the exact scoped mailbox rule, not a matching global rule or resource', () => {
    const expected = { id: 'owned-rule', port: 3456 };
    const rule = { id: expected.id, scope: 'sandbox:blobot-alice', applies_to: 'sandbox:blobot-alice',
      sandbox_id: 'blobot-alice', origin: 'scoped', layer: 'local', resource_type: 'network',
      decision: 'allow', status: 'active', editable: true, resources: ['localhost:3456'] };
    expect(() => verifySbxMailboxRule(rule, 'blobot-alice', expected)).not.toThrow();
    for (const patch of [{ id: 'foreign' }, { origin: 'local' }, { scope: 'global' }, { resources: ['**'] }, { sandbox_id: 'engine-uuid' }]) {
      expect(() => verifySbxMailboxRule({ ...rule, ...patch }, 'blobot-alice', expected)).toThrow();
    }
  });
});
