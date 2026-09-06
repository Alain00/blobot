import { createServer, type Server } from 'node:http';
import type { Machine } from '../machines/machine.js';
import type { LoginCallback } from './login.js';

const CALLBACK_SOURCE = String.raw`
const {createInterface}=require('node:readline');
const http=require('node:http');
const input=createInterface({input:process.stdin});
let request;
input.once('line',line=>{
  try{
    if(line.length>16384)throw Error('limit');
    const value=JSON.parse(line);
    if(!Number.isInteger(value.port)||value.port<1024||value.port>65535||typeof value.path!=='string'||!value.path.startsWith('/'))throw Error('invalid');
    request=http.get({hostname:'127.0.0.1',port:value.port,path:value.path,timeout:30000},response=>{
      response.resume();response.on('end',()=>{process.stdout.write(JSON.stringify({status:response.statusCode})+'\n');input.close();process.stdin.destroy();});
    });
    request.on('timeout',()=>request.destroy());
    request.on('error',()=>{process.exitCode=1;input.close();process.stdin.destroy();});
  }catch{process.exitCode=1;input.close();process.stdin.destroy();}
});
input.on('close',()=>request?.destroy());
`;

export function validateLoginCallback(callback: LoginCallback): void {
  if (!Number.isInteger(callback.port) || callback.port < 1024 || callback.port > 65535 ||
      !/^\/[A-Za-z0-9/_-]+$/.test(callback.path) || !/^[A-Za-z0-9_-]{32,128}$/.test(callback.state)) {
    throw new Error('The runtime returned an unsupported browser callback.');
  }
}

export function admittedLoginCallback(method: string | undefined, path: string | undefined, callback: LoginCallback): string | undefined {
  if (method !== 'GET' || path === undefined || path.length > 8192 || !path.startsWith('/') || path.includes('#') || /%(?![0-9a-f]{2})/i.test(path)) return undefined;
  let url: URL;
  try { url = new URL(path, 'http://localhost'); } catch { return undefined; }
  if (url.origin !== 'http://localhost' || url.pathname !== callback.path ||
      url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== callback.state ||
      !((url.searchParams.getAll('code').length === 1 && !url.searchParams.has('error')) ||
        (url.searchParams.getAll('error').length === 1 && !url.searchParams.has('code')))) return undefined;
  const permitted = new Set(['code', 'state', 'scope', 'session_state', 'iss', 'error', 'error_description']);
  for (const key of url.searchParams.keys()) if (!permitted.has(key) || url.searchParams.getAll(key).length !== 1) return undefined;
  return `${url.pathname}${url.search}`;
}

/** A single browser return, bound to this vendor-generated state and this guest's loopback. */
export async function openLoginCallbackRelay(machine: Machine, guestNode: string, callback: LoginCallback): Promise<() => Promise<void>> {
  validateLoginCallback(callback);
  const servers: Server[] = [];
  let used = false;
  let closed = false;
  let channel: ReturnType<Machine['spawn']> | undefined;
  const close = async () => {
    closed = true;
    await channel?.close();
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => {
      server.closeAllConnections(); server.close(() => resolve());
    })));
  };
  try {
    for (const host of ['127.0.0.1', '::1']) {
      const server = createServer(async (request, response) => {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Referrer-Policy', 'no-referrer');
        const path = admittedLoginCallback(request.method, request.url, callback);
        if (closed || used || path === undefined || request.headers.host !== `localhost:${callback.port}`) {
          response.writeHead(400).end('This sign-in callback is not valid.'); return;
        }
        used = true;
        try {
          channel = machine.spawn({ command: { kind: 'exec', executable: guestNode, args: ['-e', CALLBACK_SOURCE] }, cwd: '/home/agent' });
          channel.write(`${JSON.stringify({ port: callback.port, path })}\n`);
          let succeeded = false;
          for await (const line of channel.lines()) {
            if (line.length > 1024) throw new Error('Invalid callback response');
            const value: unknown = JSON.parse(line);
            succeeded = typeof value === 'object' && value !== null && 'status' in value && value.status === 200;
            break;
          }
          response.writeHead(succeeded ? 200 : 502).end(succeeded
            ? 'Continue in blobot to check the result of this sign-in.' : 'Sign-in could not complete. Return to blobot and try again.');
        } catch { response.writeHead(502).end('Sign-in could not complete. Return to blobot and try again.'); }
        finally { await channel?.close(); channel = undefined; }
      });
      server.requestTimeout = 30_000;
      server.headersTimeout = 10_000;
      server.maxConnections = 4;
      servers.push(server);
      await new Promise<void>((resolve, reject) => {
        const error = (cause: NodeJS.ErrnoException) => {
          server.off('error', error);
          // IPv4 still serves localhost when this host has no IPv6 loopback stack.
          // A occupied IPv6 port is different: another listener could consume the return.
          if (host === '::1' && ['EAFNOSUPPORT', 'EPROTONOSUPPORT', 'EADDRNOTAVAIL'].includes(cause.code ?? '')) {
            resolve(); return;
          }
          reject(new Error(cause.code === 'EADDRINUSE'
            ? 'The browser callback port is in use. Close the other sign-in and try again.'
            : 'The browser callback could not bind to localhost. Check this computer’s network settings and try again.'));
        };
        server.once('error', error);
        server.listen(callback.port, host, () => { server.off('error', error); resolve(); });
      });
    }
    return close;
  } catch (error) { await close(); throw error; }
}
