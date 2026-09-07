import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

const ws = new URL('./ws/', import.meta.url).pathname;
mkdirSync(ws, { recursive: true });
writeFileSync(ws + 'file.txt', 'agent work\n');

const mailbox = createServer((_q, s) => s.end('mailbox-ok')).listen(46777, '127.0.0.1');
await new Promise((r) => mailbox.once('listening', r));

const variant = process.argv[2] ?? 'plain';
const network = { allowedDomains: ['api.anthropic.com'], deniedDomains: [] };
if (variant === 'local') { network.allowLocalBinding = true; network.allowedDomains.push('127.0.0.1:46777', 'localhost:46777'); }
console.log('variant:', variant, JSON.stringify(network));

await SandboxManager.initialize({
  network,
  filesystem: { denyRead: ['~/.ssh', '~/.aws'], allowWrite: [ws, '/tmp'], denyWrite: [] },
});

const script = [
  `echo "workspace write : $( (echo x > ${ws}ok.txt && echo YES) 2>&1 | tail -1)"`,
  `echo "ssh keys        : $(ls ~/.ssh 2>/dev/null | wc -l | tr -d ' ') entries"`,
  `echo "claude creds    : $(ls ~/.claude/.credentials.json 2>/dev/null || echo GONE)"`,
  `echo "outside write   : $( (echo x > ~/PWNED2.txt && echo YES) 2>&1 | tail -1)"`,
  `echo "MAILBOX (127.1) : $(curl -s --max-time 4 http://127.0.0.1:46777/ || echo BLOCKED)"`,
  `echo "MAILBOX (lo)    : $(curl -s --max-time 4 http://localhost:46777/ || echo BLOCKED)"`,
  `echo "allowed domain  : $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://api.anthropic.com/ || echo BLOCKED)"`,
  `echo "denied domain   : $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://example.com/ || echo BLOCKED)"`,
  `echo "env proxies     : HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY NO_PROXY=$NO_PROXY"`,
].join('; ');

const wrapped = await SandboxManager.wrapWithSandbox(`sh -c ${JSON.stringify(script)}`);
console.log('wrapped cmd (head):', wrapped.slice(0, 300).replace(/\n/g, ' '));
const child = spawn(wrapped, { shell: true, stdio: 'inherit' });
child.on('exit', async (code) => {
  await SandboxManager.reset();
  mailbox.close();
  console.log('exit', code);
  process.exit(0);
});
