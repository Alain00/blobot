#!/usr/bin/env node
// Disposable sbx RC5 network experiment. No provider, credential, user mount or global mutation.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { renderSbxKit } from '../../../packages/core/dist/machines/sbx/kit.js';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';
import { verifySbxVersion, readSbxNetworkRules, verifySbxNetworkRules } from '../../../packages/core/dist/machines/sbx/observations.js';

assert.equal(process.env.BLOBOT_LIVE_SBX_OPEN_NETWORK, '1', 'Explicit opt-in required');
const root = await mkdtemp('/private/tmp/blobot-open-network.');
const name = `blobot-network-${randomUUID()}`;
const exec = promisify(execFile);
const report = { name, startedAt: new Date().toISOString(), commands: [], phases: [], cleanup: {} };
let id;
let intended = false;
const env = sbxClientEnvironment();
const requests = [];
const server = createServer((req, res) => {
  requests.push({ url: req.url, host: req.headers.host, at: new Date().toISOString() });
  res.end('synthetic host canary');
});
async function run(args, acceptable = [0]) {
  let result;
  try { result = { code: 0, ...await exec('sbx', args, { env, timeout: 60000, maxBuffer: 2 * 1024 ** 2 }) }; }
  catch (e) { result = { code: e.code, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }; }
  report.commands.push({ args, ...result });
  assert(acceptable.includes(result.code), `${args.slice(0, 3).join(' ')}: ${result.stderr}`);
  return result;
}
async function json(args, acceptable) { return JSON.parse((await run(args, acceptable)).stdout); }
async function identity() {
  const found = (await json(['ls', '--json'])).sandboxes.filter(box => box.name === name);
  assert.equal(found.length, 1); assert.equal(found[0].id, id);
}
async function add(decision, resources) {
  await identity();
  await run(['policy', decision, 'network', '--sandbox', name, resources]);
}
async function clear() {
  await identity();
  for (const rule of readSbxNetworkRules(await json(['policy', 'ls', name, '--type', 'network', '--json']))) {
    if (rule.scope !== `sandbox:${name}`) continue;
    assert.equal(rule.origin, 'scoped'); assert.equal(rule.editable, true);
    await run(['policy', 'rm', 'network', '--sandbox', name, '--id', rule.id]);
  }
}
async function phase(label, port) {
  const checks = [];
  for (const target of ['example.com:443', '1.1.1.1:443', `localhost:${port}`, `127.0.0.1:${port}`, `host.docker.internal:${port}`, `127.0.0.1.sslip.io:${port}`, '169.254.169.254:80']) {
    checks.push(await json(['policy', 'check', 'network', '--sandbox', name, '--json', target], [0, 1]));
  }
  const before = requests.length;
  const commands = [
    ['curl', '-sS', '--max-time', '8', '-o', '/dev/null', '-w', '%{http_code}', 'https://example.com'],
    ['curl', '-sS', '--noproxy', '*', '--max-time', '8', '-o', '/dev/null', '-w', '%{http_code}', 'https://example.com'],
    ['curl', '-sS', '--max-time', '4', '-o', '/dev/null', '-w', '%{http_code}', `http://host.docker.internal:${port}/${label}`],
    ['curl', '-sS', '--max-time', '4', '-o', '/dev/null', '-w', '%{http_code}', `http://127.0.0.1.sslip.io:${port}/${label}`],
  ];
  const results = [];
  for (const command of commands) results.push(await run(['exec', '-u', '1000', name, ...command], [0, 5, 6, 7, 22, 28, 35, 60]));
  const item = { label, checks, results, requests: requests.slice(before),
    rules: await json(['policy', 'ls', name, '--type', 'network', '--json']),
    log: await json(['policy', 'log', name, '--json']) };
  report.phases.push(item);
  await writeFile(join(root, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ label, http: results.map(r => r.stdout.trim()), hostRequests: item.requests.length }));
}
try {
  const disk = await statfs(root); assert(disk.bavail * disk.bsize > 3 * 1024 ** 3);
  verifySbxVersion(await json(['version', '--json']));
  assert.equal((await json(['daemon', 'status', '--json'])).status, 'running');
  assert.equal((await json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])).value, false);
  assert.deepEqual((await json(['ls', '--json'])).sandboxes, []);
  report.globalBefore = await json(['policy', 'ls', '--type', 'network', '--json']);
  verifySbxNetworkRules(readSbxNetworkRules(report.globalBefore));
  assert((await json(['template', 'ls', '--json'])).images.some(image => image.tag === 'shell-docker' && image.id === '5fc81bc7a127'));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  report.hostPort = port;
  const kit = join(root, 'kit'); await mkdir(kit);
  await writeFile(join(kit, 'spec.yaml'), renderSbxKit({ image: 'docker/sandbox-templates:shell-docker', guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2 }));
  intended = true;
  await run(['create', '--name', name, '--cpus', '2', '--memory', '2g', kit]);
  const boxes = (await json(['ls', '--json'])).sandboxes.filter(box => box.name === name);
  assert.equal(boxes.length, 1); id = boxes[0].id; report.id = id;
  await phase('deny-all', port);
  // The allow is IP-only, so this tests whether hostname resolution reaches IP policy at all.
  await add('allow', '0.0.0.0/0,::/0');
  await add('deny', '0.0.0.0/8,10.0.0.0/8,100.64.0.0/10,127.0.0.0/8,169.254.0.0/16,172.16.0.0/12,192.168.0.0/16,::1/128,fc00::/7,fe80::/10');
  await phase('ip-policy', port);
  await clear();
  // Deliberately inspect the wildcard/CIDR difference against a synthetic host service only.
  await add('allow', '**');
  await add('deny', '127.0.0.0/8,169.254.0.0/16,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128,fc00::/7,fe80::/10');
  await phase('wildcard-and-cidr', port);
  report.completed = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  try {
    const matches = (await json(['ls', '--json'])).sandboxes.filter(box => box.name === name);
    if (intended && matches.length === 1 && (id === undefined || matches[0].id === id)) {
      id = matches[0].id;
      await clear(); await run(['rm', '-f', name]);
    }
    assert(!(await json(['ls', '--json'])).sandboxes.some(box => box.name === name || box.id === id));
    report.cleanup.boxRemoved = true;
    report.cleanup.globalAfter = await json(['policy', 'ls', '--type', 'network', '--json']);
    assert.deepEqual(report.cleanup.globalAfter, report.globalBefore);
    report.cleanup.globalUnchanged = true;
  } catch (error) { report.cleanup.error = error.stack; process.exitCode = 1; }
  await new Promise(resolve => server.close(resolve));
  await writeFile(join(root, 'results.json'), JSON.stringify(report, null, 2));
  console.log(`Results: ${root}/results.json`);
}
