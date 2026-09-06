// Synthetic data only. The production preparation function is supplied as static source.
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const config = JSON.parse(process.argv[1]);
const prepare = new Function('return (' + process.argv[2] + ')')();
const sources = JSON.parse(process.argv[3]);
const verify = new Function('return (' + sources.verify + ')')();
const index = new Function('return (' + sources.index + ')')();
const readTree = new Function('return (' + sources.read + ')')();
const report = { role: config.role, checks: {}, completed: false };
(async () => {
  const token = config.token;
  const marker = '.blobot-maintenance55-' + token;
  const roots = { rootfs: '/tmp', home: '/home/agent', docker: '/var/lib/docker' };
  for (const path of Object.values(roots)) fs.writeFileSync(path + '/' + marker, 'synthetic-' + token);
  const held = await prepare(fs, cp, { token, role: config.role });
  held.assertHeld(); report.checks.preparedAndHeld = true;
  for (const [tree, view] of Object.entries(held.views)) {
    const base = tree === 'rootfs' ? view + '/tmp' : view;
    assert.equal(fs.readFileSync(base + '/' + marker, 'utf8'), 'synthetic-' + token);
    report.checks[tree + 'SeesOwnData'] = true;
    if (config.role === 'source') {
      assert.throws(() => fs.writeFileSync(base + '/' + marker + '-extra', 'probe'), error => error.code === 'EROFS');
      report.checks[tree + 'ReadOnly'] = true;
    } else {
      fs.writeFileSync(base + '/' + marker + '-extra', 'synthetic-target');
      assert.equal(fs.readFileSync(roots[tree] + '/' + marker + '-extra', 'utf8'), 'synthetic-target');
      fs.unlinkSync(base + '/' + marker + '-extra');
      report.checks[tree + 'UsesPrivateTree'] = true;
    }
  }
  assert.equal(fs.existsSync(held.views.rootfs + config.worktree + '/marker'), false);
  report.checks.hostWorktreeExcluded = true;
  held.assertHeld();
  report.archives = {};
  for (const [tree, path] of Object.entries(held.views)) {
    const options = { path, maxBytes: tree === 'rootfs' ? 4 * 1024 ** 3 : 64 * 1024 ** 2, assertHeld: held.assertHeld };
    const first = await readTree({ commands: cp, crypto: require('node:crypto') }, { verify, index }, options);
    const second = await readTree({ commands: cp, crypto: require('node:crypto') }, { verify, index }, options);
    assert.deepEqual(first.digest, second.digest);
    assert.equal(first.members.size, second.members.size);
    report.archives[tree] = { ...first.digest, members: first.members.size, repeatedExactly: true };
  }
  await held.dispose();
  assert(Object.values(held.views).every(view => !fs.existsSync(view)));
  const relative = fs.readFileSync('/proc/1/cgroup', 'utf8').trim().slice(3);
  assert.match(fs.readFileSync('/sys/fs/cgroup' + relative + '/cgroup.events', 'utf8'), /^frozen 1$/m);
  report.checks.viewsRemovedStillFrozen = true;
  report.completed = true;
})().catch(error => { report.error = String(error.stack); process.exitCode = 1; })
  .finally(() => process.stdout.write(JSON.stringify(report)));
