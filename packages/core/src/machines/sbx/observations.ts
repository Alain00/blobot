import type { MachineLimits } from '../resources.js';
import type { SbxReference } from './data-transfer.js';
import { validateBoxWorkspaceMounts, type BoxWorkspaceMounts } from '../../workspace/box-mounts.js';
import { PERSONAL_DIRECTORY_MARKER, validatePersonalDirectory, type PersonalDirectoryReference } from '../../personal/personal-directory.js';

/** The development pin approved by the operator. Not a production prerelease policy. */
export const SBX_DEVELOPMENT_PIN = Object.freeze({
  version: 'v0.42.0-rc5', revision: 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a',
});

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Sandbox observation is incomplete.');
  return value as ObjectValue;
}

export function verifySbxVersion(value: unknown): void {
  const root = object(value), client = object(root['client']), server = object(root['server']);
  for (const side of [client, server]) {
    if (side['version'] !== SBX_DEVELOPMENT_PIN.version || side['revision'] !== SBX_DEVELOPMENT_PIN.revision) {
      throw new Error('The sandbox engine version is not supported.');
    }
  }
  if (server['state'] !== 'running') throw new Error('The sandbox engine is not running.');
}

export function verifySbxReference(value: unknown, expected: SbxReference): void {
  const boxes = object(value)['sandboxes'];
  if (!Array.isArray(boxes)) throw new Error('Sandbox inventory is unavailable.');
  const matching = boxes.map(object).filter((box) => box['name'] === expected.name);
  if (matching.length !== 1 || matching[0]?.['id'] !== expected.id) {
    throw new Error('The recorded sandbox is missing or has been replaced. Its data was not adopted.');
  }
}

export function verifySbxStopped(value: unknown, expected: SbxReference): void {
  verifySbxReference(value, expected);
  const boxes = object(value)['sandboxes'] as unknown[];
  if (boxes.map(object).find((box) => box['id'] === expected.id)?.['status'] !== 'stopped') {
    throw new Error('The sandbox did not confirm that it stopped.');
  }
}

/** Fixed code, no application paths or payload values. Run as root and the Agent UID. */
export const SBX_BOUNDARY_PROBE = String.raw`
const fs=require('node:fs'),os=require('node:os');
const mountinfo=fs.readFileSync('/proc/self/mountinfo','utf8');
let personal;
if(process.argv[2]){const p=JSON.parse(process.argv[2]);
 try{const s=fs.lstatSync(p.path);const fd=fs.openSync(p.path+'/'+p.marker,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{if(!fs.fstatSync(fd).isFile())throw Error('Invalid marker');personal={path:p.path,directory:s.isDirectory()&&!s.isSymbolicLink(),identity:fs.readFileSync(fd,'utf8')}}finally{fs.closeSync(fd)}}
 catch(e){personal={path:p.path,unavailable:true}}}
let sshAbsent=false;try{fs.lstatSync('/run/ssh-agent.sock')}catch(e){if(e.code!=='ENOENT')throw e;sshAbsent=true}
console.log(JSON.stringify({uid:process.getuid(),cpus:os.cpus().length,
 memoryKiB:Number(/^MemTotal:\s+(\d+) kB$/m.exec(fs.readFileSync('/proc/meminfo','utf8'))?.[1]),
 sshAbsent,mountinfo,personal,
 roots:JSON.parse(process.argv[1]||'["/home/agent","/workspace"]').map(path=>{const s=fs.lstatSync(path);
 const mounts=mountinfo.trim().split('\n').map(line=>line.split(' ')).filter(fields=>fields[4]===path);
 let blockBytes; if(mounts.length===1){try{blockBytes=Number(fs.readFileSync('/sys/dev/block/'+mounts[0][2]+'/size','utf8'))*512}catch{}}
 return {path,uid:s.uid,gid:s.gid,mode:s.mode&4095,directory:s.isDirectory(),device:s.dev,blockBytes}})}));
`;

export interface SbxBoundaryBaseline {
  /** Exact observed guest MemTotal, not host RSS and not a reserved RAM claim. */
  readonly memoryKiB: number;
  readonly mounts: string;
}

/**
 * Limited observable admission, accepted by the author. The recorded ID is indispensable;
 * these checks cannot establish immutable image/config identity against out-of-band changes.
 */
