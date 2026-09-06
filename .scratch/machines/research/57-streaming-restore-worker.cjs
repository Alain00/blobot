// All payloads and indexes remain guest-local; only aggregate synthetic results are returned.
const fs = require('node:fs'), cp = require('node:child_process'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const config = JSON.parse(process.argv[1]), definitions = JSON.parse(process.argv[3]);
const functionOf = source => new Function('return (' + source + ')')();
const prepare = functionOf(process.argv[2]);
const verify = functionOf(definitions.verify), index = functionOf(definitions.index), select = functionOf(definitions.select);
const read = functionOf(definitions.read), receive = functionOf(definitions.receive);
const bundleHeader = functionOf(definitions.header), bundleReader = functionOf(definitions.bundle);
const report = { role: config.role, checks: {}, completed: false };
(async () => {
  const held = await prepare(fs, cp, { token: config.token, role: 'target' });
  const source = held.views.rootfs + '/tmp/blobot-restore57-' + config.token;
  fs.mkdirSync(source, { mode: 0o700 });
  const readTree = async (path, capture = false) => {
    const chunks = [];
    const result = await read({ commands: cp, crypto }, { verify, index }, {
      path, maxBytes: 1024 ** 2, assertHeld: held.assertHeld,
      ...(capture ? { async emit(chunk) { chunks.push(Buffer.from(chunk)); } } : {}),
    });
    return { ...result, bytes: capture ? Buffer.concat(chunks) : undefined };
  };
  fs.mkdirSync(source + '/dir');
  fs.writeFileSync(source + '/file', 'synthetic-new');
  fs.linkSync(source + '/file', source + '/dir/hardlink');
  fs.symlinkSync('/synthetic/dangling', source + '/symlink');
  for (const name of ['line\nbreak', 'literal[*]?', '-option']) fs.writeFileSync(source + '/' + name, 'synthetic');
  fs.writeFileSync(held.views.home + '/file', 'synthetic-old');
  fs.writeFileSync(held.views.home + '/extra', 'delete-me');
  fs.mkdirSync(held.views.home + '/symlink'); fs.writeFileSync(held.views.home + '/symlink/old', 'old');
  fs.chownSync(source, 1000, 1000);
  const a = await readTree(source, true), b = await readTree(held.views.home);
  const hooks = [];
  const options = target => ({
    path: held.views.home, privateDirectory: held.views.home.slice(0, -'/home'.length),
    source: a.members, target, assertHeld: held.assertHeld,
    async prepareAttributes(selection) { hooks.push(selection === null ? 'noop' : 'prepare'); },
    async finishAttributes() { hooks.push('finish'); },
  });
  let receiver;
  const metadata = Buffer.from('{"fixture":"synthetic-only"}');
  const consumer = bundleReader({
    async metadata(value) {
      assert(value.equals(metadata));
      receiver = await receive({ fs, commands: cp, crypto }, { verify, index, select }, options(b.members));
      assert.equal(fs.existsSync(options(b.members).privateDirectory + '/selection'), false);
    },
    async archive(value) { await receiver.write(value); },
  });
  const wire = Buffer.concat([bundleHeader(metadata), metadata, a.bytes]);
  for (let at = 0; at < wire.length; at += 997) await consumer.write(wire.subarray(at, at + 997));
  consumer.finish(); await receiver.finish();
  const restored = await readTree(held.views.home);
  assert.deepEqual(restored.digest, a.digest); assert.deepEqual(hooks, ['prepare', 'finish']);
  assert.equal(fs.existsSync(held.views.home + '/extra'), false);
  assert.equal(fs.statSync(held.views.home + '/file').ino, fs.statSync(held.views.home + '/dir/hardlink').ino);
  report.checks.completePaxAndHardlinks = true;
  report.checks.unlinkedRegularSelectionFile = true;
  report.checks.bundlePreflightBeforeArchive = true;
  const beforeNoop = fs.statSync(held.views.home + '/file', { bigint: true }).ctimeNs;
  const noop = await receive({ fs, commands: cp, crypto }, { verify, index, select }, options(restored.members));
  for (let at = 0; at < a.bytes.length; at += 4096) await noop.write(a.bytes.subarray(at, at + 4096));
  await noop.finish();
  assert.equal(fs.statSync(held.views.home + '/file', { bigint: true }).ctimeNs, beforeNoop);
  assert.deepEqual(hooks.slice(-2), ['noop', 'finish']); report.checks.noopLeavesFileInodeMetadata = true;

  // The candidate may be partially changed before rejection; no success hook may run.
  fs.writeFileSync(held.views.home + '/file', 'synthetic-drift');
  const drifted = await readTree(held.views.home), count = hooks.filter(value => value === 'finish').length;
  const broken = await receive({ fs, commands: cp, crypto }, { verify, index, select }, options(drifted.members));
  await broken.write(a.bytes.subarray(0, 1024));
  await assert.rejects(broken.finish(), /restoration could not be verified/);
  assert.equal(hooks.filter(value => value === 'finish').length, count);
  held.assertHeld(); report.checks.truncatedStreamRejectedAndHelperClosed = true;
  const again = await receive({ fs, commands: cp, crypto }, { verify, index, select }, options((await readTree(held.views.home)).members));
  await again.abort(); held.assertHeld();
  report.checks.abortClosesHelper = true;
  report.archive = { ...a.digest, members: a.members.size };
  // No inode-attribute implementation is supplied: these callbacks deliberately test ordering
  // only. Never interpret this fixture as preservation of flags or full Machine migration.
  fs.rmSync(source, { recursive: true });
  await held.dispose(); report.checks.viewsDisposed = true; report.completed = true;
})().catch(error => { report.error = String(error.stack); process.exitCode = 1; })
  .finally(() => process.stdout.write(JSON.stringify(report)));
