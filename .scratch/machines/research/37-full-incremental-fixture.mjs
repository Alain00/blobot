// Synthetic GNU tar research only. No sbx, host mounts, pulls, or production data.
import fs from 'node:fs';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const uuid = crypto.randomUUID(), name = `blobot-tar37-${uuid}`;
const image = 'sha256:74d888efe94fb1544ae5a275964cfa5ba00dd96de9b4bd50bd1e8c7d917a19df';
const env = { ...process.env, DOCKER_HOST: 'unix:///Users/guillermo/.docker/run/docker.sock', DOCKER_CONFIG: '/private/tmp/blobot-machine-images.040Rvi/docker-config' };
delete env.DOCKER_CONTEXT;
const script = fs.readFileSync(path.join(here, '37-full-incremental-worker.py'));
let result;
try {
  const run = cp.spawnSync('docker', ['run', '--rm', '--pull=never', '--name', name, '--network', 'none', '--user', '0', '--entrypoint', '/usr/bin/python3', '-i', image, '-'], { env, input: script, encoding: 'utf8', maxBuffer: 32 * 1024 ** 2, timeout: 120000 });
  result = { uuid, image, exitCode: run.status, signal: run.signal, stderr: run.stderr, error: run.error?.message, observation: run.stdout ? JSON.parse(run.stdout) : null };
} finally {
  const clean = cp.spawnSync('docker', ['rm', '-f', name], { env, encoding: 'utf8' });
  if (result) result.cleanup = { exitCode: clean.status, stderr: clean.stderr, onlyOwnedUuidName: name };
}
fs.writeFileSync(path.join(here, '37-full-incremental-results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (result.exitCode !== 0) process.exitCode = 1;
