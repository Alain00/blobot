import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeAgentRuntime } from '../../../../packages/core/src/adapters/claude/claude-agent-runtime.js';
import { spawnClaudeBridge } from '../../../../packages/core/src/adapters/claude/stdio-bridge.js';
import { CodexAgentRuntime } from '../../../../packages/core/src/adapters/codex/codex-agent-runtime.js';
import { spawnCodexBridge } from '../../../../packages/core/src/adapters/codex/stdio-bridge.js';
import { OpencodeAgentRuntime } from '../../../../packages/core/src/adapters/opencode/opencode-agent-runtime.js';
import { spawnOpencode } from '../../../../packages/core/src/adapters/opencode/stdio.js';
import { LocalMachine } from '../../../../packages/core/src/machines/local-machine.js';
import { PersonalDirectories } from '../../../../packages/core/src/personal/personal-directory.js';
import type { AgentRuntime } from '../../../../packages/core/src/runtime.js';
import type { MachineTransport } from '../../../../packages/core/src/machines/machine.js';

const kind = process.argv[2];
if (!['claude', 'codex', 'opencode'].includes(kind!)) throw Error('Pass claude, codex, or opencode');
const invoke = process.argv.includes('--invoke');
const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-native-skill-')));
const cwd = join(root, 'workspace');
await mkdir(cwd);
const personal = new PersonalDirectories(join(root, 'profiles')).forProfile('ana');
await personal.prepare();
const name = `blobot-probe-${randomUUID().slice(0, 8)}`;
const skillDir = join(personal.path, '.agents', 'skills', name);
await mkdir(join(skillDir, 'references'), { recursive: true });
await mkdir(join(personal.path, '.claude'));
await symlink('../.agents/skills', join(personal.path, '.claude', 'skills'));
const proof = `PERSONAL-SKILL-${randomUUID()}`;
await writeFile(join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: Run this offline test only when explicitly asked for ${name}.\n---\nRead references/proof.txt relative to this skill directory. Reply with exactly its contents. Do not write files, browse, or use other skills.\n`);
await writeFile(join(skillDir, 'references', 'proof.txt'), proof);
const rawCommands: string[] = [];
const toolEvents: unknown[] = [];
const errors: string[] = [];
const messages: string[] = [];
const requests: unknown[] = [];
const diagnostics: string[] = [];
const machine = new LocalMachine({ agentId: name, workspacePath: cwd }, { personalDirectory: personal });
await machine.start({ mailboxPort: 34561 });

function wrap(transport: MachineTransport): MachineTransport {
  return {
    write(line) {
      const frame = JSON.parse(line);
      if (['session/new', 'session/load', 'session/resume'].includes(frame.method) && kind !== 'opencode') {
        frame.params.additionalDirectories = [personal.path];
        requests.push({ method: frame.method, additionalDirectories: frame.params.additionalDirectories });
      }
      transport.write(`${JSON.stringify(frame)}\n`);
    },
    async *lines() {
      for await (const line of transport.lines()) {
        try {
          const frame = JSON.parse(line);
          const update = frame.params?.update;
          if (update?.sessionUpdate === 'available_commands_update') {
            for (const command of update.availableCommands ?? []) rawCommands.push(command.name);
          }
          if (update?.sessionUpdate?.startsWith('tool_call')) {
            toolEvents.push({ type: update.sessionUpdate, kind: update.kind, title: update.title,
              rawInput: update.rawInput, status: update.status, locations: update.locations });
          }
        } catch {}
        yield line;
      }
    },
    close: () => transport.close(),
    onClose: (listener) => transport.onClose(listener),
  };
}

const options = {
  agentId: name, agentName: 'Skill probe', cwd, machine, trust: 'normal' as const,
  persona: 'Run only the explicitly requested offline skill fixture. Do not modify files or use the network. Keep your answer minimal.',
  ...(process.env.PROBE_MODEL ? { options: { model: process.env.PROBE_MODEL } } : {}),
  onStderr: (line: string) => { if (/error|warning|version|invalid/i.test(line)) diagnostics.push(line.slice(0, 1000)); },
};
let runtime: AgentRuntime;
if (kind === 'claude') runtime = new ClaudeAgentRuntime({ ...options,
  spawn: (opts) => wrap(spawnClaudeBridge(opts)) });
else if (kind === 'codex') runtime = new CodexAgentRuntime({ ...options,
  spawn: (opts) => wrap(spawnCodexBridge(opts)) });
else runtime = new OpencodeAgentRuntime({ ...options,
  spawn: (opts) => {
    const config = JSON.parse(opts.configContent ?? '{}');
    config.skills = { ...config.skills, paths: [join(personal.path, '.agents', 'skills')] };
    return wrap(spawnOpencode({ ...opts, configContent: JSON.stringify(config) }));
  } });
runtime.setPermissionHandler(async (request) => {
  requests.push({ permission: request.title, options: request.options });
  // Reading this synthetic fixture is the only operation this probe may approve.
  if (/read|skill|external_directory/i.test(request.title) &&
      (request.title.includes(root) || request.title.includes(name))) {
    return request.options.find((option) => option.kind === 'allow_once')?.id ?? null;
  }
  return null;
});

let started = false;
let timeout: ReturnType<typeof setTimeout> | undefined;
try {
  timeout = setTimeout(() => { errors.push('Probe timed out'); void runtime.stop(); }, 120_000);
  await runtime.start();
  started = true;
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log(JSON.stringify({ phase: 'started', kind, root, name, sessionId: runtime.sessionId,
    rawFixtureCommands: [...new Set(rawCommands.filter(c => c.includes(name)))],
    paletteFixtureCommands: runtime.availableCommands.filter(c => c.name.includes(name)),
    rawCommandCount: new Set(rawCommands).size,
    options: runtime.optionGroups,
  }));
  if (invoke) {
    const marker = kind === 'codex' ? `$${name}` : `/${name}`;
    for await (const event of runtime.sendPrompt({ from: 'user', text: `Use ${marker} now. Follow its instructions and reply with the proof from its referenced file.` })) {
      if (event.type === 'agent_message_completed') messages.push(event.text);
      if (event.type === 'error') errors.push(event.message);
    }
  }
} catch (error) {
  errors.push(String(error));
} finally {
  if (timeout) clearTimeout(timeout);
  await runtime.stop().catch(error => errors.push(`stop: ${error}`));
  await machine.stop();
}
const result = {
  kind, root, name, started, invoked: invoke,
  rawFixtureCommands: [...new Set(rawCommands.filter(c => c.includes(name)))],
  rawCommandCount: new Set(rawCommands).size,
  canonicalAlias: await realpath(join(personal.path, '.claude', 'skills')) === await realpath(join(personal.path, '.agents', 'skills')),
  options: runtime.optionGroups,
  proofReturned: messages.join('\n').includes(proof), messages, errors, requests, toolEvents,
  // Do not persist the operator's full catalog or config.
  diagnostics: diagnostics.filter(line => !line.includes('Authorization')).slice(-12),
};
await writeFile(join(import.meta.dirname, `${kind}-result.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ phase: 'finished', kind, started, invoked: invoke,
  fixtureAdvertised: result.rawFixtureCommands.length > 0, proofReturned: result.proofReturned,
  toolCount: toolEvents.length, errors, result: join(import.meta.dirname, `${kind}-result.json`) }));
