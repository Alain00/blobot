import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareSbxExec, spawnSbxTransport, type SbxExecOptions } from './transport.js';
import { SBX_BOOTSTRAP_SOURCE } from './bootstrap.js';
import type { MachineSpawnRequest } from '../machine.js';

const dirs: string[] = [];
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blobot-sbx-transport-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function options(): SbxExecOptions {
  return { sandboxName: 'blobot-alice', guestNode: process.execPath, moduleRoot: temp(), allowedEnvironment: ['PERSONA', 'REMOVE_ME'] };
}
function request(cwd: string): MachineSpawnRequest {
  return { command: { kind: 'exec', executable: process.execPath, args: ['-e', 'process.stdin.pipe(process.stdout)'] }, cwd };
}

async function runHeader(header: Buffer, input = Buffer.alloc(0), env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, ['-e', SBX_BOOTSTRAP_SOURCE], { env, stdio: 'pipe' });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (data: Buffer) => stdout.push(data));
  child.stderr.on('data', (data: Buffer) => stderr.push(data));
  child.stdin.on('error', () => {});
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  child.stdin.end(Buffer.concat([header, input]));
  return { code: await exited, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString() };
}

describe('sbx launch framing', () => {
  it('carries only the Machine-owned personal directory and removes inherited profile paths', async () => {
    const config = options();
    const request = { command: { kind: 'exec' as const, executable: process.execPath,
      args: ['-e', 'console.log(process.env.BLOBOT_PERSONAL_DIR ?? "absent")'] }, cwd: config.moduleRoot };
    const active = await runHeader(prepareSbxExec({ ...config, personalPath: '/profiles/ana/files' }, request).header,
      undefined, { BLOBOT_PERSONAL_DIR: '/profiles/other/files' });
    expect(active.stdout.toString().trim()).toBe('/profiles/ana/files');
    const absent = await runHeader(prepareSbxExec(config, request).header, undefined, { BLOBOT_PERSONAL_DIR: '/profiles/other/files' });
    expect(absent.stdout.toString().trim()).toBe('absent');
    expect(() => prepareSbxExec({ ...config, allowedEnvironment: ['BLOBOT_PERSONAL_DIR'] },
      { ...request, env: { BLOBOT_PERSONAL_DIR: '/profiles/other/files' } })).toThrow();
  });
  it('keeps values off argv and preserves the first protocol bytes even in one combined write', async () => {
    const config = options();
    const persona = 'Actúa como Alice.\nQuotes: "\'`$()\\. Unicode: 🪴';
    const prepared = prepareSbxExec(config, { ...request(config.moduleRoot), env: { PERSONA: persona } });
    expect(prepared.args.join(' ')).not.toContain(persona);
    expect(prepared.args).toEqual(['exec', '-i', 'blobot-alice', process.execPath, '-e', SBX_BOOTSTRAP_SOURCE]);
    const input = Buffer.from('{"jsonrpc":"2.0","id":1}\n' + 'x'.repeat(6 * 1024 * 1024) + '\n');
    const result = await runHeader(prepared.header, input);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.equals(input)).toBe(true);
  });

  it('uses the guest environment, applies explicit removals and strips host-key doors', async () => {
    const config = options();
    const prepared = prepareSbxExec(config, {
      command: { kind: 'exec', executable: process.execPath, args: ['-e', 'console.log(JSON.stringify(process.env))'] },
      cwd: config.moduleRoot, env: { PERSONA: 'only this value crosses', REMOVE_ME: undefined },
    });
    const result = await runHeader(prepared.header, undefined, {
      GUEST_ONLY: 'yes', HTTPS_PROXY: 'http://guest-proxy', REMOVE_ME: 'old',
      SSH_AUTH_SOCK: '/guest/relay', BLOBOT_OPENAI_API_KEY: 'must-not-travel',
    });
    expect(result.code).toBe(0);
    const actual = JSON.parse(result.stdout.toString());
    expect(actual).toMatchObject({
      GUEST_ONLY: 'yes', HTTPS_PROXY: 'http://guest-proxy', PERSONA: 'only this value crosses',
    });
    for (const key of ['REMOVE_ME', 'SSH_AUTH_SOCK', 'BLOBOT_OPENAI_API_KEY']) expect(actual).not.toHaveProperty(key);
  });

  it('refuses unlisted variables and engine overrides even if a caller allowlists them', () => {
    const config = options();
    for (const name of ['HOME', 'PATH', 'SSH_AUTH_SOCK', 'HTTPS_PROXY', 'NODE_OPTIONS', 'BLOBOT_OPENAI_API_KEY']) {
      expect(() => prepareSbxExec({ ...config, allowedEnvironment: [name] }, {
        ...request(config.moduleRoot), env: { [name]: 'value' },
      })).toThrow();
    }
    expect(() => prepareSbxExec(config, { ...request(config.moduleRoot), env: { UNKNOWN: 'value' } })).toThrow();
  });

  it('refuses host bridge paths and oversized launch configuration before starting a process', () => {
    const config = options();
    expect(() => prepareSbxExec(config, {
      command: { kind: 'node-module', package: 'bridge', version: '1', entry: 'index.js', localEntryPath: '/host/index.js' },
      cwd: config.moduleRoot,
    })).toThrow('host bridge path');
    expect(() => prepareSbxExec(config, { ...request(config.moduleRoot), env: { PERSONA: 'x'.repeat(1048576) } }))
      .toThrow('too large');
  });

  it('fails closed on a truncated header, with no launch values in the diagnostic', async () => {
    const config = options();
    const prepared = prepareSbxExec(config, { ...request(config.moduleRoot), env: { PERSONA: 'private text' } });
    const result = await runHeader(prepared.header.subarray(0, prepared.header.length - 3));
    expect(result.code).toBe(1);
    expect(result.stdout.length).toBe(0);
    expect(result.stderr).toBe('blobot: guest launch preparation failed (header/INVALID)\n');
  });

  it('resolves and verifies a pinned bridge inside the guest module root', async () => {
    const config = options();
    const packageDir = join(config.moduleRoot, 'node_modules', 'fixture-bridge');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'fixture-bridge', version: '1.2.3' }));
    writeFileSync(join(packageDir, 'entry.cjs'), 'process.stdin.pipe(process.stdout);');
    const command = { kind: 'node-module' as const, package: 'fixture-bridge', version: '1.2.3', entry: 'entry.cjs' };
    const good = prepareSbxExec(config, { command, cwd: config.moduleRoot });
    expect((await runHeader(good.header, Buffer.from('hello\n'))).stdout.toString()).toBe('hello\n');
    const mismatch = prepareSbxExec(config, { command: { ...command, version: '2.0.0' }, cwd: config.moduleRoot });
    expect((await runHeader(mismatch.header)).code).toBe(1);
  });
});

