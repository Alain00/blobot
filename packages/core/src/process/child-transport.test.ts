import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { childTransport } from './child-transport.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('never signals a completed group again when an old runtime is stopped later', async () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); });
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), pid: 12345, exitCode: 0, signalCode: null });
  const transport = childTransport(child as unknown as ChildProcessWithoutNullStreams, undefined, { processGroup: true });
  await transport.close(); await transport.close();
  expect(kill).toHaveBeenCalledTimes(1);
});
it('does not claim process shutdown until exit confirms the kill', async () => {
  vi.useFakeTimers();
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), pid: 12345, exitCode: null, signalCode: null, kill: vi.fn(() => true) });
  const transport = childTransport(child as unknown as ChildProcessWithoutNullStreams, undefined, { killAfterMs: 10 });
  let closed = false;
  const closing = transport.close().then(() => { closed = true; });
  await vi.advanceTimersByTimeAsync(10);
  expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  expect(closed).toBe(false);
  child.emit('exit', null, 'SIGKILL');
  await closing;
  expect(closed).toBe(true);
});

it('rejects an unconfirmed shutdown instead of releasing borrowed files', async () => {
  vi.useFakeTimers();
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), pid: 12345, exitCode: null, signalCode: null, kill: vi.fn(() => true) });
  const transport = childTransport(child as unknown as ChildProcessWithoutNullStreams, undefined, { killAfterMs: 10 });
  const refused = expect(transport.close()).rejects.toThrow(/confirm|stop|exit/);
  await vi.advanceTimersByTimeAsync(2010);
  await refused;
});

it.skipIf(process.platform === 'win32')('stops background children owned by the execution after the bridge exits', async () => {
  const child = spawn(process.execPath, ['-e', `const {spawn}=require('node:child_process'); const tool=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); console.log(tool.pid); process.stdin.resume(); process.stdin.on('end',()=>process.exit(0));`], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const transport = childTransport(child, undefined, { processGroup: true, killAfterMs: 100 });
  let pid: number | undefined;
  try {
    for await (const line of transport.lines()) { pid = Number(line); break; }
    expect(pid).toBeGreaterThan(0);
    await transport.close();
    expect(() => process.kill(pid!, 0)).toThrow();
  } finally { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* already stopped */ } }
});
