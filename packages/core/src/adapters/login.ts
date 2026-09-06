import { StringDecoder } from 'node:string_decoder';
import type { Machine, MachineTransport } from '../machines/machine.js';
import { openLoginCallbackRelay } from './login-callback.js';

/** Ephemeral UI state. Never stored in a transcript, diagnostics or a credentials database. */
export type LoginChallenge =
  | { readonly kind: 'browser'; readonly url: string; readonly code?: string;
      readonly input?: string; readonly detail?: string; readonly callback?: LoginCallback }
  | { readonly kind: 'choice'; readonly label: string; readonly choices: readonly { readonly value: string; readonly label: string }[] };
export interface LoginCallback { readonly port: number; readonly path: string; readonly state: string; }
export interface RuntimeLoginMethod { readonly id: string; readonly label: string; readonly detail?: string; }
export interface RuntimeLoginSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  /** Adapter-owned parser for its pinned vendor CLI, never a generic terminal in the UI. */
  readonly parse: (text: string) => LoginChallenge | undefined;
  readonly validateInput?: (value: string, challenge: LoginChallenge) => boolean;
  readonly completed?: (text: string) => boolean;
}
export interface RuntimeLogin {
  readonly methods: readonly RuntimeLoginMethod[];
  spec(method: string): RuntimeLoginSpec;
}

/** Preserve prompts without newlines, and keep input out of process argv and shell commands. */
export const GUEST_LOGIN_SOURCE = String.raw`
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const request=JSON.parse(process.argv[1]);
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const child=spawn(request.executable,request.args,{stdio:['pipe','pipe','pipe'],detached:true,env:process.env});
let ended=false,killer;
const kill=signal=>{try{if(child.pid)process.kill(-child.pid,signal);}catch{}};
const stop=()=>{if(ended)return;kill('SIGTERM');killer=setTimeout(()=>kill('SIGKILL'),500);};
child.stdout.on('data',data=>send({type:'data',stream:'stdout',data:data.toString('base64')}));
child.stderr.on('data',data=>send({type:'data',stream:'stderr',data:data.toString('base64')}));
child.stdin.on('error',stop);
child.on('error',()=>{send({type:'exit',code:127});process.exitCode=1;});
child.on('close',(code)=>{ended=true;clearTimeout(killer);send({type:'exit',code:Number.isInteger(code)?code:130});lines.close();process.stdin.destroy();});
const lines=createInterface({input:process.stdin});
lines.on('line',line=>{
  try{
    if(line.length>16384)throw Error('input too large');
    const input=JSON.parse(line);
    if(input.type!=='input'||typeof input.value!=='string'||input.value.length>4096)throw Error('invalid input');
    child.stdin.write(input.value);
  }catch{stop();}
});
lines.on('close',stop);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,stop);
`;

/** Escape sequences are structure in CLI text, never an instruction to the renderer. */
export function loginText(value: string): string {
  return value.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replaceAll('\r', '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

/** Parse only an adapter's known HTTPS origin/path; no arbitrary CLI links reach the browser. */
export function loginUrl(text: string, accept: (url: URL) => boolean): URL | undefined {
  for (const candidate of text.matchAll(/https:\/\/[^\s<>"']+(?=[\s<>"'])/g)) {
    if (candidate[0].length > 8192) continue;
    try {
      const url = new URL(candidate[0]);
      if (!url.username && !url.password && !url.port && !url.hash && accept(url)) return url;
    } catch { /* A partial chunk is not a challenge yet. */ }
  }
  return undefined;
}

/** One run, one owned guest process, bounded private text and explicitly solicited stdin. */
export class MachineLogin {
  #transport: MachineTransport | undefined;
  #challenge: LoginChallenge | undefined;
  #started = false;
  constructor(readonly machine: Machine, readonly guestNode: string, readonly spec: RuntimeLoginSpec) {}

  respond(value: string): void {
    const challenge = this.#challenge;
    if (this.#transport === undefined || challenge === undefined) throw new Error('This sign-in is no longer waiting for input.');
    if (typeof value !== 'string' || value.length === 0 || value.length > 2048 || /[\x00-\x20\x7f]/.test(value)) {
      throw new Error('Enter the code or choice requested by this sign-in.');
    }
    if (challenge.kind === 'choice') {
      if (!challenge.choices.some((choice) => choice.value === value)) throw new Error('Choose one of the listed options.');
    } else if (challenge.input === undefined) throw new Error('This sign-in does not need a code.');
    if (this.spec.validateInput?.(value, challenge) === false) throw new Error('This code does not belong to the current sign-in.');
    this.#challenge = undefined;
    this.#transport.write(`${JSON.stringify({ type: 'input', value: `${value}\n` })}\n`);
  }

  async run(signal: AbortSignal, onChallenge: (challenge: LoginChallenge) => void | Promise<void>): Promise<void> {
    if (this.#started) throw new Error('This sign-in attempt has already started.');
    this.#started = true;
    signal.throwIfAborted();
    await this.machine.beforeWork?.();
    signal.throwIfAborted();
    const transport = this.machine.spawn({
      command: { kind: 'exec', executable: this.guestNode, args: ['-e', GUEST_LOGIN_SOURCE,
        JSON.stringify({ executable: this.spec.executable, args: this.spec.args })] },
      cwd: '/home/agent', ...(this.spec.env === undefined ? {} : { env: this.spec.env }),
    });
    this.#transport = transport;
    const abort = () => { void transport.close().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
    let text = '', previous = '', exited = false;
    let closeRelay: (() => Promise<void>) | undefined;
    try {
      for await (const line of transport.lines()) {
        signal.throwIfAborted();
        if (line.length > 512 * 1024) throw new Error('Sign-in output exceeded its limit.');
        let value: unknown;
        try { value = JSON.parse(line); } catch { throw new Error('Sign-in could not be read.'); }
        if (value === null || typeof value !== 'object') throw new Error('Sign-in could not be read.');
        const frame = value as Record<string, unknown>;
        if (frame['type'] === 'exit') {
          if (frame['code'] !== 0 || this.spec.completed?.(loginText(text)) === false) {
            throw new Error('Sign-in did not complete. Try again or check your account’s sign-in settings.');
          }
          exited = true; break;
        }
        if (frame['type'] !== 'data' || (frame['stream'] !== 'stdout' && frame['stream'] !== 'stderr') ||
            typeof frame['data'] !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(frame['data'])) {
          throw new Error('Sign-in could not be read.');
        }
        text += decoders[frame['stream']].write(Buffer.from(frame['data'], 'base64'));
        if (Buffer.byteLength(text) > 256 * 1024) throw new Error('Sign-in output exceeded its limit.');
        const challenge = this.spec.parse(loginText(text));
        if (challenge !== undefined && JSON.stringify(challenge) !== previous) {
          if (challenge.kind === 'browser' && challenge.callback !== undefined) {
            if (closeRelay !== undefined) throw new Error('The browser sign-in changed while it was waiting. Try again.');
            closeRelay = await openLoginCallbackRelay(this.machine, this.guestNode, challenge.callback);
          }
          previous = JSON.stringify(challenge); this.#challenge = challenge;
          await onChallenge(challenge);
        }
      }
      signal.throwIfAborted();
      if (!exited) throw new Error('Sign-in closed before completion.');
    } finally {
      text = ''; previous = ''; this.#challenge = undefined; this.#transport = undefined;
      signal.removeEventListener('abort', abort);
      try { await closeRelay?.(); } finally { await transport.close(); }
    }
  }
}
