// Credential-free Cursor configuration probe. No session/new, prompt, login or tool call.
// Uses one pre-existing, pinned image with no network, mounts, pulls or host credentials.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (process.env.BLOBOT_CURSOR_POSTURE_PROBE !== '1') throw new Error('Set BLOBOT_CURSOR_POSTURE_PROBE=1');
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) =>
  index % 2 === 0 ? [...pairs, [value.replace(/^--/, ''), all[index + 1]]] : pairs, []));
assert(options['docker-config'] && options['docker-host']);
const records = JSON.parse(readFileSync(new URL('./32-runtime-image-builds.json', import.meta.url)));
const pin = records.builds.find((entry) => entry.runtime === 'cursor' && entry.arch === 'arm64');
assert.equal(pin.version, '2026.09.02-c22c1a3');
const owner = randomUUID();
const name = `blobot-cursor-posture-${owner}`;
const base = ['--config', options['docker-config'], '--host', options['docker-host']];
function docker(args, extra = {}) {
  const result = spawnSync('docker', [...base, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024, ...extra });
  if (result.error) throw result.error;
  return result;
}
const inspect = docker(['image', 'inspect', pin.reference]);
assert.equal(inspect.status, 0, inspect.stderr);
const image = JSON.parse(inspect.stdout)[0];
assert.equal(image.Id, pin.imageId);
assert.equal(image.Architecture, 'arm64');
const guest = String.raw`
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync('/opt/blobot/runtime/8499.index.js', 'utf8');
const context = { exports: {} };
vm.runInNewContext(source, context, { timeout: 1000 });
const factory = context.exports.modules['./src/shared/autorun-mode.ts'];
assert.equal(typeof factory, 'function');
let supported = true;
const required = (name) => {
  if (name === '../shell-exec/dist/index.js') return { isSandboxSupported: () => supported };
  if (name === './src/debug.ts') return { debugLogJSON() {} };
  throw new Error('Unexpected dependency: ' + name);
};
required.d = (target, values) => { for (const [name, get] of Object.entries(values)) Object.defineProperty(target, name, { enumerable: true, get }); };
const moduleExports = {};
factory({}, moduleExports, required);
const plain = (value) => JSON.parse(JSON.stringify(value));
const report = { uid: process.getuid(), node: process.version, moduleSha256: crypto.createHash('sha256').update(source).digest('hex'), resolver: [], acpPermissionsAdapter: [], processes: [] };
assert.equal(report.uid, 1000);
const approvalProvider = { getAutoRunControls: async () => { throw new Error('Unexpected team-settings request'); } };
const basePermissions = { allow: ['Shell(echo)', 'Mcp(blobot:*)'], deny: ['Shell(rm)'] };
async function runResolver(mode, override, defaultEnabled, expected) {
  const config = { sandbox: mode === undefined ? undefined : { mode }, approvalMode: 'allowlist', permissions: structuredClone(basePermissions) };
  const before = JSON.stringify(config);
  const input = { configProvider: { get: () => config }, sandboxOverride: override, sandboxDefaultEnabled: defaultEnabled, getApprovalModeSetting: () => config.approvalMode, autoRunControlsProvider: approvalProvider };
  const actual = plain(await moduleExports.Hs(input));
  assert.deepEqual(actual, { approvalMode: 'allowlist', sandboxAvailable: expected === 'enabled' });
  assert.equal(moduleExports.PT(input), expected);
  assert.equal(JSON.stringify(config), before);
  report.resolver.push({ mode: mode ?? null, override: override ?? null, defaultEnabled, supported, resolved: moduleExports.PT(input), ...actual, inputUnchanged: true });
}
async function runAcp(label, mode, project) {
  const root = '/home/agent/' + label;
  const configDir = root + '/config';
  const workspace = root + '/workspace';
  fs.mkdirSync(configDir, { recursive: true }); fs.mkdirSync(workspace + '/.cursor', { recursive: true });
  const config = { version: 1, editor: { vimMode: false }, approvalMode: 'allowlist', permissions: structuredClone(basePermissions), sandbox: { mode, networkAccess: 'allow_all' } };
  fs.writeFileSync(configDir + '/cli-config.json', JSON.stringify(config));
  if (project) fs.writeFileSync(workspace + '/.cursor/cli.json', JSON.stringify(project));
  const env = { HOME: root, CURSOR_CONFIG_DIR: configDir, PATH: '/opt/blobot/bin:/usr/local/bin:/usr/bin:/bin', TERM: 'dumb' };
  let stdout = '', stderr = '', response = null;
  const started = Date.now();
  const child = spawn('/opt/blobot/bin/cursor-agent', ['acp', '--workspace', workspace], { cwd: workspace, env, detached: true, stdio: ['pipe','pipe','pipe'] });
  const signals = [];
  const signal = (value) => { try { process.kill(-child.pid, value); signals.push(value); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
  const stopTimer = setTimeout(() => signal('SIGTERM'), 10000);
  const killTimer = setTimeout(() => signal('SIGKILL'), 12000);
  let responseStop;
  child.stdout.on('data', (part) => {
    stdout += part;
    for (const line of stdout.split('\n')) try { const value = JSON.parse(line); if (value.id === 1 && !response) {
      response = value; child.stdin.end(); responseStop = setTimeout(() => signal('SIGTERM'), 250);
    } } catch {}
  });
  child.stderr.on('data', (part) => { stderr += part; });
  child.stdin.on('error', () => {});
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientInfo: { name: 'blobot-config-probe', version: '1' }, clientCapabilities: {} } }) + '\n');
  const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code, signal) => resolve({ code, signal })); });
  clearTimeout(stopTimer); clearTimeout(killTimer); clearTimeout(responseStop);
  const after = JSON.parse(fs.readFileSync(configDir + '/cli-config.json', 'utf8'));
  assert.equal(after.approvalMode, config.approvalMode);
  assert.deepEqual(after.permissions, config.permissions);
  assert.deepEqual(after.sandbox, config.sandbox);
  report.processes.push({ label, mode, project: project ?? null, response, ...exit, elapsedMs: Date.now()-started, signals, stdout, stderr, persistedPosture: { approvalMode: after.approvalMode, permissions: after.permissions, sandbox: after.sandbox } });
}
(async () => {
  const permissionExports = {};
  context.exports.modules['../cursor-config/dist/permissions-adapter.js']({}, permissionExports, required);
  const mergedExports = {};
  context.exports.modules['../cursor-config/dist/merged-permissions-provider.js']({}, mergedExports, required);
  for (const mode of ['enabled', 'disabled']) {
    const config = { approvalMode: 'allowlist', sandbox: { mode }, permissions: structuredClone(basePermissions) };
    const provider = new permissionExports.Q({ get: () => config });
    const actual = plain(await new mergedExports.O([provider]).getPermissions());
    assert.deepEqual(actual, { ...basePermissions, approvalMode: 'allowlist', userConfiguredPolicy: { type: 'insecure_none' } });
    report.acpPermissionsAdapter.push({ mode, actual });
  }
  await runResolver('disabled', undefined, true, 'disabled');
  await runResolver('enabled', undefined, false, 'enabled');
  await runResolver('disabled', 'enabled', false, 'enabled');
  await runResolver('enabled', 'disabled', true, 'disabled');
  await runResolver(undefined, undefined, false, 'disabled');
  await runResolver(undefined, undefined, true, 'enabled');
  supported = false;
  const absent = plain(await moduleExports.Hs({ configProvider: { get: () => ({ sandbox: { mode: 'enabled' } }) }, getApprovalModeSetting: () => 'allowlist', autoRunControlsProvider: approvalProvider }));
  assert.deepEqual(absent, { approvalMode: 'allowlist', sandboxAvailable: false }); report.unsupportedPlatform = absent;
  const cleanEnv = { HOME: '/home/agent', CURSOR_CONFIG_DIR: '/home/agent/help-config', PATH: '/opt/blobot/bin:/usr/local/bin:/usr/bin:/bin', TERM: 'dumb' };
  for (const arg of ['--version','--help']) {
    const out = spawnSync('/opt/blobot/bin/cursor-agent', [arg], { env: cleanEnv, encoding: 'utf8', timeout: 10000, maxBuffer: 1024*1024 });
    assert.equal(out.status, 0, out.stderr); report[arg.slice(2)] = out.stdout.trim();
  }
  assert.equal(report.version, '2026.09.02-c22c1a3');
  await runAcp('disabled', 'disabled');
  await runAcp('enabled', 'enabled');
  await runAcp('project-permissions', 'disabled', { permissions: { allow: ['Shell(pwd)'], deny: [] } });
  await runAcp('project-sandbox', 'disabled', { permissions: { allow: [], deny: [] }, sandbox: { mode: 'enabled' } });
  for (const entry of report.processes.slice(0,3)) assert.equal(entry.response?.result?.protocolVersion, 1, JSON.stringify(entry));
  console.log(JSON.stringify(report));
})().catch((error) => { console.error(error.stack); process.exitCode=1; });
`;
const output = { schemaVersion: 1, startedAt: new Date().toISOString(), pin, name, owner, boundary: { network: 'none', hostMounts: [], credentials: [], pulls: false, messages: ['initialize'], prompts: 0 }, cleanup: null };
try {
  const result = docker(['run', '--rm', '-i', '--pull=never', '--name', name, '--label', `blobot.research.owner=${owner}`, '--network=none', '--read-only', '--tmpfs', '/home/agent:rw,uid=1000,gid=1000,mode=0700', '--tmpfs', '/tmp:rw,mode=1777', '--user', '1000:1000', '--cap-drop=ALL', '--cpus=1', '--memory=1g', '--entrypoint', '/usr/bin/node', pin.reference, '-'], { input: guest, timeout: 75000 });
  output.status = result.status; output.stderr = result.stderr;
  if (result.stdout.trim()) output.result = JSON.parse(result.stdout);
  assert.equal(result.status, 0, result.stderr);
} finally {
  const container = docker(['container', 'inspect', name]);
  if (container.status === 0) {
    const value = JSON.parse(container.stdout)[0];
    assert.equal(value.Config.Labels['blobot.research.owner'], owner);
    assert.equal(docker(['container', 'rm', '--force', value.Id]).status, 0);
  }
  const after = docker(['container', 'inspect', name]);
  assert.notEqual(after.status, 0);
  output.cleanup = 'owned container absent'; output.finishedAt = new Date().toISOString();
  writeFileSync(options.results ?? fileURLToPath(new URL('./43-cursor-posture-results.json', import.meta.url)), JSON.stringify(output, null, 2) + '\n');
}
console.log(JSON.stringify({ status: output.status, processes: output.result?.processes.map(({ label, code, response }) => ({ label, code, initialized: response?.result?.protocolVersion === 1 })), cleanup: output.cleanup }));
