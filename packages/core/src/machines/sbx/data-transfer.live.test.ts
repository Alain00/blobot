import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { copySbxData, type SbxReference } from './data-transfer.js';
import { renderSbxKit } from './kit.js';
import { sbxClientEnvironment } from './client-environment.js';

const exec = promisify(execFile);
it.skipIf(process.env['BLOBOT_LIVE_SBX_RC5'] !== '1')('copies private volumes to new limits, verifies data, and retains the original', async () => {
  const run = async (args: string[]) => (await exec('sbx', args, {
    env: sbxClientEnvironment(), timeout: 60_000, maxBuffer: 1024 * 1024,
  })).stdout;
  const root = await mkdtemp(join(tmpdir(), 'blobot-transfer-'));
  const prefix = `blobot-transfer-${randomUUID()}`;
  const names = [`${prefix}-old`, `${prefix}-new`];
  const created = new Set<string>();
  const list = async (): Promise<(SbxReference & { status: string })[]> => JSON.parse(await run(['ls', '--json'])).sandboxes;
  const guest = (name: string, code: string) => run(['exec', '-u', '0', name, '/usr/bin/node', '-e', code]);
  const inspect = `const fs=require('node:fs');console.log(JSON.stringify({cpus:require('node:os').cpus().length,mem:fs.readFileSync('/proc/meminfo','utf8').split('\\n')[0],homeMode:fs.statSync('/home/agent').mode&511,workspaceMode:fs.statSync('/workspace').mode&511,marker:fs.readFileSync('/home/agent/.session','utf8'),link:fs.readlinkSync('/workspace/link'),links:fs.statSync('/workspace/hard').nlink,sparseBlocks:fs.statSync('/workspace/sparse').blocks}));`;
  try {
    expect(JSON.parse(await run(['daemon', 'status', '--json'])).status).toBe('running');
    expect(JSON.parse(await run(['version', '--json'])).client.version).toBe('v0.42.0-rc5');
    expect(JSON.parse(await run(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])).value).toBe(false);
    const images = JSON.parse(await run(['template', 'ls', '--json'])).images;
    expect(images.some((image: { tag: string }) => image.tag === 'shell-docker')).toBe(true);
    const kit = join(root, 'kit');
    await mkdir(kit);
    await writeFile(join(kit, 'spec.yaml'), renderSbxKit({
      image: 'docker/sandbox-templates:shell-docker', guestNode: '/usr/bin/node',
      dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2,
    }));
    for (const [index, name] of names.entries()) {
      expect((await list()).some((box) => box.name === name)).toBe(false);
      created.add(name); // also clean a create that failed after allocating the owned name
      await run(['create', '--name', name, '--cpus', String(index + 2), '--memory', `${index + 2}g`, kit]);
    }
    const source = (await list()).find((box) => box.name === names[0])!;
    const target = (await list()).find((box) => box.name === names[1])!;
    await guest(source.name, `
      const fs=require('node:fs');
      fs.writeFileSync('/home/agent/.session','synthetic-session',{mode:384});
      fs.writeFileSync('/workspace/data',Buffer.from([0,255,128,10]),{mode:493});
      fs.linkSync('/workspace/data','/workspace/hard');fs.symlinkSync('data','/workspace/link');
      const fd=fs.openSync('/workspace/sparse','w');fs.ftruncateSync(fd,32*1024*1024);fs.writeSync(fd,Buffer.from('end'),0,3,32*1024*1024-3);fs.closeSync(fd);
    `);
    const before = JSON.parse(await guest(source.name, inspect));
    expect(before.homeMode).toBe(448);
    expect(before.workspaceMode).toBe(448);
    const transferred = await copySbxData({ source, target, guestNode: '/usr/bin/node', timeoutMs: 60_000 });
    expect(transferred.bytes).toBeGreaterThan(0);
    expect(transferred.bytes).toBeLessThan(1024 * 1024);
    await run(['stop', target.name]);
    const after = JSON.parse(await guest(target.name, inspect));
    expect(after.cpus).toBe(3);
    expect(after.mem).not.toBe(before.mem);
    expect(after.marker).toBe('synthetic-session');
    expect(after.link).toBe('data');
    expect(after.links).toBe(2);
    expect(after.sparseBlocks).toBeLessThan(100);
    expect(after.homeMode).toBe(448);
    expect(after.workspaceMode).toBe(448);
    await run(['stop', source.name]);
    expect(JSON.parse(await guest(source.name, inspect))).toEqual(before);
    await expect(copySbxData({ source: { ...source, id: 'wrong-id' }, target, guestNode: '/usr/bin/node' }))
      .rejects.toThrow('original was kept');
  } finally {
    for (const name of created) if ((await list()).some((box) => box.name === name)) await run(['rm', '-f', name]);
    await rm(root, { recursive: true, force: true });
  }
}, 180_000);
