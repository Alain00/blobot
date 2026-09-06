const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const config = JSON.parse(process.argv[1]);
const prepare = new Function('return (' + process.argv[2] + ')')();
const { probe } = JSON.parse(process.argv[3]);
const report = { role: config.role, checks: {}, completed: false };
(async () => {
  const held = await prepare(fs, cp, { token: config.token, role: 'target' });
  try {
    held.assertHeld(); report.checks.preparedAndHeld = true;
    const result = cp.spawnSync('/usr/bin/python3', ['-c', probe, held.views.rootfs + '/opt/blobot-attributes58-' + config.token],
      { encoding: 'utf8', maxBuffer: 2 * 1024 ** 2, timeout: 60000, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', TZ: 'UTC' } });
    report.probe = JSON.parse(result.stdout || '{}');
    report.probeExit = result.status; report.probeStderr = result.stderr;
    assert.equal(result.status, 0); assert.equal(result.stderr, ''); assert(report.probe.completed);
    held.assertHeld(); report.checks.heldAfterProbe = true;
  } finally { await held.dispose(); }
  assert(Object.values(held.views).every(view => !fs.existsSync(view)));
  const relative = fs.readFileSync('/proc/1/cgroup', 'utf8').trim().slice(3);
  assert.match(fs.readFileSync('/sys/fs/cgroup' + relative + '/cgroup.events', 'utf8'), /^frozen 1$/m);
  report.checks.viewsRemovedStillFrozen = true; report.completed = true;
})().catch(error => { report.error = String(error.stack); process.exitCode = 1; })
  .finally(() => process.stdout.write(JSON.stringify(report)));
