import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';

const ws = new URL('./ws/', import.meta.url).pathname;
mkdirSync(ws, { recursive: true });
writeFileSync(ws + 'file.txt', 'agent work\n');

// Stand in for ticket 15's loopback mailbox.
const mailbox = createServer((_q, s) => s.end('mailbox-ok')).listen(46777, '127.0.0.1');
await new Promise((r) => mailbox.once('listening', r));

await SandboxManager.initialize({
  network: { allowedDomains: ['api.anthropic.com', '127.0.0.1:46777', 'localhost:46777'], deniedDomains: [], allowLocalBinding: true },
  filesystem: { denyRead: ['~/.ssh', '~/.aws'], allowWrite: [ws, '/tmp'], denyWrite: [] },
});

const script = [
  `echo "workspace write : $( (echo x > ${ws}ok.txt && echo YES) 2>&1 | tail -1)"`,
  `echo "ssh keys        : $(ls ~/.ssh 2>/dev/null | wc -l) entries"`,
  `echo "claude creds    : $(ls ~/.claude/.credentials.json 2>/dev/null || echo GONE)"`,
  `echo "outside write   : $( (echo x > ~/PWNED2.txt && echo YES) 2>&1 | tail -1)"`,
  `echo "MAILBOX (127.1) : $(curl -s --max-time 4 http://127.0.0.1:46777/ || echo BLOCKED)"`,
  `echo "allowed domain  : $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://api.anthropic.com/ || echo BLOCKED)"`,
  `echo "denied domain   : $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://example.com/ || echo BLOCKED)"`,
].join('; ');

const wrapped = await SandboxManager.wrapWithSandbox(`sh -c ${JSON.stringify(script)}`);
const child = spawn(wrapped, { shell: true, stdio: 'inherit' });
child.on('exit', async (code) => {
  await SandboxManager.reset();
  mailbox.close();
  console.log('exit', code);
  process.exit(0);
});

// Run: npm i @anthropic-ai/sandbox-runtime@0.0.74 && node 01-srt-probe.mjs
// Produced the §3 table in 01-external-sandbox-libraries.md on 2026-08-31.
// Kept because the blocking result (the mailbox) is the kind of thing that changes
// under the dependency, and re-running is cheaper than re-deriving.
