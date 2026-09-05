// Synthetic, opt-in worktree mount probe. No provider, network request or real repository.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { renderSbxKit } from '../../../packages/core/dist/machines/sbx/kit.js';
import { sbxClientEnvironment } from '../../../packages/core/dist/machines/sbx/client-environment.js';

if (process.env.BLOBOT_LIVE_SBX_WORKTREE !== '1') throw new Error('Explicit fixture opt-in required');
const exec = promisify(execFile);
const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-worktree-probe-')));
const repo = join(root, 'repo'), worktree = join(root, 'alice'), sibling = join(root, 'bob');
const kit = join(root, 'kit'), fixtureHome = join(root, 'git-home');
const branch = 'blobot/fixture/alice';
const name = `blobot-worktree-${randomUUID()}`;
const report = { date: new Date().toISOString(), kind: 'synthetic-worktree-not-Agent', checks: {}, cleanup: {} };
const output = new URL('./20-worktree-fixture-results.json', import.meta.url);
const env = sbxClientEnvironment();
const gitEnv = { PATH: process.env.PATH, HOME: fixtureHome, GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@blobot.invalid',
  GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@blobot.invalid' };
const run = async (command, args, options = {}) => (await exec(command, args,
  { timeout: 60_000, maxBuffer: 2 * 1024 ** 2, ...options })).stdout.trim();
const git = (cwd, args) => run('git', ['-c', 'commit.gpgsign=false', '-C', cwd, ...args], { env: gitEnv });
const sbx = (args) => run('sbx', args, { env });
const json = async (args) => JSON.parse(await sbx(args));
const inventory = async () => (await json(['ls', '--json'])).sandboxes;
let createAttempted = false, reference;
const verify = async () => {
  const matches = (await inventory()).filter((box) => box.name === name);
  assert.equal(matches.length, 1);
  if (reference !== undefined) assert.equal(matches[0].id, reference.id);
  return matches[0];
};
const guest = async (uid, source, args = []) => {
  await verify();
  return JSON.parse(await sbx(['exec', '-u', String(uid), '-w', worktree, name,
    '/usr/bin/node', '-e', source, ...args]));
};
try {
  assert.equal((await json(['daemon', 'status', '--json'])).status, 'running');
  const version = await json(['version', '--json']);
  for (const side of [version.client, version.server]) {
    assert.equal(side.version, 'v0.42.0-rc5');
    assert.equal(side.revision, 'ca4a4bd42035628137d78c5a0bef5c0d3301a35a');
  }
  assert.equal(version.server.state, 'running');
  assert.equal((await json(['settings', 'get', '--json', 'ssh.agentForwardingEnabled'])).value, false);
  report.version = version;
  const before = await inventory();
  assert(!before.some((box) => box.name === name));
  const beforeIds = before.map((box) => box.id).sort();
  assert((await json(['template', 'ls', '--json'])).images.some((image) =>
    image.repository === 'docker.io/docker/sandbox-templates' && image.tag === 'shell-docker'));
  await Promise.all([mkdir(repo), mkdir(kit), mkdir(fixtureHome)]);
  await git(repo, ['init', '-b', 'main']);
  await writeFile(join(repo, 'README.md'), 'base\n');
  await writeFile(join(repo, '.gitignore'), '.env\n');
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-m', 'fixture base']);
  await git(repo, ['remote', 'add', 'origin', 'https://example.invalid/fixture.git']);
  await git(repo, ['worktree', 'add', '-b', branch, worktree]);
  await git(repo, ['worktree', 'add', '-b', 'blobot/fixture/bob', sibling]);
  await writeFile(join(repo, '.env'), 'SYNTHETIC_HOST_ONLY=1\n');
  await writeFile(join(sibling, 'uncommitted.txt'), 'sibling-only\n');
  const base = await git(repo, ['rev-parse', 'HEAD']);
  const common = await git(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  assert.equal(common, join(repo, '.git'));
  report.hostGit = await git(repo, ['--version']);
  await writeFile(join(kit, 'spec.yaml'), renderSbxKit({ image: 'docker/sandbox-templates:shell-docker',
    guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2, workspaceBytes: 512 * 1024 ** 2 }));
  createAttempted = true;
  // Only two explicitly named synthetic paths. No parent checkout, home or sibling directory.
  await sbx(['create', '--name', name, '--cpus', '2', '--memory', '2g', kit, worktree, common]);
  reference = await verify();
  report.create = { shape: 'custom root kit + worktree + common Git directory', id: reference.id, name };
  const inspectSource = String.raw`
    const fs=require('node:fs');
    const paths=JSON.parse(process.argv[1]);
    const exists=p=>{try{fs.lstatSync(p);return true}catch(e){if(e.code!=='ENOENT')throw e;return false}};
    console.log(JSON.stringify({uid:process.getuid(),sshRelay:exists('/run/ssh-agent.sock'),
      hostCheckout:exists(paths.repo+'/README.md'),hostIgnored:exists(paths.repo+'/.env'),
      siblingLoose:exists(paths.sibling+'/uncommitted.txt'),
      mounts:fs.readFileSync('/proc/self/mountinfo','utf8').trim().split('\n')
        .filter(l=>l.includes(' - virtiofs ')).map(l=>{const f=l.split(' ');return {path:f[4],mode:f[5]}})}));
  `;
  const paths = JSON.stringify({ repo, sibling });
  const observations = [];
  for (const uid of [0, 1000]) {
    const observed = await guest(uid, inspectSource, [paths]);
    observations.push(observed);
    assert.equal(observed.sshRelay, false);
    assert.equal(observed.hostCheckout, false);
    assert.equal(observed.hostIgnored, false);
    assert.equal(observed.siblingLoose, false);
    assert.deepEqual(observed.mounts.map((m) => m.path).sort(),
      ['/etc/hosts', '/etc/resolv.conf', common, worktree].sort());
    for (const path of [common, worktree]) assert(observed.mounts.find((m) => m.path === path).mode.split(',').includes('rw'));
  }
  report.checks.mounts = observations;
  const commitSource = String.raw`
    const fs=require('node:fs'),cp=require('node:child_process');
    const git=args=>cp.execFileSync('git',['-c','commit.gpgsign=false',...args],{encoding:'utf8',env:{...process.env,
      GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',
      GIT_AUTHOR_NAME:'Alice',GIT_AUTHOR_EMAIL:'alice@blobot.invalid',
      GIT_COMMITTER_NAME:'Alice',GIT_COMMITTER_EMAIL:'alice@blobot.invalid'}}).trim();
    fs.writeFileSync('guest.txt','committed inside\n');git(['add','guest.txt']);git(['commit','-m','guest commit']);
    console.log(JSON.stringify({uid:process.getuid(),git:git(['--version']),head:git(['rev-parse','HEAD']),
      branch:git(['branch','--show-current']),origin:git(['remote','get-url','origin'])}));
  `;
  const committed = await guest(1000, commitSource);
  report.checks.commit = committed;
  assert.equal(committed.branch, branch);
  assert.equal(committed.origin, 'https://example.invalid/fixture.git');
  assert.equal(await git(repo, ['rev-parse', `refs/heads/${branch}`]), committed.head);
  assert.equal(await git(repo, ['rev-parse', 'HEAD']), base);
  assert.equal(await readFile(join(repo, 'README.md'), 'utf8'), 'base\n');
  assert.equal(await readFile(join(worktree, 'guest.txt'), 'utf8'), 'committed inside\n');
  report.checks.immediateHostBranchWithoutFetch = true;
  await sbx(['stop', name]);
  assert.equal((await verify()).status, 'stopped');
  const restarted = await guest(1000, String.raw`
    const cp=require('node:child_process');console.log(JSON.stringify({head:cp.execFileSync('git',
      ['rev-parse','HEAD'],{encoding:'utf8'}).trim()}));`);
  assert.equal(restarted.head, committed.head);
  report.checks.reopen = true;
  report.preExistingIds = beforeIds;
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error);
  if (error.stdout) report.failureStdout = error.stdout;
  if (error.stderr) report.failureStderr = error.stderr;
  process.exitCode = 1;
} finally {
  let safeToRemoveHostFixture = !createAttempted;
  try {
    if (createAttempted) {
      const matches = (await inventory()).filter((box) => box.name === name);
      assert(matches.length <= 1);
      if (matches.length === 1) {
        if (reference !== undefined) assert.equal(matches[0].id, reference.id);
        await sbx(['rm', '-f', name]);
      }
      const after = await inventory();
      assert(!after.some((box) => box.name === name));
      report.cleanup.sandboxRemoved = true;
      if (report.preExistingIds) assert.deepEqual(after.map((box) => box.id).sort(), report.preExistingIds);
      safeToRemoveHostFixture = true;
    }
  } catch (error) { report.cleanup.error = String(error); process.exitCode = 1; }
  if (safeToRemoveHostFixture) { await rm(root, { recursive: true, force: true }); report.cleanup.hostFixtureRemoved = true; }
  else report.cleanup.retainedHostFixture = root;
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: report.ok, error: report.error, checks: Object.keys(report.checks), cleanup: report.cleanup }));
}
