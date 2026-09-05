/**
 * Ticket 01's live half: does a picture from an MCP tool reach an ACP client, and in what shape?
 *
 * This talks to a runtime **directly**, with none of blobot's adapter code in the path, and dumps
 * every inbound JSON-RPC message verbatim to a `.jsonl`. That is the point: blobot's own
 * `session-updates.ts` deletes images before they become events, so measuring through the adapter
 * would measure the defect rather than the wire.
 *
 * Run:
 *   pnpm exec tsx .scratch/agent-media/research/probe/probe.ts --runtime=claude
 *   ... --runtime=codex|opencode|fx|cursor  --annotate  --uri-only
 *
 * It costs one turn on a real account. Transcripts land beside this file.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { childTransport } from '../../../../packages/core/src/adapters/acp/child-transport.js';
import { JsonRpcConnection, type LineTransport } from '../../../../packages/core/src/adapters/acp/jsonrpc.js';
import { bridgeEntryPath, resolveClaudeExecutable } from '../../../../packages/core/src/adapters/claude/stdio-bridge.js';
import { codexBridgeEntryPath, resolveCodexExecutable } from '../../../../packages/core/src/adapters/codex/stdio-bridge.js';
import { resolveOpencodeExecutable } from '../../../../packages/core/src/adapters/opencode/stdio.js';
import { resolveFxExecutable } from '../../../../packages/core/src/adapters/fx/stdio.js';
import { resolveCursorExecutable } from '../../../../packages/core/src/adapters/cursor/stdio.js';
import { PictureServer, PROBE_PNG_BASE64 } from './picture-server.js';

const HERE = dirname(fileURLToPath(import.meta.url));

type RuntimeId = 'claude' | 'codex' | 'opencode' | 'fx' | 'cursor';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const has = (name: string): boolean => argv.includes(`--${name}`);

const runtime = (flag('runtime') ?? 'claude') as RuntimeId;
const annotate = has('annotate');
const uriOnly = has('uri-only');

/**
 * A real repository, because three of the five refuse or behave differently outside one, and
 * because an AgentWorkspace is a git worktree everywhere it can be.
 */
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blobot-picture-probe-'));
  writeFileSync(join(dir, 'README.md'), '# probe\n');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=probe@blobot', '-c', 'user.name=probe', 'commit', '-qm', 'init'], {
    cwd: dir,
  });
  return dir;
}