describe('configuration before guest launch', () => {
  it('merges a Cursor posture before the process can read the file, preserving vendor metadata', async () => {
    const config = options();
    const root = temp();
    const file = join(root, 'cli-config.json');
    writeFileSync(file, JSON.stringify({ theme: 'dark', permissions: { allow: ['old'] } }));
    const prepared = prepareSbxExec({ ...config, configs: [
      { root, relativePath: 'cli-config.json', patch: { approvalMode: 'allowlist', permissions: { allow: ['Mcp(blobot:*)'] } } },
    ] }, {
      command: { kind: 'exec', executable: process.execPath, args: ['-e', 'process.stdout.write(require("node:fs").readFileSync(process.argv[1]))', file] },
      cwd: root,
    });
    const result = await runHeader(prepared.header);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toEqual({
      theme: 'dark', approvalMode: 'allowlist', permissions: { allow: ['Mcp(blobot:*)'] },
    });
  });

  it('refuses config symlinks and never overwrites their target', async () => {
    const config = options();
    const root = temp();
    const target = join(temp(), 'keep.json');
    writeFileSync(target, '{"keep":true}');
    symlinkSync(target, join(root, 'config.json'));
    const prepared = prepareSbxExec({ ...config, configs: [{ root, relativePath: 'config.json', patch: { keep: false } }] }, request(root));
    expect((await runHeader(prepared.header)).code).toBe(1);
    expect(readFileSync(target, 'utf8')).toBe('{"keep":true}');
  });
});

describe('the sbx client transport', () => {
  it('uses exec without a TTY, isolates client environment, and carries EOF through both processes', async () => {
    const config = options();
    const fakeSbx = join(temp(), 'sbx');
    writeFileSync(fakeSbx, `#!${process.execPath}\n` +
      'const {spawn}=require("node:child_process");' +
      'if(process.argv[2]!=="exec"||process.argv[3]!=="-i")process.exit(9);' +
      'if(process.env.BLOBOT_PRIVATE_TEST||process.env.SSH_AUTH_SOCK)process.exit(10);' +
      'const child=spawn(process.argv[5],process.argv.slice(6),{stdio:"inherit"});' +
      'child.on("exit",code=>process.exitCode=code);', { mode: 0o755 });
    vi.stubEnv('BLOBOT_PRIVATE_TEST', 'not-client-config');
    vi.stubEnv('SSH_AUTH_SOCK', '/host/socket');
    const transport = spawnSbxTransport({ ...config, sbxExecutable: fakeSbx }, request(config.moduleRoot));
    const received = (async () => {
      const lines: string[] = [];
      for await (const line of transport.lines()) lines.push(line);
      return lines;
    })();
    transport.write('{"id":1}\n');
    await transport.close();
    expect(await received).toEqual(['{"id":1}']);
  });

  it('reports an unavailable client without an unhandled stdin error', async () => {
    const config = options();
    const transport = spawnSbxTransport({ ...config, sbxExecutable: join(temp(), 'missing-sbx') }, request(config.moduleRoot));
    const failure = new Promise<string | undefined>((resolve) => transport.onClose(resolve));
    expect(await failure).toContain('ENOENT');
    await transport.close();
  });

  it('drains unobserved stderr and reports a nonzero client exit', async () => {
    const config = options();
    const fakeSbx = join(temp(), 'sbx');
    writeFileSync(fakeSbx, `#!${process.execPath}\n` +
      'process.stdin.resume();' +
      'process.stdin.on("end",()=>{' +
      'process.stderr.write("x".repeat(1024*1024),()=>{process.exitCode=23;});});', { mode: 0o755 });
    const transport = spawnSbxTransport({ ...config, sbxExecutable: fakeSbx }, request(config.moduleRoot));
    const failure = new Promise<string | undefined>((resolve) => transport.onClose(resolve));
    await transport.close();
    expect(await failure).toBe('the agent process exited with code 23');
  });
});
