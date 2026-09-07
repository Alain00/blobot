import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { renderSbxKit } from './kit.js';

const exec = promisify(execFile);
const live = process.env['BLOBOT_LIVE_SBX_RC5'] === '1' ? describe : describe.skip;

/**
 * Opt-in development acceptance probe. Never installs, changes settings, restarts the daemon,
 * imports credentials or runs a provider. The operator must prepare the engine beforehand.
 * A fake host SSH agent makes absence of the guest relay stronger than an empty environment.
 * This is not the full production boundary: image, egress and Workspace acceptance are separate.
 */
live('sbx RC5 SSH admission and mount-free creation', () => {
  it('exposes no SSH relay, even to guest root, and retains private volumes after stop', async () => {
    const root = mkdtempSync(join(tmpdir(), 'blobot-sbx-admit-'));
    const name = `blobot-admission-${process.pid}-${Date.now()}`;
    const kit = join(root, 'kit');
    const socketPath = join(root, 'ssh.sock');
    let hostConnections = 0;
    const ssh = createServer((socket) => { hostConnections += 1; socket.destroy(); });
    // Explicit host environment: no provider keys, proxy settings or real host SSH agent.
    const env = {
      HOME: process.env['HOME'], PATH: process.env['PATH'],
      SBX_NO_TELEMETRY: '1', SSH_AUTH_SOCK: socketPath,
    };
    const run = async (args: string[]) => (await exec('sbx', args, {
      env, timeout: 90_000, maxBuffer: 1024 * 1024,
    })).stdout;
    let createAttempted = false;
    try {
      await new Promise<void>((resolve, reject) => {
        ssh.once('error', reject);
        ssh.listen(socketPath, resolve);
      });
      expect(await run(['version'])).toMatch(/sbx version: v0\.42\.0-rc5 /);
      expect(JSON.parse(await run(['daemon', 'status', '--json']))).toMatchObject({ status: 'running' });
      expect(JSON.parse(await run(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])))
        .toMatchObject({ key: 'ssh.agentForwardingEnabled', type: 'bool', value: false });
      const before = JSON.parse(await run(['ls', '--json'])) as { sandboxes: { name: string }[] };
      expect(before.sandboxes.some((box) => box.name === name)).toBe(false);
      const templates = JSON.parse(await run(['template', 'ls', '--json'])) as {
        images: { repository: string; tag: string }[];
      };
      expect(templates.images.some((image) => image.repository === 'docker.io/docker/sandbox-templates'
        && image.tag === 'shell-docker'), 'fixture image must already be cached; no pull').toBe(true);
      mkdirSync(kit);
      writeFileSync(join(kit, 'spec.yaml'), renderSbxKit({
        image: 'docker/sandbox-templates:shell-docker', guestNode: '/usr/bin/node',
        dataBytes: 512 * 1024 * 1024, workspaceBytes: 512 * 1024 * 1024,
      }));
      createAttempted = true;
      await run(['create', '--name', name, '--cpus', '2', '--memory', '2g', kit]);
      const probe = String.raw`
        const fs = require('node:fs');
        let relayAbsent = false;
        try { fs.lstatSync('/run/ssh-agent.sock'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; relayAbsent = true; }
        const mounts = fs.readFileSync('/proc/self/mountinfo', 'utf8');
        console.log(JSON.stringify({ uid: process.getuid(), relayAbsent,
          hostMounts: mounts.split('\n').filter(line => line.includes(' - virtiofs '))
            .map(line => { const fields = line.split(' '); return { path: fields[4], mode: fields[5].split(',')[0] }; })
            .sort((a,b) => a.path.localeCompare(b.path)) }));
      `;
      const inspect = async () => {
        for (const user of ['1000', '0']) {
          expect(JSON.parse(await run(['exec', '-u', user, name, '/usr/bin/node', '-e', probe])))
            .toEqual({ uid: Number(user), relayAbsent: true, hostMounts: [
              // Engine-generated DNS/host files, not the user's Workspace or home.
              { path: '/etc/hosts', mode: 'ro' }, { path: '/etc/resolv.conf', mode: 'ro' },
            ] });
        }
      };
      await inspect();
      await run(['exec', name, '/usr/bin/node', '-e',
        "const fs=require('node:fs');for(const dir of ['/home/agent','/workspace'])fs.writeFileSync(dir+'/admission-fixture','kept')"]);
      await run(['stop', name]);
      await inspect();
      expect((await run(['exec', name, '/usr/bin/node', '-e',
        "const fs=require('node:fs');console.log(['/home/agent','/workspace'].map(dir=>fs.readFileSync(dir+'/admission-fixture','utf8')).join(','))"])).trim())
        .toBe('kept,kept');
      expect(hostConnections).toBe(0);
    } finally {
      try {
        // Also clean up a partially-created fixture; never address another sandbox.
        if (createAttempted) {
          const boxes = JSON.parse(await run(['ls', '--json'])) as { sandboxes: { name: string }[] };
          if (boxes.sandboxes.some((box) => box.name === name)) await run(['rm', '-f', name]);
        }
      } finally {
        await new Promise<void>((resolve) => ssh.close(() => resolve()));
        rmSync(root, { recursive: true, force: true });
      }
    }
  }, 180_000);
});
