import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { renderSbxKit } from './kit.js';
import { spawnSbxTransport } from './transport.js';
import { sbxClientEnvironment } from './client-environment.js';

const execProcess = promisify(execFile);
const exec = (file: string, args: string[], options: { timeout: number }) =>
  execProcess(file, args, { ...options, env: sbxClientEnvironment() });
const live = process.env['BLOBOT_LIVE_SBX'] === '1' ? describe : describe.skip;

/**
 * Mechanical probe only: no model/CLI login or inference. v0.39 still exposes the daemon's
 * SSH relay, so this runs only our deterministic fixture, never an Agent or repository code.
 * It uses an already-installed template. It is NOT the production image acceptance test.
 */
live('a root kit and the exec transport on the installed sbx', () => {
  it('prepares config before launch and keeps both volumes across a stop', async () => {
    const root = mkdtempSync(join(tmpdir(), 'blobot-sbx-live-'));
    const name = `blobot-probe17-${process.pid}-${Date.now()}`;
    const kit = join(root, 'kit');
    const mount = join(root, 'empty');
    mkdirSync(kit);
    mkdirSync(mount);
    writeFileSync(join(kit, 'spec.yaml'), renderSbxKit({
      image: 'docker/sandbox-templates:shell-docker', guestNode: '/usr/bin/node',
      dataBytes: 512 * 1024 * 1024, workspaceBytes: 512 * 1024 * 1024,
    }));
    let createAttempted = false;
    try {
      const { stdout: version } = await exec('sbx', ['version'], { timeout: 10_000 });
      const mountFree = version.startsWith('sbx version: v0.42.0-rc5 ');
      if (!mountFree && !version.startsWith('sbx version: v0.39.0 ')) {
        throw new Error('Fixture creation is only verified on sbx v0.39.0 and v0.42.0-rc5');
      }
      await exec('sbx', ['kit', 'validate', kit], { timeout: 30_000 });
      createAttempted = true;
      await exec('sbx', ['create', '--name', name, '--cpus', '2', '--memory', '2g',
        // v0.39 requires even an empty primary mount to be writable. This is a disposable,
        // empty fixture directory, never the user's Workspace. Product admission forbids it.
        ...mountFree ? [kit] : ['--kit', kit, 'blobot', mount]], { timeout: 90_000 });
      vi.stubEnv('BLOBOT_HOST_SECRET_TEST', 'must-stay-on-host');
      const script = String.raw`
        const fs = require('node:fs');
        let input = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => input += chunk);
        process.stdin.on('end', () => {
          const file = '/workspace/probe-count';
          const count = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) + 1 : 1;
          fs.writeFileSync(file, String(count));
          const config = JSON.parse(fs.readFileSync('/home/agent/.blobot/probe.json', 'utf8'));
          console.log(JSON.stringify({ count, config, uid: process.getuid(), input,
            persona: process.env.PERSONA, hostSecret: process.env.BLOBOT_HOST_SECRET_TEST ?? null }));
        });
      `;
      async function turn(patch: Readonly<Record<string, unknown>>) {
        const diagnostics: string[] = [];
        const transport = spawnSbxTransport({
          sandboxName: name, guestNode: '/usr/bin/node', moduleRoot: '/opt/blobot',
          allowedEnvironment: ['PERSONA'],
          configs: [{ root: '/home/agent', relativePath: '.blobot/probe.json', patch }],
        }, {
          command: { kind: 'exec', executable: '/usr/bin/node', args: ['-e', script] },
          cwd: '/workspace', env: { PERSONA: 'Alice · texto\ncon comillas " y $()' },
          onStderr: (line) => diagnostics.push(line),
        });
        transport.onClose((reason) => { if (reason) diagnostics.push(reason); });
        const received = (async () => {
          const lines: string[] = [];
          for await (const line of transport.lines()) lines.push(line);
          return lines;
        })();
        transport.write('{"id":1}\n');
        await transport.close();
        const lines = await received;
        expect(lines, diagnostics.join('\n')).toHaveLength(1);
        return JSON.parse(lines[0]!) as Record<string, unknown>;
      }
      expect(await turn({ first: 'kept' })).toEqual({
        count: 1, config: { first: 'kept' }, uid: 1000, input: '{"id":1}\n',
        persona: 'Alice · texto\ncon comillas " y $()', hostSecret: null,
      });
      await exec('sbx', ['stop', name], { timeout: 30_000 });
      expect(await turn({ second: 'added' })).toMatchObject({
        count: 2, config: { first: 'kept', second: 'added' },
      });
    } finally {
      vi.unstubAllEnvs();
      try {
        if (createAttempted) {
          const { stdout } = await exec('sbx', ['ls', '--json'], { timeout: 30_000 });
          const boxes = JSON.parse(stdout) as { sandboxes: { name: string }[] };
          if (boxes.sandboxes.some((box) => box.name === name)) {
            await exec('sbx', ['rm', '-f', name], { timeout: 30_000 });
          }
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  }, 150_000);
});
