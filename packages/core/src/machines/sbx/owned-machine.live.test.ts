import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { OwnedSbxMachine } from './owned-machine.js';
import { SbxRegistry } from './registry.js';
import { sbxClientEnvironment } from './client-environment.js';

const exec = promisify(execFile);
it.skipIf(process.env['BLOBOT_LIVE_SBX_RC5'] !== '1')('owns, sleeps, reopens and resizes a disposable Machine without deleting its original', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blobot-owned-machine-'));
  const agentId = `lifecycle-${randomUUID()}`;
  const registry = new SbxRegistry(root);
  const run = async (args: string[]) => (await exec('sbx', args, { env: sbxClientEnvironment(), timeout: 90_000, maxBuffer: 1024 * 1024 })).stdout;
  const create = (id: string) => new OwnedSbxMachine({ agentId: id, registry,
    kit: { image: 'docker/sandbox-templates:shell-docker', guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2 },
    limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 },
    transport: { moduleRoot: '/opt/blobot/node_modules', allowedEnvironment: [] },
  });
  const machine = create(agentId);
  const peerId = `${agentId}-peer`;
  const peer = create(peerId);
  try {
    // This fixture never installs, logs in, changes shared settings, downloads an image or restarts the daemon.
    expect(JSON.parse(await run(['daemon', 'status', '--json'])).status).toBe('running');
    const templates = JSON.parse(await run(['template', 'ls', '--json'])).images;
    expect(templates.some((image: { tag: string }) => image.tag === 'shell-docker')).toBe(true);
    await machine.start({ mailboxPort: 34567 });
    const initial = await registry.read(agentId);
    expect(initial?.active).toBeDefined();
    expect(initial?.pending).toBeUndefined();
    expect(initial?.mailbox?.port).toBe(34567);
    const source = initial!.active!;
    // A synthetic status executable, not a real provider or login, exercises the guest probe.
    await run(['exec', '-u', '0', source.name, '/usr/bin/node', '-e',
      "require('node:fs').writeFileSync('/usr/local/bin/fx', '#!/bin/sh\\nprintf \\\'%s\\\\n\\\' \\\'{\"auth\":\"missing\"}\\\'\\n', {mode:493})"]);
    expect((await machine.detectRuntime('fx', { agentId, power: 'awake', inspect: async (read) => read() })).readiness).toBe('needs_sign_in');
    const signIn = await machine.signInRuntime('fx', async (request) => {
      expect(request.args).toEqual(['exec', '-it', '-u', '1000', '-w', '/home/agent', source.name, 'fx', 'login']);
      expect(request.env['SSH_AUTH_SOCK']).toBeUndefined();
      throw new Error('synthetic abandoned dialog'); // no actual browser/login
    });
    expect(signIn.completed).toBe(false);
    expect(signIn.detection.readiness).toBe('needs_sign_in');
    // The unscoped rule listing contains both Agents; neither may adopt or reject the other's rule.
    await peer.start({ mailboxPort: 34570 });
    await peer.beforeWork();
    await machine.beforeWork();
    await peer.stop();
    await run(['exec', source.name, '/usr/bin/node', '-e',
      "const fs=require('node:fs');fs.writeFileSync('/home/agent/.session-fixture','synthetic',{mode:384});fs.writeFileSync('/workspace/work-fixture','kept')"]);
    await machine.stop();
    expect((await registry.read(agentId))?.mailbox).toBeUndefined();
    expect((await machine.detectRuntime('fx', { agentId, power: 'asleep', inspect: async () => undefined })).detail).toBe('Status unknown: it is stopped.');
    const stoppedInventory = JSON.parse(await run(['ls', '--json'])).sandboxes as { id: string; status: string }[];
    expect(stoppedInventory.find((box) => box.id === source.id)?.status).toBe('stopped');
    await machine.start({ mailboxPort: 34568 });
    expect((await registry.read(agentId))?.active?.id).toBe(source.id);
    expect((await registry.read(agentId))?.mailbox?.port).toBe(34568);
    const denied = await exec('sbx', ['policy', 'check', 'network', '--sandbox', source.name, '--json', 'blobot-admission.invalid:443'], { env: sbxClientEnvironment() })
      .catch((error: { code: number; stdout: string }) => { expect(error.code).toBe(1); return error; });
    expect(JSON.parse(denied.stdout)).toMatchObject({ allowed: false, deny_kind: 'implicit', governance: { active: false } });
    expect(JSON.parse(await run(['policy', 'check', 'network', '--sandbox', source.name, '--json', 'localhost:34568'])))
      .toMatchObject({ allowed: true, context: `sandbox:${source.name}`, governance: { active: false } });
    await machine.beforeWork();
    await machine.stop();
    await machine.reconfigure({ maxCpus: 3, maxMemoryBytes: 3 * 1024 ** 3 });
    const replaced = await registry.read(agentId);
    expect(replaced?.pending).toBeUndefined();
    expect(replaced?.active?.id).not.toBe(source.id);
    expect(replaced?.retained).toEqual([source]);
    await machine.start({ mailboxPort: 34569 });
    const target = replaced!.active!;
    const inspect = "const fs=require('node:fs');console.log(JSON.stringify({cpus:require('node:os').cpus().length,session:fs.readFileSync('/home/agent/.session-fixture','utf8'),work:fs.readFileSync('/workspace/work-fixture','utf8')}))";
    expect(JSON.parse(await run(['exec', target.name, '/usr/bin/node', '-e', inspect])))
      .toEqual({ cpus: 3, session: 'synthetic', work: 'kept' });
    await machine.stop();
    expect(JSON.parse(await run(['exec', source.name, '/usr/bin/node', '-e', inspect])))
      .toEqual({ cpus: 2, session: 'synthetic', work: 'kept' });
    await run(['stop', source.name]);
    const cancelled = new AbortController(); cancelled.abort();
    await expect(machine.reconfigure({ maxCpus: 4, maxMemoryBytes: 4 * 1024 ** 3 }, { signal: cancelled.signal })).rejects.toThrow('cancelled');
    expect((await registry.read(agentId))?.active?.id).toBe(target.id);
    await expect(machine.destroy()).rejects.toThrow('No data was deleted');
    await expect(machine.reconfigure({ maxCpus: 4, maxMemoryBytes: 4 * 1024 ** 3 }, { timeoutMs: 1 })).rejects.toThrow('original');
    const interrupted = await registry.read(agentId);
    expect(interrupted?.active?.id).toBe(target.id);
    expect(interrupted?.pending?.id).toBeTypeOf('string');
    await expect(machine.start({ mailboxPort: 34569 })).rejects.toThrow('unfinished');
  } finally {
    await machine.stop().catch(() => {});
    await peer.stop().catch(() => {});
    // Every target comes from this fixture's private journal, including partial creation.
    const records = await Promise.all([registry.read(agentId), registry.read(peerId)]);
    const names = new Set(records.flatMap((final) => [final?.active?.name, final?.pending?.name, ...final?.retained.map((box) => box.name) ?? []]));
    const boxes = JSON.parse(await run(['ls', '--json'])).sandboxes as { name: string }[];
    for (const box of boxes.filter((box) => names.has(box.name))) await run(['rm', '-f', box.name]);
    await rm(root, { recursive: true, force: true });
  }
}, 240_000);