export function verifySbxBoundary(value: unknown, limits: MachineLimits, uid: 0 | 1000,
  baseline?: SbxBoundaryBaseline, workspace?: BoxWorkspaceMounts,
  storage?: { readonly homeBytes: number; readonly dockerBytes: number }, personal?: PersonalDirectoryReference): SbxBoundaryBaseline {
  if (workspace !== undefined) validateBoxWorkspaceMounts(workspace, personal?.path);
  if (personal !== undefined) {
    validatePersonalDirectory(personal);
    if (workspace === undefined) validateBoxWorkspaceMounts({ path: personal.path, commonGit: [] });
  }
  const privatePaths = [...(workspace === undefined ? ['/home/agent', '/workspace'] : ['/home/agent']),
    ...(storage === undefined ? [] : ['/var/lib/docker'])];
  const data = object(value);
  if (data['uid'] !== uid || data['sshAbsent'] !== true || data['cpus'] !== limits.maxCpus) {
    throw new Error('Sandbox identity, CPU ceiling or SSH isolation could not be verified.');
  }
  const memory = data['memoryKiB'];
  // The kernel consumes part of the configured capacity. Compare subsequent observations
  // exactly with the initial baseline; this range alone does NOT prove an exact RAM ceiling.
  if (typeof memory !== 'number' || !Number.isSafeInteger(memory) || memory <= 0 ||
      memory * 1024 > limits.maxMemoryBytes || memory * 1024 < limits.maxMemoryBytes * 0.9 ||
      (baseline !== undefined && memory !== baseline.memoryKiB)) {
    throw new Error('Sandbox memory capacity could not be verified.');
  }
  if (typeof data['mountinfo'] !== 'string' || !Array.isArray(data['roots']) || data['roots'].length !== privatePaths.length) {
    throw new Error('Sandbox storage could not be verified.');
  }
  const mounts = data['mountinfo'].trim().split('\n').map((line) => {
    const [left, right] = line.split(' - ');
    const fields = left?.split(' '), tail = right?.split(' ');
    if (!fields || fields.length < 6 || !tail || tail.length < 3) throw new Error('Unknown sandbox mount format.');
    return { path: fields[4]?.replace(/\\([0-7]{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8))), mode: fields[5]?.split(','), kind: tail[0] };
  });
  for (const path of privatePaths) {
    const roots = data['roots'].map(object).filter((root) => root['path'] === path);
    const root = roots[0];
    const docker = path === '/var/lib/docker';
    if (roots.length !== 1 || root?.['uid'] !== (docker ? 0 : 1000) || root['gid'] !== (docker ? 0 : 1000) ||
        root['mode'] !== (docker ? 0o710 : 0o700) || root['directory'] !== true) {
      throw new Error('Sandbox private volume permissions do not match.');
    }
    const capacity = path === '/home/agent' ? storage?.homeBytes : docker ? storage?.dockerBytes : undefined;
    if (capacity !== undefined && root['blockBytes'] !== capacity) throw new Error('Sandbox private volume capacity does not match.');
    const mounted = mounts.filter((mount) => mount.path === path);
    if (mounted.length !== 1 || mounted[0]?.kind !== 'ext4' || !mounted[0].mode?.includes('rw')) {
      throw new Error('Sandbox private volume mount does not match.');
    }
  }
  const hostMounts = mounts.filter((mount) => mount.kind === 'virtiofs');
  const expected = [['/etc/hosts', 'ro'], ['/etc/resolv.conf', 'ro'],
    ...(workspace === undefined ? [] : [workspace.path, ...workspace.commonGit].map((path) => [path, 'rw'])),
    ...(workspace?.sharedSkillsPath === undefined ? [] : [[workspace.sharedSkillsPath, 'ro']]),
    ...(personal === undefined ? [] : [[personal.path, 'rw']])];
  if (hostMounts.length !== expected.length || !expected.every(([path, mode]) =>
    hostMounts.filter((mount) => mount.path === path && mount.mode?.includes(mode!)).length === 1)) {
    throw new Error('Unexpected host mounts are exposed to this sandbox.');
  }
  if (personal !== undefined) {
    const observed = object(data['personal']);
    if (observed['path'] !== personal.path || observed['identity'] !== personal.identity || observed['directory'] !== true) {
      throw new Error('The sandbox’s personal folder identity could not be verified.');
    }
  }
  if (mounts.some((mount) => mount.path?.startsWith('/home/agent/') || mount.path?.startsWith('/workspace/'))) {
    throw new Error('Unexpected nested mounts in private storage.');
  }
  const kinds = new Set(['overlay', 'ext4', 'proc', 'tmpfs', 'devtmpfs', 'sysfs', 'cgroup2', 'devpts', 'mqueue', 'virtiofs']);
  if (mounts.some((mount) => !kinds.has(mount.kind ?? ''))) throw new Error('Unknown sandbox filesystem boundary.');
  // Inner containers can add mounts below their own data root. The top-level private
  // device and every host mount remain checked; their workload does not change that boundary.
  const normalized = JSON.stringify(mounts.filter(mount => mount.path !== personal?.path &&
    (storage === undefined || !mount.path?.startsWith('/var/lib/docker/')))
    .map((mount) => [mount.path, mount.kind, [...mount.mode ?? []].sort()]).sort());
  if (baseline !== undefined && normalized !== baseline.mounts) throw new Error('Sandbox mounts changed.');
  const roots = data['roots'].map(object);
  if (roots.some((root) => typeof root['device'] !== 'number') || new Set(roots.map((root) => root['device'])).size !== roots.length) {
    throw new Error('Private volumes are not separate devices.');
  }
  return { memoryKiB: memory, mounts: normalized };
}

