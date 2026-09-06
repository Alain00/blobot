import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersonalDirectories } from '../../../../packages/core/src/personal/personal-directory.js';
import { OwnedSbxMachine } from '../../../../packages/core/src/machines/sbx/owned-machine.js';
import { SbxRegistry } from '../../../../packages/core/src/machines/sbx/registry.js';
import { CODEX_MACHINE_IMAGE } from '../../../../packages/core/src/adapters/codex/image.js';
import { JsonRpcConnection } from '../../../../packages/core/src/adapters/acp/jsonrpc.js';

const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-box-skill-')));
const cwd = join(root, 'workspace');
const operator = join(root, 'synthetic-operator-skills');
const personal = new PersonalDirectories(join(root, 'profiles')).forProfile('ana');
await personal.prepare();
await mkdir(cwd);
await mkdir(operator);
const suffix = randomUUID().slice(0, 8);
const names = { operator: `operator-${suffix}`, personal: `personal-${suffix}`, project: `project-${suffix}` };
for (const [source, skillRoot] of [
  ['operator', operator], ['personal', join(personal.path, '.agents', 'skills')], ['project', join(cwd, '.agents', 'skills')],
] as const) {
  const skillDir = join(skillRoot, names[source]);
  await mkdir(join(skillDir, 'references'), { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), `---\nname: ${names[source]}\ndescription: Offline ${source} discovery fixture.\n---\nRead references/proof.txt.\n`);
  await writeFile(join(skillDir, 'references', 'proof.txt'), `SYNTHETIC-${source}-${suffix}`);
}
await mkdir(join(personal.path, '.claude'));
await symlink('../.agents/skills', join(personal.path, '.claude', 'skills'));
const registry = new SbxRegistry(join(root, 'machines'));
const image = CODEX_MACHINE_IMAGE;
const machine = new OwnedSbxMachine({ agentId: `skill-probe-${suffix}`, registry,
  kit: { image: image.builds.find(build => build.arch === 'arm64')!.reference, guestNode: image.guestNode,
    dataBytes: 512 * 1024 ** 2, dockerBytes: 512 * 1024 ** 2,
    workspace: { path: cwd, commonGit: [], sharedSkillsPath: operator }, sharedSkillLocations: image.sharedSkillLocations },
  limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 }, personalDirectory: personal,
  transport: { moduleRoot: image.moduleRoot, allowedEnvironment: image.allowedEnvironment } });
let connection: JsonRpcConnection | undefined;
const result: Record<string, unknown> = { root, names, image: image.builds[0]!.reference, errors: [] };
const errors = result.errors as string[];
try {
  await machine.start({ mailboxPort: 34561 });
  console.log(JSON.stringify({ phase: 'box-started', root, name: `skill-probe-${suffix}` }));
  const transport = machine.spawn({ cwd, command: { kind: 'exec', executable: image.executable,
    args: ['app-server', '--listen', 'stdio://'] } });
  connection = new JsonRpcConnection(transport);
  connection.listen();
  await connection.request('initialize', { clientInfo: { name: 'blobot_skills_probe', version: '0.0.0' } });
  connection.notify('initialized', {});
  await connection.request('skills/extraRoots/set', { extraRoots: [join(personal.path, '.agents', 'skills')] });
  const listed = await connection.request<any>('skills/list', { cwds: [cwd], forceReload: true });
  result.skills = listed.data.flatMap((data: any) => data.skills).filter((skill: any) => Object.values(names).includes(skill.name))
    .map((skill: any) => ({ name: skill.name, path: skill.path, enabled: skill.enabled, scope: skill.scope }));
  const resource = join(personal.path, '.claude', 'skills', names.personal, 'references', 'proof.txt');
  const read = await connection.request<any>('fs/readFile', { path: resource });
  result.aliasResourceRead = Buffer.from(read.dataBase64, 'base64').toString('utf8') === `SYNTHETIC-personal-${suffix}`;
  result.allScopesDiscovered = Object.values(names).every(name => (result.skills as any[]).some(skill => skill.name === name));
} catch (error) { errors.push(String(error)); }
finally {
  await connection?.close().catch(error => errors.push(`connection close: ${error}`));
  await machine.stop().catch(error => errors.push(`stop: ${error}`));
  await machine.destroy().catch(error => errors.push(`destroy: ${error}`));
  result.registryRemoved = await registry.read(`skill-probe-${suffix}`) === undefined;
}
await writeFile(join(import.meta.dirname, 'sandbox-codex-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
