import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSbxTransport } from '../../../packages/core/src/machines/sbx/transport.ts';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const bounded = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: any;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('probe deadline')), ms); })]); }
  finally { clearTimeout(timer); }
};

export async function runTransportProbes(sandboxName: string, cwd: string) {
  const report: any = { startedAt: new Date().toISOString(), rounds: [] };
  const empty = { jsonrpc: '2.0', id: 69, method: 'research69/echo', params: { data: '' } };
  const prefixBytes = Buffer.byteLength(JSON.stringify(empty));
  const bytes = 6 * 1024 ** 2;
  const pattern = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const data = pattern.repeat(Math.ceil((bytes - prefixBytes) / pattern.length)).slice(0, bytes - prefixBytes);
  const document = JSON.stringify({ ...empty, params: { data } });
  assert.equal(Buffer.byteLength(document), bytes);
  const wire = `${document}\n`, sha256 = createHash('sha256').update(document).digest('hex');
  report.source = { jsonBytes: bytes, wireBytes: Buffer.byteLength(wire), sha256, validJson: true };
  const guest = String.raw`
const crypto=require('node:crypto'),{once}=require('node:events');
(async()=>{const pieces=[];let reads=0,length=0;for await(const chunk of process.stdin){reads++;length+=chunk.length;if(length>7*1024**2)throw Error('fixture bound');pieces.push(chunk);}
const wire=Buffer.concat(pieces),doc=wire.subarray(0,-1);if(wire[wire.length-1]!==10)throw Error('EOF delimiter missing');const value=JSON.parse(doc.toString('utf8'));if(value.method!=='research69/echo')throw Error('wrong method');
let pressure=0,writes=0,maxDrainWaitMs=0;const outputStart=Date.now();for(let offset=0;offset<wire.length;offset+=65536){writes++;if(!process.stdout.write(wire.subarray(offset,offset+65536))){pressure++;const start=Date.now();await once(process.stdout,'drain');maxDrainWaitMs=Math.max(maxDrainWaitMs,Date.now()-start);}}
process.stderr.write(JSON.stringify({jsonBytes:doc.length,wireBytes:wire.length,sha256:crypto.createHash('sha256').update(doc).digest('hex'),validJson:true,readChunks:reads,writeChunks:writes,writeBackpressure:pressure,maxDrainWaitMs,outputMs:Date.now()-outputStart,eofSeen:true})+'\n');
})().catch(()=>{process.stderr.write('{"fixtureError":true}\n');process.exitCode=1;});`;
  for (const mode of ['whole-line', 'chunked-slow-reader']) {
    const result: any = { mode, host: { writes: 0, falseReturns: 0, drains: 0, peakWritableLength: 0 }, stderr: [] };
    report.rounds.push(result);
    const originalSpawn = childProcess.spawn;
    let observedChild: any;
    // Read-only per-process instrumentation: preserve write()'s arguments, return and events.
    childProcess.spawn = ((...args: any[]) => {
      const child: any = (originalSpawn as any)(...args); observedChild = child;
      const originalWrite = child.stdin.write;
      child.stdin.write = function (...writeArgs: any[]) {
        const accepted = originalWrite.apply(this, writeArgs);
        result.host.writes++; if (!accepted) result.host.falseReturns++;
        result.host.peakWritableLength = Math.max(result.host.peakWritableLength, this.writableLength);
        return accepted;
      };
      child.stdin.on('drain', () => result.host.drains++);
      return child;
    }) as any;
    syncBuiltinESMExports();
    let channel: any;
    try {
      channel = spawnSbxTransport({ sandboxName, guestNode: '/usr/bin/node', moduleRoot: '/opt/blobot',
        allowedEnvironment: [], sbxExecutable: '/opt/homebrew/bin/sbx' }, { cwd,
        command: { kind: 'exec', executable: '/usr/bin/node', args: ['-e', guest] },
        onStderr: line => { try { result.stderr.push(JSON.parse(line)); } catch { result.stderr.push({ diagnosticBytes: Buffer.byteLength(line) }); } } });
    } finally { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); }
    const start = performance.now();
    channel.onClose((reason: any) => { result.closeReason = reason ?? null; });
    const incoming = (async () => {
      if (mode === 'chunked-slow-reader') await pause(700);
      const lines: string[] = [];
      for await (const line of channel.lines()) lines.push(line);
      assert.equal(lines.length, 1);
      const returned = lines[0]!;
      assert.equal(Buffer.byteLength(returned), bytes); assert.equal(JSON.parse(returned).params.data.length, data.length);
      assert.equal(createHash('sha256').update(returned).digest('hex'), sha256);
      result.returned = { jsonBytes: Buffer.byteLength(returned), sha256, lines: lines.length, validJson: true };
    })();
    try {
      if (mode === 'whole-line') channel.write(wire);
      else for (let offset = 0; offset < wire.length; offset += 32771) channel.write(wire.slice(offset, offset + 32771));
      // Public close sends stdin EOF and waits for the normal exit, with its existing 2 s fallback.
      await bounded(Promise.all([channel.close(), incoming]), 15_000);
      result.ms = performance.now() - start;
      result.host.finalWritableLength = observedChild.stdin.writableLength;
      assert.equal(result.closeReason, null);
      const measurement = result.stderr.find((entry: any) => entry.eofSeen);
      assert.equal(measurement.jsonBytes, bytes); assert.equal(measurement.sha256, sha256);
      assert.equal(measurement.wireBytes, bytes + 1); assert(measurement.writeBackpressure > 0);
      result.passed = true;
    } catch (error: any) { result.passed = false; result.error = error.message; await channel.close().catch(() => {}); }
  }
  report.finishedAt = new Date().toISOString(); report.passed = report.rounds.every((round: any) => round.passed);
  return report;
}

