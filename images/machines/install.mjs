// Build-time code only. The final image contains the vendor runtime and bridge, not this file.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const [runtime, arch] = process.argv.slice(2);
const inputs = JSON.parse(readFileSync('/build/inputs.json', 'utf8'));
const input = inputs.runtimes[runtime];
if (!input?.[arch]) throw new Error('Unsupported runtime/architecture');
const payload = readFileSync('/build/runtime.archive');
if (createHash('sha256').update(payload).digest('hex') !== input[arch].sha256) throw new Error('Runtime checksum mismatch');
if (payload.length !== input[arch].bytes) throw new Error('Runtime byte count mismatch');
if (process.version !== `v${inputs.nodeVersion}`) throw new Error('Unexpected base Node version');
const root = '/opt/blobot';
mkdirSync(`${root}/runtime`, { recursive: true });
mkdirSync(`${root}/bin`);
// RC5 exec drops supplementary groups. The guest's already-authorized passwordless sudo
// reaches only its own daemon; no host socket, identity or Docker config is copied in.
writeFileSync(`${root}/bin/docker`, '#!/bin/sh\nexec sudo -n -- /usr/bin/docker "$@"\n', { mode: 0o755 });
if (runtime === 'claude') {
  writeFileSync(`${root}/runtime/claude`, payload, { mode: 0o755 });
} else {
  const entries = execFileSync('tar', ['-tf', '/build/runtime.archive'], { encoding: 'utf8', maxBuffer: 8 * 1024 ** 2 }).split('\n').filter(Boolean);
  if (entries.some(entry => entry.startsWith('/') || entry.split('/').includes('..'))) throw new Error('Unsafe vendor archive path');
  execFileSync('tar', ['-xf', '/build/runtime.archive', '--no-same-owner', '-C', `${root}/runtime`,
    ...(runtime === 'cursor' ? ['--strip-components=1'] : [])]);
}
const executable = {
  claude: `${root}/runtime/claude`, codex: `${root}/runtime/bin/codex`,
  opencode: `${root}/runtime/opencode`, fx: `${root}/runtime/fx`, cursor: `${root}/runtime/cursor-agent`,
}[runtime];
if (!existsSync(executable)) throw new Error(`Vendor layout mismatch: expected ${executable}; got ${readdirSync(`${root}/runtime`)}`);
chmodSync(executable, 0o755);
const flags = runtime === 'cursor' ? ['--disable-auto-update'] : runtime === 'codex'
  ? ['-c', 'check_for_update_on_startup=false', '-c', 'analytics.enabled=false', '-c', 'feedback.enabled=false', '-c', 'otel.exporter="none"', '-c', 'otel.trace_exporter="none"'] : [];
const command = runtime === 'cursor' ? 'cursor-agent' : runtime;
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
writeFileSync(`${root}/bin/${command}`, `#!/bin/sh\nexec ${[executable, ...flags].map(quote).join(' ')} "$@"\n`, { mode: 0o755 });
if (runtime === 'claude' || runtime === 'codex') {
  execFileSync('cp', ['/build/package.json', '/build/package-lock.json', root]);
  execFileSync('npm', ['ci', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'],
    { cwd: root, stdio: 'inherit', env: { ...process.env, HOME: '/tmp', npm_config_cache: '/tmp/npm-cache', npm_config_userconfig: '/dev/null' } });
  // The selected CLI lives outside node_modules. Platform SDK copies are unnecessary.
  const anthropic = `${root}/node_modules/@anthropic-ai`;
  if (existsSync(anthropic) && readdirSync(anthropic).some(name => name.startsWith('claude-agent-sdk-'))) {
    throw new Error('Unexpected bundled Claude platform binary');
  }
}
writeFileSync(`${root}/image.json`, JSON.stringify({ schemaVersion: 1, runtime, version: input.version, arch,
  sourceSha256: input[arch].sha256, executable: `${root}/bin/${command}`, nodeVersion: inputs.nodeVersion,
  base: inputs.base }, null, 2) + '\n');
