import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

// Linux only (bwrap + socat + the seccomp helper). Modelled on 02-srt-probe-macos.mjs.
//
//   npm i @anthropic-ai/sandbox-runtime@0.0.75
//   node 03-linux-mailbox-probe.mjs proxy         # route A1: host proxy dials the host's loopback
//   node 03-linux-mailbox-probe.mjs unix          # route A2: in-sandbox socat -> bind-mounted unix socket
//   node 03-linux-mailbox-probe.mjs unix-denied   # control: allowUnixSockets (the path list) is ignored on Linux
//
// What each variant is asking, and what research/03 read in srt's source predicts:
//   proxy        `filterNetworkRequest` is a pure allowlist and `dialDirect` is a bare net.connect, so a
//                request that REACHES the proxy for 127.0.0.1:46777 should land on the host's mailbox.
//                research/01 never reached it: srt sets NO_PROXY=localhost,127.0.0.1,... and curl obeyed.
//   unix         apply-seccomp blocks socket(AF_UNIX) for the user command; `allowAllUnixSockets: true`
//                skips it entirely. Then a socat the wrapped command starts can bridge TCP -> unix socket,
//                and the CLI dials the URL it dials today. The same switch opens every host socket.
//   unix-denied  `allowUnixSockets: [path]` is documented as ignored on Linux; expect BLOCKED.

const variant = process.argv[2] ?? 'proxy';
const ws = new URL('./ws/', import.meta.url).pathname;
mkdirSync(ws, { recursive: true });
writeFileSync(ws + 'file.txt', 'agent work\n');

// Short path on purpose: sun_path is 108 bytes (research/01's own-fault EINVAL).
const SOCK = '/tmp/blobot-mb.sock';
rmSync(SOCK, { force: true });

// Two stand-ins for ticket 15's mailbox. Both echo the Authorization header back, so the probe can
// prove the bearer survived the hop, and both serve a tiny SSE stream on /sse.
const answer = (label) => (q, s) => {
  if (q.url === '/sse') {
    s.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    s.write(': ok\n\n');
    s.write('data: tick\n\n');
    setTimeout(() => s.end(), 1500);
    return;
  }
  s.end(`${label} method=${q.method} auth=${q.headers.authorization ?? 'none'}`);
};
const tcp = createServer(answer('mailbox-ok')).listen(46777, '127.0.0.1');
const unix = createServer(answer('mailbox-sock-ok')).listen(SOCK);
await Promise.all([
  new Promise((r) => tcp.once('listening', r)),
  new Promise((r) => unix.once('listening', r)),
]);

const network = {
  allowedDomains: ['api.anthropic.com', '127.0.0.1:46777', 'localhost:46777'],
  deniedDomains: [],
};
if (variant === 'unix') network.allowAllUnixSockets = true;
if (variant === 'unix-denied') network.allowUnixSockets = [SOCK];
console.log('variant:', variant, JSON.stringify(network));

await SandboxManager.initialize({
  network,
  filesystem: { denyRead: ['~/.ssh', '~/.aws'], allowWrite: [ws, '/tmp'], denyWrite: [] },
});

const baseline = [
  `echo "workspace write : $( (echo x > ${ws}ok.txt && echo YES) 2>&1 | tail -1)"`,
  `echo "ssh keys        : $(ls ~/.ssh 2>/dev/null | wc -l | tr -d ' ') entries"`,
  `echo "allowed domain  : $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://api.anthropic.com/ || echo BLOCKED)"`,
  `echo "denied domain   : $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://example.com/ || echo BLOCKED)"`,
  `echo "env proxies     : HTTP_PROXY=$HTTP_PROXY NO_PROXY=$NO_PROXY"`,
  // Expected BLOCKED in every variant: --unshare-net gives the sandbox an empty loopback of its own.
  `echo "MAILBOX direct, NO_PROXY as srt set     : $(curl -s --max-time 4 http://127.0.0.1:46777/ || echo BLOCKED)"`,
];