export async function runSseProbe(machine: any, cwd: string) {
  const token = randomBytes(24).toString('base64url');
  const report: any = { startedAt: new Date().toISOString(), requests: [], handlerScope: 'Synthetic generic mailbox-shaped SSE; no provider credential or message delivery' };
  const server = createServer((request, response) => {
    const record: any = { method: request.method, path: request.url, authenticated: request.headers.authorization === `Bearer ${token}`,
      lastEventId: request.headers['last-event-id'] ?? null, sent: [] };
    report.requests.push(record);
    if (!record.authenticated) { response.writeHead(401); response.end(); return; }
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    response.flushHeaders(); const start = performance.now();
    let id = Number(record.lastEventId ?? 0);
    const timer = setInterval(() => {
      id++; response.write(`id: ${id}\nevent: fixture\ndata: synthetic-${id}\n\n`);
      record.sent.push({ id, ms: performance.now() - start });
      if (id === 5) { clearInterval(timer); response.end(); }
    }, 180);
    request.on('close', () => { clearInterval(timer); record.closed = true; record.closedMs = performance.now() - start; });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as any).port;
  const request = JSON.stringify({ url: `http://host.docker.internal:${port}/agents/research69/mcp`, token });
  const guest = String.raw`
const {spawn}=require('node:child_process');const input=JSON.parse(process.argv[1]);
async function stream(last,abortAt){return new Promise((resolve,reject)=>{const args=['-sS','-N','--max-time','15','-H','Authorization: Bearer '+input.token,...last?['-H','Last-Event-ID: '+last]:[],input.url];
const child=spawn('/usr/bin/curl',args,{stdio:['ignore','pipe','pipe']});const result={events:[],aborted:false,stderrBytes:0};let buffer='';const started=Date.now();
child.stderr.on('data',b=>result.stderrBytes+=b.length);child.on('error',()=>reject(Error('curl unavailable')));
child.stdout.on('data',b=>{buffer+=b.toString();let end;while((end=buffer.indexOf('\n\n'))!==-1){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);const id=Number(/^id: (\d+)$/m.exec(event)?.[1]);if(id){result.events.push({id,ms:Date.now()-started});if(abortAt&&result.events.length===abortAt){result.aborted=true;child.kill('SIGTERM');}}}});
child.on('close',(code,signal)=>resolve({...result,code,signal}));});}
(async()=>{const first=await stream(null,2);const second=await stream(first.events.at(-1).id,null);console.log(JSON.stringify({first,second}));})().catch(()=>{console.log('{"fixtureError":true}');process.exitCode=1;});`;
  let channel: any;
  try {
    channel = machine.spawn({ cwd, command: { kind: 'exec', executable: '/usr/bin/node', args: ['-e', guest, request] } });
    const lines: string[] = [];
    await bounded((async () => { for await (const line of channel.lines()) lines.push(line); })(), 30_000);
    await channel.close(); assert.equal(lines.length, 1); report.guest = JSON.parse(lines[0]!);
    assert.deepEqual(report.guest.first.events.map((event: any) => event.id), [1, 2]);
    assert(report.guest.first.aborted); assert.equal(report.guest.first.signal, 'SIGTERM');
    assert.deepEqual(report.guest.second.events.map((event: any) => event.id), [3, 4, 5]);
    assert.equal(report.guest.second.code, 0); assert.equal(report.requests.length, 2);
    assert(report.requests.every((entry: any) => entry.authenticated && entry.closed));
    assert.equal(report.requests[1].lastEventId, '2');
    for (const values of [report.guest.first.events, report.guest.second.events]) {
      assert(values[1].ms - values[0].ms >= 100, 'Events must arrive progressively, not at stream EOF');
    }
    report.passed = true;
  } catch (error: any) { report.passed = false; report.error = error.message; }
  finally { await channel?.close().catch(() => {}); await new Promise<void>(resolve => server.close(() => resolve())); }
  report.finishedAt = new Date().toISOString(); return report;
}
