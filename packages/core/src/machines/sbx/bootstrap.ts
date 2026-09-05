/**
 * Sent as constant code to the guest's Node, never installed into an image or a Workspace.
 * A length-prefixed header is read directly from fd 0, without prefetching the ACP bytes
 * after it. The launched runtime inherits that same fd at the first protocol byte.
 * Values (including personas) travel on stdin, never in the host's argv or a shell script.
 */
export const SBX_BOOTSTRAP_SOURCE = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
let stage = 'header';

async function readExact(size) {
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = await new Promise((resolve, reject) => {
      fs.read(0, buffer, offset, size - offset, null, (error, count) => {
        if (error) reject(error); else resolve(count);
      });
    });
    if (count === 0) throw new Error('incomplete launch header');
    offset += count;
  }
  return buffer;
}

function prepareConfig(config) {
  const root = fs.realpathSync(config.root);
  const parts = config.relativePath.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('invalid config path');
  let directory = root;
  for (const part of parts.slice(0, -1)) {
    directory = path.join(directory, part);
    try { fs.mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = fs.lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('invalid config directory');
  }
  const file = path.join(directory, parts[parts.length - 1]);
  let previous = {};
  try {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try { previous = JSON.parse(fs.readFileSync(fd, 'utf8')); }
    finally { fs.closeSync(fd); }
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) throw new Error('invalid config');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  fs.writeFileSync(file, JSON.stringify({ ...previous, ...config.patch }) + '\n', {
    flag: fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW,
    mode: 0o600,
  });
}

(async () => {
  const size = (await readExact(4)).readUInt32BE(0);
  if (size === 0 || size > 1048576) throw new Error('invalid launch header size');
  const request = JSON.parse((await readExact(size)).toString('utf8'));
  if (request.protocol !== 1) throw new Error('unsupported launch protocol');
  stage = 'environment';
  const env = { ...process.env };
  for (const [key, value] of Object.entries(request.env)) {
    if (value === null) delete env[key]; else env[key] = value;
  }
  for (const key of Object.keys(env)) {
    if (/^BLOBOT_[A-Z0-9_]+_API_KEY$/.test(key)) delete env[key];
  }
  // Defence in depth only: the engine must also disable the host agent relay itself.
  delete env.SSH_AUTH_SOCK;
  delete env.ELECTRON_RUN_AS_NODE;
  stage = 'config';
  for (const config of request.configs) prepareConfig(config);

  stage = 'command';
  let executable;
  let args;
  if (request.command.kind === 'node-module') {
    const command = request.command;
    const resolve = createRequire(path.join(request.moduleRoot, 'package.json'));
    const manifestPath = resolve.resolve(command.package + '/package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== command.version) throw new Error('bridge version mismatch');
    const root = path.dirname(manifestPath);
    const entry = fs.realpathSync(path.join(root, command.entry));
    const relative = path.relative(fs.realpathSync(root), entry);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('invalid bridge entry');
    executable = process.execPath;
    args = [entry];
  } else {
    executable = request.command.executable;
    args = request.command.args;
  }
  const child = spawn(executable, args, { cwd: request.cwd, env, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', () => {
    process.stderr.write('blobot: guest runtime could not start\n');
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code === null ? (signal === 'SIGINT' ? 130 : 143) : code;
  });
})().catch((error) => {
  // Do not echo a parse error: it can quote a fragment of the launch configuration.
  const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'INVALID';
  process.stderr.write('blobot: guest launch preparation failed (' + stage + '/' + code + ')\n');
  process.exitCode = 1;
});
`;
