// Synthetic bytes only. Real Agent archives must be verified inside their guest workers.
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createStateArchiveVerifier } from '../../../packages/core/src/machines/sbx/state-archive.ts';

const name = 'blobot-archive41-' + randomUUID();
const image = 'sha256:74d888efe94fb1544ae5a275964cfa5ba00dd96de9b4bd50bd1e8c7d917a19df';
const env = { ...process.env, DOCKER_HOST: 'unix:///Users/guillermo/.docker/run/docker.sock',
  DOCKER_CONFIG: '/private/tmp/blobot-machine-images.040Rvi/docker-config' };
const python = String.raw`
import os,sys,stat,struct,subprocess
root='/tmp/synthetic';os.mkdir(root);os.mkdir(root+'/dir');os.mkdir(root+'/empty')
with open(root+'/file','wb') as f:f.write(b'synthetic\x00\xff')
os.link(root+'/file',root+'/dir/hardlink');os.symlink('/absolute/target',root+'/symlink')
os.chown(root+'/file',1000,1001);os.chmod(root+'/file',0o640)
os.setxattr(root+'/dir','user.blobot',b'directory\x00\xff');os.setxattr(root+'/file','user.blobot',b'file\x00\xff')
entries=[(1,7,0xffffffff),(2,4,12345),(4,5,0xffffffff),(16,5,0xffffffff),(32,0,0xffffffff)]
acl=struct.pack('<I',2)+b''.join(struct.pack('<HHI',*e) for e in entries)
os.setxattr(root+'/dir','system.posix_acl_default',acl);os.setxattr(root+'/file','system.posix_acl_access',acl)
with open(root+'/sparse','wb') as f:f.seek(1024*1024);f.write(b'tail')
for name in ['-option','line\nbreak','x'*200]:
    with open(root+'/'+name,'w') as f:f.write('synthetic')
os.mkfifo(root+'/fifo',0o620)
for base,dirs,files in os.walk(root,topdown=False):
    for name in dirs+files:os.utime(base+'/'+name,ns=(1700000000000000000,1788635508123456789),follow_symlinks=False)
    os.utime(base,ns=(1700000000000000000,1788635508123456789))
args=['tar','--incremental','--sort=name','--format=pax','--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime',
      '--numeric-owner','--acls','--xattrs','--xattrs-include=*','--sparse','--sparse-version=0.0','--atime-preserve=system','-C',root,'-cf','-','.']
sys.exit(subprocess.run(args,env={'PATH':'/usr/bin:/bin','LC_ALL':'C','TZ':'UTC'}).returncode)
`;
const result = { container: name, image, startedAt: new Date().toISOString(), checks: {}, cleanup: false };
const verifier = createStateArchiveVerifier(), hash = createHash('sha256');
let bytes = 0, stderr = '', caught;
const child = spawn('docker', ['run', '--rm', '--name', name, '--network', 'none', '--pull', 'never', '--user', '0',
  '-i', image, '/usr/bin/python3', '-c', python], { env, stdio: ['ignore', 'pipe', 'pipe'] });
const done = new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', (code, signal) => resolve({ code, signal }));
});
child.stderr.on('data', data => { stderr = (stderr + data).slice(-8192); });
try {
  for await (const chunk of child.stdout) {
    bytes += chunk.length;
    if (bytes > 16 * 1024 ** 2) throw new Error('Synthetic archive exceeded bound');
    hash.update(chunk);
    for (let at = 0; at < chunk.length; at += 64 * 1024) verifier.write(chunk.subarray(at, at + 64 * 1024));
  }
  const status = await done;
  if (status.code !== 0 || stderr !== '') throw new Error('Synthetic tar failed: ' + JSON.stringify({ status, stderr }));
  verifier.finish();
  result.checks = { actualGnuPaxAccepted: true, bytes, sha256: hash.digest('hex'), stderrEmpty: true, ...status };
} catch (error) {
  caught = error;
  result.error = String(error);
  child.kill('SIGKILL'); await done;
} finally {
  try { execFileSync('docker', ['rm', '-f', name], { env, stdio: 'ignore' }); } catch {}
  try { execFileSync('docker', ['inspect', name], { env, stdio: 'ignore' }); }
  catch { result.cleanup = true; }
  writeFileSync(new URL('./41-state-archive-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
}
if (caught) throw caught;
if (!result.cleanup) throw new Error('Synthetic container cleanup failed');
console.log(JSON.stringify(result));
