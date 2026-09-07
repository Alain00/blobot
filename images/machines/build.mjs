// Native CI/local image builder. All inputs are pinned; no sign-in or release publishing here.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { pipeline } from 'node:stream/promises';

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { runtime: { type: 'string' }, arch: { type: 'string' },
  out: { type: 'string' }, cache: { type: 'string' }, artifact: { type: 'string' }, 'no-export': { type: 'boolean', default: false } } });
const runtime = values.runtime, arch = values.arch ?? ({ arm64: 'arm64', x64: 'amd64' }[process.arch]);
const inputs = JSON.parse(await readFile(join(here, 'inputs.json'), 'utf8'));
const input = inputs.runtimes[runtime]?.[arch];
if (!input || !['arm64', 'amd64'].includes(arch)) throw new Error('Choose a supported --runtime and --arch');
const inputsText = JSON.stringify({ schemaVersion: inputs.schemaVersion, base: inputs.base, nodeVersion: inputs.nodeVersion,
  runtimes: { [runtime]: { version: inputs.runtimes[runtime].version, [arch]: input } } }, null, 2) + '\n';
const out = resolve(values.out ?? join(tmpdir(), 'blobot-machine-builds'));
const cache = resolve(values.cache ?? join(out, 'cache'));
await mkdir(out, { recursive: true }); await mkdir(cache, { recursive: true });
const digest = async path => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
const archive = values.artifact ? resolve(values.artifact) : join(cache, input.sha256);
async function verifyArchive() {
  return (await stat(archive).catch(() => undefined))?.size === input.bytes && await digest(archive) === input.sha256;
}
if (!await verifyArchive()) {
  if (values.artifact) throw new Error('Supplied artifact checksum/size mismatch');
  const part = `${archive}.part`;
  const response = await fetch(input.url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body) throw new Error(`Runtime download failed: ${response.status}`);
  try { await pipeline(response.body, createWriteStream(part, { flags: 'w' }));
    if ((await stat(part)).size !== input.bytes || await digest(part) !== input.sha256) throw new Error('Downloaded runtime checksum/size mismatch');
    await copyFile(part, archive);
  } finally { await rm(part, { force: true }); }
}
const bridge = runtime === 'claude' || runtime === 'codex';
const installer = await readFile(join(here, 'install.mjs'));
const locks = bridge ? await Promise.all(['package.json', 'package-lock.json'].map(name => readFile(join(here, 'bridges', runtime, name)))) : [];
const env = { HOME: '/home/agent', PATH: '/opt/blobot/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', NODE_USE_ENV_PROXY: '1',
  ...(runtime === 'claude' ? { CLAUDE_CODE_EXECUTABLE: '/opt/blobot/bin/claude', DISABLE_UPDATES: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1' } : {}),
  ...(runtime === 'codex' ? { CODEX_PATH: '/opt/blobot/bin/codex' } : {}),
  ...(runtime === 'opencode' ? { OPENCODE_DISABLE_AUTOUPDATE: '1' } : {}),
  ...(runtime === 'fx' ? { FX_AUTO_UPGRADE: '0' } : {}) };
const dockerfile = `FROM ${inputs.base} AS payload
USER root
COPY inputs.json install.mjs runtime.archive /build/
${bridge ? 'COPY package.json package-lock.json /build/\n' : ''}RUN node /build/install.mjs ${runtime} ${arch}
FROM ${inputs.base}
COPY --from=payload /opt/blobot /opt/blobot
LABEL com.docker.sandboxes.start-docker="false"
${Object.entries(env).map(([key, value]) => `ENV ${key}=${JSON.stringify(value)}`).join('\n')}
USER agent
WORKDIR /home/agent
`;
const hash = createHash('sha256').update(dockerfile).update(inputsText).update(installer);
for (const lock of locks) hash.update(lock);
const recipe = hash.digest('hex');
const buildReference = `blobot-machine-${runtime}:build-${recipe.slice(0, 20)}-${arch}`;
const context = await mkdtemp(join(tmpdir(), 'blobot-image-context-'));
const run = (args, capture = false) => new Promise((accept, reject) => {
  const child = spawn('docker', args, { stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'] });
  let stdout = ''; if (capture) child.stdout.on('data', chunk => { stdout += chunk; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? accept(stdout) : reject(new Error(`docker ${args[0]} failed (${code})`)));
});
try {
  const storage = JSON.parse(await run(['info', '--format', '{{json .DriverStatus}}'], true));
  if (!storage.some(([key, value]) => key === 'driver-type' && value === 'io.containerd.snapshotter.v1')) {
    throw new Error('Build requires Docker containerd image store for a single manifest-addressed OCI archive');
  }
  await writeFile(join(context, 'Dockerfile'), dockerfile);
  await writeFile(join(context, 'inputs.json'), inputsText);
  await writeFile(join(context, 'install.mjs'), installer);
  await copyFile(archive, join(context, 'runtime.archive'));
  for (let i = 0; i < locks.length; i++) await writeFile(join(context, i === 0 ? 'package.json' : 'package-lock.json'), locks[i]);
  // Normalize BuildKit timestamps; byte-identical builds across hosts are not yet certified.
  await run(['buildx', 'build', '--load', '--platform', `linux/${arch}`, '--provenance=false', '--build-arg', 'SOURCE_DATE_EPOCH=1788629236',
    '--tag', buildReference, context]);
  const info = JSON.parse(await run(['image', 'inspect', buildReference], true))[0];
  if (info.Architecture !== arch || info.Os !== 'linux' || info.Config.User !== 'agent' ||
      info.Config.Labels?.['com.docker.sandboxes.start-docker'] !== 'false') throw new Error('Built image contract mismatch');
  // Content, not just the recipe: a rebuild with different bytes must have a different tag.
  const reference = `blobot-machine-${runtime}:${info.Id.slice(7)}-${arch}`;
  await run(['image', 'tag', buildReference, reference]);
  await run(['image', 'rm', buildReference]);
  const executable = `/opt/blobot/bin/${runtime === 'cursor' ? 'cursor-agent' : runtime}`;
  const version = (await run(['run', '--rm', '--network', 'none', '--cpus', '1', '--memory', '1g', '--entrypoint', executable, reference, '--version'], true)).trim();
  if (!version.includes(inputs.runtimes[runtime].version)) throw new Error(`Runtime version mismatch: ${version}`);
  const receipt = { schemaVersion: 1, runtime, arch, version: inputs.runtimes[runtime].version, recipe, reference, imageId: info.Id,
    imageBytes: info.Size, versionOutput: version, base: inputs.base, guestNode: '/usr/bin/node', moduleRoot: '/opt/blobot', executable };
  if (!values['no-export']) {
    const asset = `blobot-machine-${runtime}-${arch}-${info.Id.slice(7)}.tar`;
    const tar = join(out, asset);
    await run(['image', 'save', '--output', tar, reference]);
    if ((await stat(tar)).size > inputs.runtimes[runtime].maxArchiveBytes) {
      throw new Error('Runtime archive exceeds its reviewed download budget');
    }
    // Classic Docker stores use config IDs; sbx identifies OCI manifests. Refuse that format
    // rather than publishing a receipt whose ID can never match the engine's inventory.
    const index = JSON.parse(execFileSync('tar', ['-xOf', tar, 'index.json'], { encoding: 'utf8', maxBuffer: 2 * 1024 ** 2 }));
    if (index.manifests?.length !== 1 || index.manifests[0].digest !== info.Id ||
        index.manifests[0].annotations?.['io.containerd.image.name'] !== `docker.io/library/${reference}`) {
      throw new Error('Exported archive is not the expected single-image OCI layout');
    }
    Object.assign(receipt, { asset, bytes: (await stat(tar)).size, sha256: await digest(tar) });
  }
  const receiptPath = join(out, `${runtime}-${arch}.json`);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ receipt: receiptPath, ...receipt }));
} finally { await rm(context, { recursive: true, force: true }); }
