import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createTcpServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { OwnedSbxMachine } from './owned-machine.js';
import { SbxRegistry } from './registry.js';
import { sbxClientEnvironment } from './client-environment.js';

const exec = promisify(execFile);
it.skipIf(process.env['BLOBOT_LIVE_SBX_RC5'] !== '1')('opens owned network access, migrates the legacy mailbox rule and revokes only its grants', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blobot-open-network-lifecycle-'));
  const agentId = `network-${randomUUID()}`;
  const registry = new SbxRegistry(root);
  const env = sbxClientEnvironment();
  const run = async (args: string[]) => (await exec('sbx', args, { env, timeout: 60_000, maxBuffer: 1024 ** 2 })).stdout;
  const calls: string[] = [];
  const host = createServer((req, res) => { calls.push(req.url ?? ''); res.end('synthetic'); });
  const sockets = new Set<Socket>();
  const tcpCalls: string[] = [];
  const tcp = createTcpServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.once('data', data => { tcpCalls.push(data.toString()); socket.end('synthetic-tcp'); });
  });
  const machine = new OwnedSbxMachine({ agentId, registry,
    kit: { image: 'docker/sandbox-templates:shell-docker', guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2 },
    limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 },
    transport: { moduleRoot: '/opt/blobot/node_modules', allowedEnvironment: [] },
  });
  const before = JSON.parse(await run(['policy', 'ls', '--type', 'network', '--json']));
  let source: { name: string; id: string } | undefined;
  try {
    // Dedicated synthetic host listener; no provider, credentials, user mounts or global changes.
    await new Promise<void>((resolve, reject) => { host.once('error', reject); host.listen(0, '127.0.0.1', resolve); });
    await new Promise<void>((resolve, reject) => { tcp.once('error', reject); tcp.listen(0, '127.0.0.1', resolve); });
    const address = host.address();
    const tcpAddress = tcp.address();
    if (address === null || typeof address === 'string' || tcpAddress === null || typeof tcpAddress === 'string') throw new Error('Listener did not start');
    const port = address.port;
    await machine.start({ mailboxPort: port });
    const opened = await registry.read(agentId);
    source = opened!.active!;
    expect(opened?.network).toEqual({ id: expect.any(String), mailboxPort: port });
    await machine.beforeWork();
    for (const extra of [[], ['--noproxy', '*']]) {
      expect((await run(['exec', '-u', '1000', source.name, 'curl', '-sS', '--max-time', '10', ...extra,
        '-o', '/dev/null', '-w', '%{http_code}', 'https://example.com'])).trim()).toBe('200');
    }
    expect((await run(['exec', '-u', '1000', source.name, 'curl', '-sS', '--max-time', '5',
      `http://host.docker.internal:${port}/open`])).trim()).toBe('synthetic');
    expect(calls).toEqual(['/open']);
    const tcpProbe = `const net=require('node:net');const s=net.connect(${tcpAddress.port},'host.docker.internal',()=>s.write('network-fixture'));
      s.setTimeout(5000,()=>{s.destroy();process.exitCode=1});s.on('error',()=>{process.exitCode=1});s.on('data',d=>process.stdout.write(d));`;
    expect((await run(['exec', '-u', '1000', source.name, '/usr/bin/node', '-e', tcpProbe])).trim()).toBe('synthetic-tcp');
    expect(tcpCalls).toEqual(['network-fixture']);
    await machine.stop();
    expect((await registry.read(agentId))?.network).toBeUndefined();
    const blocked = await exec('sbx', ['policy', 'check', 'network', '--sandbox', source.name, '--json', 'example.com:443'], { env })
      .catch((error: { code: number; stdout: string }) => { expect(error.code).toBe(1); return error; });
    expect(JSON.parse(blocked.stdout).allowed).toBe(false);

    // Resume a journal from before open Internet. Only its exact recorded permission is removed.
    await run(['policy', 'allow', 'network', '--sandbox', source.name, `localhost:${port}`]);
    const legacyRules = JSON.parse(await run(['policy', 'ls', source.name, '--type', 'network', '--json'])).rules as { id: string; scope: string }[];
    const legacy = legacyRules.find(rule => rule.scope === `sandbox:${source!.name}`)!;
    await registry.save({ ...(await registry.read(agentId))!, mailbox: { id: legacy.id, port } });
    await machine.start({ mailboxPort: port });
    const migrated = await registry.read(agentId);
    expect(migrated?.mailbox).toBeUndefined();
    expect(migrated?.network?.id).not.toBe(legacy.id);
    await machine.beforeWork();

    // An external deletion must refuse before the next turn, then allow a fresh explicit start.
    await run(['policy', 'rm', 'network', '--sandbox', source.name, '--id', migrated!.network!.id]);
    await expect(machine.beforeWork()).rejects.toThrow('network permission');
    await machine.stop();
    await machine.start({ mailboxPort: port });
    await machine.beforeWork();
    await machine.stop();
    expect(JSON.parse(await run(['policy', 'ls', '--type', 'network', '--json']))).toEqual(before);
  } finally {
    await machine.stop().catch(() => {});
    const record = await registry.read(agentId);
    const reference = record?.active ?? (record?.pending?.id === undefined ? source : { name: record.pending.name, id: record.pending.id });
    if (reference !== undefined) {
      const matches = (JSON.parse(await run(['ls', '--json'])).sandboxes as { name: string; id: string }[])
        .filter(box => box.name === reference.name && box.id === reference.id);
      if (matches.length === 1) await run(['rm', '-f', reference.name]);
    }
    await new Promise<void>(resolve => host.close(() => resolve()));
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => tcp.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
}, 180_000);