export function personalBoundaryArgument(personal: PersonalDirectoryReference): string {
  return JSON.stringify({ path: personal.path, marker: PERSONAL_DIRECTORY_MARKER });
}

export interface SbxMailboxRule { readonly id: string; readonly port: number; }
/** Open network permission is owned by one Machine; the port is a readiness check, not a fence. */
export interface SbxNetworkRule { readonly id: string; readonly mailboxPort: number; }

/** RC5 uses null for an empty scoped result when a different sandbox has explicit rules. */
export function readSbxNetworkRules(value: unknown): Record<string, unknown>[] {
  const rules = object(value)['rules'];
  if (rules === null) return [];
  if (!Array.isArray(rules)) throw new Error('Sandbox network policy could not be verified.');
  return rules.map((value) => {
    const rule = object(value);
    if (typeof rule['id'] !== 'string' || rule['id'] === '') throw new Error('Sandbox network policy could not be verified.');
    return rule;
  });
}

/** RC5 omits its synthetic default-deny row as soon as any explicit rule exists. */
export function verifySbxNetworkRules(rules: readonly Record<string, unknown>[], allowGlobal = false): void {
  if (rules.some((rule) => rule['status'] !== 'active' ||
      (rule['decision'] !== 'deny' && !(allowGlobal && rule['scope'] === 'global' && rule['decision'] === 'allow')) ||
      rule['resource_type'] !== 'network' || !Array.isArray(rule['resources']) ||
      rule['resources'].length === 0 || !rule['resources'].every((resource: unknown) => typeof resource === 'string'))) {
    throw new Error('Unexpected sandbox network permissions.');
  }
}

/** Supplement the full rule inventory with the daemon's effective authorizer, never a substitute for it. */
export function verifySbxNetworkCheck(value: unknown, name: string, target: string, allowed: boolean): void {
  const data = object(value);
  if (data['type'] !== 'network' || data['action'] !== 'net:connect:tcp' || data['context'] !== `sandbox:${name}` ||
      data['target'] !== target || data['resource_value'] !== target || data['resource_type'] !== 'net:domain' ||
      data['allowed'] !== allowed || object(data['governance'])['active'] !== false ||
      (!allowed && data['deny_kind'] !== 'implicit')) {
    throw new Error('Effective sandbox network permissions could not be verified.');
  }
}

/** Only a recorded, exact scoped ID can authorize revocation. A matching resource is not ownership. */
export function verifySbxMailboxRule(value: unknown, name: string, expected: SbxMailboxRule): void {
  verifyScopedAllow(value, name, expected.id, `localhost:${expected.port}`);
}

export function verifySbxOpenNetworkRule(value: unknown, name: string, expected: SbxNetworkRule): void {
  if (!Number.isInteger(expected.mailboxPort) || expected.mailboxPort < 1 || expected.mailboxPort > 65535) {
    throw new Error('The recorded mailbox port is invalid.');
  }
  verifyScopedAllow(value, name, expected.id, '**');
}

function verifyScopedAllow(value: unknown, name: string, id: string, resource: string): void {
  const rule = object(value);
  if (rule['id'] !== id || rule['scope'] !== `sandbox:${name}` || rule['applies_to'] !== `sandbox:${name}` ||
      rule['sandbox_id'] !== name || rule['origin'] !== 'scoped' || rule['layer'] !== 'local' ||
      rule['resource_type'] !== 'network' || rule['decision'] !== 'allow' || rule['status'] !== 'active' || rule['editable'] !== true ||
      !Array.isArray(rule['resources']) || rule['resources'].length !== 1 || rule['resources'][0] !== resource) {
    throw new Error('The recorded network permission no longer matches.');
  }
}