function spawnRuntime(cwd: string, onStderr: (line: string) => void): LineTransport {
  const nodeEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' } as Record<string, string>;
  switch (runtime) {
    case 'claude':
      return childTransport(
        spawn(process.execPath, [bridgeEntryPath()], {
          cwd,
          env: { ...nodeEnv, CLAUDE_CODE_EXECUTABLE: resolveClaudeExecutable() },
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
        onStderr,
      );
    case 'codex':
      return childTransport(
        spawn(process.execPath, [codexBridgeEntryPath()], {
          cwd,
          // Ticket 03 of `.scratch/codex-runtime/`: without this the bridge's default mode
          // wrote a file into the user's home directory without asking once.
          env: { ...nodeEnv, CODEX_PATH: resolveCodexExecutable(), INITIAL_AGENT_MODE: 'read-only' },
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
        onStderr,
      );
    case 'opencode':
      return childTransport(
        spawn(resolveOpencodeExecutable(), ['acp'], { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] }),
        onStderr,
      );
    case 'fx':
      return childTransport(
        spawn(resolveFxExecutable(), ['acp'], {
          cwd,
          // Ticket 02 of `.scratch/fx-runtime/`: the ACP mode is not the posture, the env var is.
          env: { ...process.env, FX_PERMISSION_MODE: 'ask' },
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
        onStderr,
      );
    case 'cursor':
      return childTransport(
        spawn(resolveCursorExecutable(), ['acp', '--workspace', cwd], {
          cwd,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
        onStderr,
      );
  }
}

async function main(): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(HERE, '..', 'transcripts');
  mkdirSync(outDir, { recursive: true });
  const suffix = `${annotate ? '-annotated' : ''}${uriOnly ? '-urionly' : ''}`;
  const wire = join(outDir, `${runtime}${suffix}-${stamp}.jsonl`);
  const log = join(outDir, `${runtime}${suffix}-${stamp}.log`);

  const note = (line: string): void => {
    process.stdout.write(`${line}\n`);
    appendFileSync(log, `${line}\n`);
  };
  const record = (direction: 'in' | 'out', message: unknown): void => {
    appendFileSync(wire, `${JSON.stringify({ direction, at: Date.now(), message })}\n`);
  };

  const cwd = workspace();
  note(`runtime=${runtime} annotate=${annotate} uriOnly=${uriOnly}`);
  note(`workspace=${cwd}`);

  const token = randomBytes(24).toString('hex');
  const server = new PictureServer({
    token,
    annotate,
    uriOnly,
    onLog: note,
    onCall: (call) => note(`TOOL CALLED: ${call.tool}`),
  });
  await server.start();
  note(`picture server ${server.url}`);

  const transport = spawnRuntime(cwd, (line) => note(`stderr | ${line}`));
  const connection = new JsonRpcConnection(transport);

  connection.setNotificationHandler('session/update', (params) => {
    record('in', { method: 'session/update', params });
    const update = (params as { update?: { sessionUpdate?: string; content?: unknown } })?.update;
    const kind = update?.sessionUpdate ?? '?';
    note(`update ${kind}${describeContent(update?.content)}`);
  });

  // Answer everything the runtime may ask, permissively: the probe is not testing the posture.
  connection.setRequestHandler('session/request_permission', async (params) => {
    record('in', { method: 'session/request_permission', params });
    const options = (params as { options?: { optionId?: string; kind?: string }[] })?.options ?? [];
    const allow =
      options.find((o) => o.kind === 'allow_always') ?? options.find((o) => o.kind === 'allow_once') ?? options[0];
    note(`permission asked, answering ${allow?.optionId ?? 'none'}`);
    return { outcome: { outcome: 'selected', optionId: allow?.optionId } };
  });
  for (const method of ['fs/read_text_file', 'fs/write_text_file']) {
    connection.setRequestHandler(method, async (params) => {
      record('in', { method, params });
      throw new Error(`${method} not offered by the probe`);
    });
  }
  connection.listen();

  const initialize = await connection.request<unknown>('initialize', {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
  });
  record('in', { method: 'initialize:result', params: initialize });
  note(`initialize ok: ${JSON.stringify(initialize).slice(0, 400)}`);

  const session = await connection.request<{ sessionId?: string }>('session/new', {
    cwd,
    mcpServers: [
      {
        type: 'http',
        name: 'picture',
        url: server.url,
        headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
      },
    ],
  });
  record('in', { method: 'session/new:result', params: session });
  note(`session ${session.sessionId ?? '?'}`);

  const text =
    'Call the tool named show_text, then call the tool named show_picture. ' +
    'Both take no arguments. Do not describe, summarise or transcribe what they return, ' +
    'and do not use any other tool. When both have been called, reply with the single word DONE.';
  record('out', { method: 'session/prompt', text });
  const result = await connection.request<unknown>('session/prompt', {
    sessionId: session.sessionId,
    prompt: [{ type: 'text', text }],
  });
  record('in', { method: 'session/prompt:result', params: result });
  note(`prompt result ${JSON.stringify(result)}`);

  await connection.close();
  await server.stop();
  note(`wire  -> ${wire}`);
  note(`notes -> ${log}`);
}

/** A one-line summary of a content payload, so the console is readable without opening the jsonl. */
function describeContent(content: unknown): string {
  if (content === undefined || content === null) return '';
  const blocks = Array.isArray(content) ? content : [content];
  const parts = blocks.map((block) => {
    const b = block as { type?: string; content?: { type?: string; data?: string }; data?: string; text?: string };
    const inner = b.content ?? b;
    const type = inner.type ?? b.type ?? '?';
    if (type === 'image') {
      const data = inner.data ?? '';
      const match = data === PROBE_PNG_BASE64 ? ' EXACT-MATCH' : data === '' ? ' NO-DATA' : ` ${data.length}b64`;
      return `image${match}`;
    }
    if (type === 'text') return `text(${(inner as { text?: string }).text?.slice(0, 40) ?? ''})`;
    return type;
  });
  return ` [${parts.join(', ')}]`;
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
