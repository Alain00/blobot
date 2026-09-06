import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeAgentRuntime } from '../../../../packages/core/src/adapters/claude/claude-agent-runtime.js';
import { spawnClaudeBridge } from '../../../../packages/core/src/adapters/claude/stdio-bridge.js';
import { CodexAgentRuntime } from '../../../../packages/core/src/adapters/codex/codex-agent-runtime.js';
import { spawnCodexBridge } from '../../../../packages/core/src/adapters/codex/stdio-bridge.js';
import { OpencodeAgentRuntime } from '../../../../packages/core/src/adapters/opencode/opencode-agent-runtime.js';
import { spawnOpencode } from '../../../../packages/core/src/adapters/opencode/stdio.js';
import { LocalMachine } from '../../../../packages/core/src/machines/local-machine.js';
import { PersonalDirectories } from '../../../../packages/core/src/personal/personal-directory.js';
import { PersonalSkills } from '../../../../packages/core/src/skills/personal-skills.js';
import type { AgentRuntime } from '../../../../packages/core/src/runtime.js';
import type { MachineTransport } from '../../../../packages/core/src/machines/machine.js';

const kind = process.argv[2];
if (!['claude', 'codex', 'opencode'].includes(kind!)) throw Error('Pass claude, codex, or opencode');
const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-production-skill-')));
const cwd = join(root, 'workspace');
const name = `blobot-production-${randomUUID().slice(0, 8)}`;
const source = join(root, 'source', name);
await mkdir(cwd);
await mkdir(join(source, 'references'), { recursive: true });
const proofs = { fresh: `FRESH-${randomUUID()}`, resumed: `RESUMED-${randomUUID()}` };
await writeFile(join(source, 'SKILL.md'), `---\nname: ${name}\ndescription: Run this offline fixture only when explicitly asked for ${name}.\n---\nFor a FRESH invocation, read references/fresh.txt relative to this skill directory. For a RESUMED invocation, read references/resumed.txt instead. Read the file each time; do not repeat a previous token from memory. Respond with exactly the file contents. Do not modify files, browse, or apply other skills.\n`);
await writeFile(join(source, 'references', 'fresh.txt'), proofs.fresh);
await writeFile(join(source, 'references', 'resumed.txt'), proofs.resumed);
const directories = new PersonalDirectories(join(root, 'profiles'));
const manager = new PersonalSkills(directories);
const personal = directories.forProfile('ana');
const preview = await manager.preview('ana', { kind: 'folder', path: source });
await manager.install('ana', preview.id, [name]);
const installed = await manager.list('ana');
const configPaths = [
  join(homedir(), '.claude', 'settings.json'), join(homedir(), '.claude', '.credentials.json'),
  join(homedir(), '.codex', 'config.toml'), join(homedir(), '.codex', 'auth.json'),
  join(homedir(), '.config', 'opencode', 'opencode.json'), join(homedir(), '.config', 'opencode', 'opencode.jsonc'),
  join(homedir(), '.local', 'share', 'opencode', 'auth.json'),
];
async function hashes() {
  return Object.fromEntries(await Promise.all(configPaths.map(async path => {
    try { return [path, createHash('sha256').update(await readFile(path)).digest('hex')]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [path, 'absent']; throw error; }
  })));
}
const before = await hashes();
const runs: any[] = [];
let previousSession: string | undefined;
for (const phase of ['fresh', 'resumed'] as const) {
  const run: any = { phase, rawCommands: [], requests: [], toolEvents: [], messages: [], errors: [], diagnostics: [] };
  runs.push(run);
  const release = await manager.acquire('ana');
  const machine = new LocalMachine({ agentId: name, workspacePath: cwd }, { personalDirectory: personal });
  await machine.start({ mailboxPort: 34561 });
  // Observes real production bytes; never rewrites outgoing frames or spawn options.
  function observe(transport: MachineTransport): MachineTransport {
    return {
      write(line) {
        try {
          const frame = JSON.parse(line);
          if (['session/new', 'session/load', 'session/resume'].includes(frame.method)) {
            run.requests.push({ method: frame.method, cwd: frame.params.cwd,
              sessionId: frame.params.sessionId, additionalDirectories: frame.params.additionalDirectories });
          }
        } catch {}
        transport.write(line);
      },
      async *lines() {
        for await (const line of transport.lines()) {
          try {
            const frame = JSON.parse(line), update = frame.params?.update;
            if (update?.sessionUpdate === 'available_commands_update') {
              for (const cmd of update.availableCommands ?? []) if (cmd.name.includes(name)) run.rawCommands.push(cmd.name);
            }
            if (update?.sessionUpdate?.startsWith('tool_call')) {
              run.toolEvents.push({ type: update.sessionUpdate, title: update.title, kind: update.kind,
                rawInput: update.rawInput, status: update.status, locations: update.locations });
            }
          } catch {}
          yield line;
        }
      },
      close: () => transport.close(), onClose: listener => transport.onClose(listener),
    };
  }
  const options = { agentId: name, agentName: 'Production skill probe', cwd, machine, trust: 'normal' as const,
    ...(previousSession ? { resumeSessionId: previousSession } : {}),
    persona: 'Follow only the explicitly requested offline skill fixture. Never modify files or use the network. Answer minimally.',
    ...(kind === 'claude' ? { options: { model: 'haiku' } } : {}),
    onStderr: (line: string) => { if (/error|warning|version|invalid|resume/i.test(line)) run.diagnostics.push(line.slice(0, 1200)); },
  };
  let runtime: AgentRuntime;
  if (kind === 'claude') runtime = new ClaudeAgentRuntime({ ...options, spawn: opts => observe(spawnClaudeBridge(opts)) });
  else if (kind === 'codex') runtime = new CodexAgentRuntime({ ...options, spawn: opts => observe(spawnCodexBridge(opts)) });
  else runtime = new OpencodeAgentRuntime({ ...options, spawn: opts => {
    run.productionSkillPaths = JSON.parse(opts.configContent ?? '{}').skills?.paths;
    return observe(spawnOpencode(opts));
  } });
  runtime.setPermissionHandler(async request => { run.requests.push({ permission: request.title }); return null; });
  const timer = setTimeout(() => { run.errors.push('Probe timed out'); void runtime.stop(); }, 120_000);
  try {
    await runtime.start();
    await new Promise(resolve => setTimeout(resolve, 1000));
    run.sessionId = runtime.sessionId;
    run.resumed = 'resumed' in runtime ? runtime.resumed : undefined;
    run.palette = runtime.availableCommands.filter(cmd => cmd.name.includes(name));
    run.sameSession = phase === 'fresh' || runtime.sessionId === previousSession;
    previousSession = runtime.sessionId;
    console.log(JSON.stringify({ phase: `${phase}-started`, kind, name, resumed: run.resumed,
      palette: run.palette, sameSession: run.sameSession }));
    const marker = kind === 'codex' ? `$${name}` : `/${name}`;
    for await (const event of runtime.sendPrompt({ from: 'user', text: `${phase.toUpperCase()} invocation: Use ${marker}. Read the corresponding referenced resource and return its contents.` })) {
      if (event.type === 'agent_message_completed') run.messages.push(event.text);
      if (event.type === 'error') run.errors.push(event.message);
    }
    run.proofReturned = run.messages.join('\n').includes(proofs[phase]);
  } catch (error) { run.errors.push(String(error)); }
  finally {
    clearTimeout(timer);
    await runtime.stop().catch(error => run.errors.push(`stop: ${error}`));
    await machine.stop();
    await release();
  }
  run.rawCommands = [...new Set(run.rawCommands)];
  console.log(JSON.stringify({ phase: `${phase}-finished`, kind, proofReturned: run.proofReturned,
    rawCommands: run.rawCommands, errors: run.errors }));
  if (run.errors.length) break;
}
const after = await hashes();
const result = { kind, root, name, inputKind: 'folder', previewFiles: preview.skills[0]?.files,
  installed, aliasCanonical: await realpath(join(personal.path, '.claude/skills')) === await realpath(join(personal.path, '.agents/skills')),
  runs, globalFilesUnchanged: Object.fromEntries(configPaths.map(path => [path, before[path] === after[path]])),
  catalogueAfter: await manager.list('ana') };
await writeFile(join(import.meta.dirname, `production-${kind}-result.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ phase: 'complete', kind, passed: runs.length === 2 && runs.every(run => run.proofReturned && run.sameSession && run.palette.length > 0 && run.errors.length === 0),
  globalFilesUnchanged: Object.values(result.globalFilesUnchanged).every(Boolean), executionsAfter: result.catalogueAfter.executions }));