const proxyRoute = [
  // The proxy URL carries srt's per-session Proxy-Authorization in its userinfo; curl sends it.
  `P="$HTTP_PROXY"`,
  `echo "MAILBOX via proxy, 127.0.0.1:46777      : $(curl -s --max-time 6 -w ' [%{http_code}]' --noproxy '' -x "$P" -H 'Authorization: Bearer probe-token' http://127.0.0.1:46777/ || echo BLOCKED)"`,
  `echo "MAILBOX via proxy, localhost spelling   : $(curl -s --max-time 6 -w ' [%{http_code}]' --noproxy '' -x "$P" http://localhost:46777/ || echo BLOCKED)"`,
  // What a tool does if blobot strips NO_PROXY from the wrapped command instead of forcing -x.
  `echo "MAILBOX via proxy, NO_PROXY unset       : $(env -u NO_PROXY -u no_proxy curl -s --max-time 6 -w ' [%{http_code}]' http://127.0.0.1:46777/ || echo BLOCKED)"`,
  `echo "POST via proxy                          : $(curl -s --max-time 6 -w ' [%{http_code}]' --noproxy '' -x "$P" -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:46777/ || echo BLOCKED)"`,
  `echo "SSE via proxy (first 40 bytes)          : $(curl -s -N --max-time 4 --noproxy '' -x "$P" http://127.0.0.1:46777/sse | head -c 40 | tr '\\n' ' ')"`,
  // The entry carries its port, so a neighbouring loopback port must be refused (403 from the proxy).
  `echo "other loopback port via proxy (46778)   : $(curl -s --max-time 6 -w ' [%{http_code}]' --noproxy '' -x "$P" http://127.0.0.1:46778/ || echo BLOCKED)"`,
];

const unixRoute = [
  // blobot's own carrier: a socat the wrapped command starts, so the CLI dials the URL it dials today.
  `socat TCP-LISTEN:46777,bind=127.0.0.1,reuseaddr,fork UNIX-CONNECT:${SOCK} >/dev/null 2>&1 &`,
  `sleep 0.5`,
  `echo "MAILBOX via in-sandbox socat + unix sock: $(curl -s --max-time 4 -H 'Authorization: Bearer probe-token' http://127.0.0.1:46777/ || echo BLOCKED)"`,
  `echo "SSE via socat (first 40 bytes)          : $(curl -s -N --max-time 4 http://127.0.0.1:46777/sse | head -c 40 | tr '\\n' ' ')"`,
  `echo "unix socket direct (curl --unix-socket) : $(curl -s --max-time 4 --unix-socket ${SOCK} http://x/ || echo BLOCKED)"`,
  // The price of the switch: which host sockets under --ro-bind / / become connectable.
  `echo "opens too: /var/run/docker.sock         : $( [ -S /var/run/docker.sock ] && (curl -s --max-time 4 --unix-socket /var/run/docker.sock http://x/version | head -c 40 || echo BLOCKED) || echo absent)"`,
  `echo "opens too: SSH_AUTH_SOCK                : $( [ -n "$SSH_AUTH_SOCK" ] && (socat -u /dev/null UNIX-CONNECT:$SSH_AUTH_SOCK 2>/dev/null && echo REACHABLE || echo BLOCKED) || echo unset)"`,
  `echo "opens too: session bus                  : $( [ -S /run/user/$(id -u)/bus ] && (socat -u /dev/null UNIX-CONNECT:/run/user/$(id -u)/bus 2>/dev/null && echo REACHABLE || echo BLOCKED) || echo absent)"`,
  `kill %1 2>/dev/null`,
];

const script = [...baseline, ...(variant === 'proxy' ? proxyRoute : unixRoute)].join('; ');
const wrapped = await SandboxManager.wrapWithSandbox(`sh -c ${JSON.stringify(script)}`);
console.log('wrapped cmd (head):', wrapped.slice(0, 300).replace(/\n/g, ' '));
const child = spawn(wrapped, { shell: true, stdio: 'inherit' });
child.on('exit', async (code) => {
  await SandboxManager.reset();
  tcp.close();
  unix.close();
  rmSync(SOCK, { force: true });
  console.log('exit', code);
  process.exit(0);
});

// Not run on 2026-09-04: this was written on macOS, where bwrap and socat are absent. Alain runs it.
// After it, the second half is per runtime: a real CLI under the `proxy` route with NO_PROXY unset,
// to learn which of the five MCP clients honour HTTP_PROXY for an http://127.0.0.1 URL.
