import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { PersonalDirectories } from '../../personal/personal-directory.js';
import { LocalMachine } from '../local-machine.js';
import type { Machine } from '../machine.js';
import { OwnedSbxMachine } from './owned-machine.js';
import { SbxRegistry } from './registry.js';
import { sbxClientEnvironment } from './client-environment.js';

const exec = promisify(execFile);
it.skipIf(process.env['BLOBOT_LIVE_SBX_RC5'] !== '1')('shares a profile folder across local and concurrent boxes while preserving legacy private state and deletion boundaries', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-personal-live-')));
  const registry = new SbxRegistry(join(root, 'machines')), profiles = new PersonalDirectories(join(root, 'personal storage'));
  const ids = ['contab', 'blue', 'other'].map(name => `${name}-${randomUUID()}`);
  const machines: Machine[] = [];
  const run = async (args: string[]) => (await exec('sbx', args, { env: sbxClientEnvironment(), timeout: 90_000, maxBuffer: 1024 * 1024 })).stdout;
  const create = async (id: string, profileId?: string) => {
    const workspace = join(root, id); await mkdir(workspace, { recursive: true });
    const machine = new OwnedSbxMachine({ agentId: id, registry,
      kit: { image: 'docker/sandbox-templates:shell-docker', guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2,
        workspace: { path: workspace, commonGit: [] } },
      limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 },
      ...(profileId === undefined ? {} : { personalDirectory: profiles.forProfile(profileId) }),
      transport: { moduleRoot: '/opt/blobot', allowedEnvironment: [] },
    });
    machines.push(machine); return machine;
  };
  const command = async (machine: Machine, source: string) => {
    const channel = machine.spawn({ cwd: machine.location().workspacePath,
      command: { kind: 'exec', executable: machine.kind === 'box' ? '/usr/bin/node' : process.execPath, args: ['-e', source] } });
    const lines = [];
    for await (const line of channel.lines()) lines.push(line);
    await channel.close(); return lines;
  };
  try {
    // Uses the existing engine and cached shell image; no provider login, image install or global settings changes.
    const legacy = await create(ids[0]!);
    await legacy.start({ mailboxPort: 34561 });
    await command(legacy, 'require("node:fs").writeFileSync("/home/agent/private-fixture", "original private state")');
    const original = (await registry.read(ids[0]!))!.active!;
    await legacy.stop();

    const contab = await create(ids[0]!, 'ana'), blue = await create(ids[1]!, 'ana'), other = await create(ids[2]!, 'bea');
    const local = new LocalMachine({ agentId: 'ana-local', workspacePath: root }, { personalDirectory: profiles.forProfile('ana') });
    machines.push(local);
    await local.start({ mailboxPort: 34561 });
    await command(local, 'require("node:fs").writeFileSync(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs", "console.log(42)", {mode:448})');
    await contab.start({ mailboxPort: 34561 });
    await blue.start({ mailboxPort: 34562 });
    await other.start({ mailboxPort: 34563 });
    expect((await registry.read(ids[0]!))!.active).toEqual(original);
    expect(contab.location().personalPath).toBe(blue.location().personalPath);
    expect(await command(contab, 'console.log(require("node:fs").readFileSync("/home/agent/private-fixture","utf8"))'))
      .toEqual(['original private state']);
    expect(await command(blue, 'require(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs")')).toEqual(['42']);
    await command(contab, 'require("node:fs").writeFileSync(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs", "console.log(43)")');
    expect(await command(blue, 'require(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs")')).toEqual(['43']);
    expect(await command(local, 'require(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs")')).toEqual(['43']);

    const hidden = [contab.location().personalPath!, contab.location().workspacePath, '/mnt/host'];
    expect(await command(other, `console.log(JSON.stringify(${JSON.stringify(hidden)}.map(p=>{try{return require('node:fs').readdirSync(p).length>0}catch{return false}})))`))
      .toEqual(['[false,false,false]']);
    expect(await command(blue, 'console.log(require("node:fs").existsSync("/home/agent/private-fixture"))')).toEqual(['false']);
    await Promise.all([contab.beforeWork(), blue.beforeWork(), other.beforeWork()]);
    await blue.stop(); await blue.start({ mailboxPort: 34562 });
    expect(await command(blue, 'require(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs")')).toEqual(['43']);
    await contab.stop(); await contab.destroy();
    expect(await registry.read(ids[0]!)).toBeUndefined();
    expect(await command(blue, 'require(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs")')).toEqual(['43']);
    await blue.stop(); await other.stop(); await local.stop();

    const reopenedProfiles = new PersonalDirectories(profiles.root);
    const reopened = new OwnedSbxMachine({ agentId: ids[1]!, registry: new SbxRegistry(registry.directory),
      kit: (await registry.read(ids[1]!))!.kit, limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 },
      personalDirectory: reopenedProfiles.forProfile('ana'), transport: { moduleRoot: '/opt/blobot', allowedEnvironment: [] } });
    machines.push(reopened);
    await reopened.start({ mailboxPort: 34562 });
    expect(await command(reopened, 'require(process.env.BLOBOT_PERSONAL_DIR+"/utility.cjs")')).toEqual(['43']);
    await reopened.stop(); await reopened.destroy(); await other.destroy();
    const retained = await reopenedProfiles.forProfile('ana').prepare();
    expect(await readFile(join(retained.path, 'utility.cjs'), 'utf8')).toBe('console.log(43)');
    await writeFile(join(retained.path, 'after-all-teams'), 'still personal');
  } finally {
    for (const machine of machines.reverse()) await machine.stop().catch(() => {});
    for (const id of ids) {
      const record = await registry.read(id);
      for (const reference of [...record?.active ? [record.active] : [], ...record?.retained ?? [],
        ...record?.pending?.id === undefined ? [] : [{ name: record.pending.name, id: record.pending.id }]]) {
        const boxes = JSON.parse(await run(['ls', '--json'])).sandboxes as { name: string; id: string }[];
        if (boxes.some(box => box.name === reference.name && box.id === reference.id)) await run(['rm', '-f', reference.name]);
      }
    }
    await rm(root, { recursive: true, force: true });
  }
}, 240_000);
