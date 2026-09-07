import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { ClaudeAgentRuntime } from '../adapters/claude/claude-agent-runtime.js';
import { CodexAgentRuntime } from '../adapters/codex/codex-agent-runtime.js';
import { OpencodeAgentRuntime } from '../adapters/opencode/opencode-agent-runtime.js';
import { FakeBridge } from '../adapters/claude/fake-bridge.js';
import { FakeCodex } from '../adapters/codex/fake-codex.js';
import { FakeOpencode } from '../adapters/opencode/fake-opencode.js';
import { LocalMachine } from '../machines/local-machine.js';
import { PersonalDirectories } from '../personal/personal-directory.js';
import { PersonalSkills } from './personal-skills.js';
import { inspectSkillLocations } from './inventory.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-native-skills-test-'))); roots.push(root);
  const directories = new PersonalDirectories(join(root, 'profiles')), personal = directories.forProfile('ana'), skills = new PersonalSkills(directories);
  const draft = await skills.createDraft('ana', { name: 'my-process', description: 'Use my process.', instructions: 'Read the evidence.' });
  await skills.publishDraft('ana', draft.id);
  const machine = new LocalMachine({ agentId: 'ana', workspacePath: root }, { personalDirectory: personal });
  return { root, personal, skills, machine };
}

it.each(['claude', 'codex', 'opencode'] as const)('%s connects personal roots on new/load and admits only announced authored skills', async (kind) => {
  const f = await fixture();
  for (const resumeSessionId of [undefined, 'prior-session']) {
    const bridge = kind === 'claude' ? new FakeBridge() : kind === 'codex' ? new FakeCodex() : new FakeOpencode();
    let config = '';
    const options = { agentId: 'ana', agentName: 'Ana', machine: f.machine, cwd: f.root, spawn: () => bridge, ...(resumeSessionId ? { resumeSessionId } : {}) };
    const runtime = kind === 'claude' ? new ClaudeAgentRuntime(options) : kind === 'codex' ? new CodexAgentRuntime(options)
      : new OpencodeAgentRuntime({ ...options, spawn: (request) => { config = request.configContent ?? ''; return bridge; } });
    try {
      await runtime.start();
      const request = bridge.received.find((message) => message.method === (resumeSessionId ? 'session/load' : 'session/new'))!;
      if (kind === 'opencode') expect(JSON.parse(config).skills.paths).toEqual([join(f.personal.path, '.agents/skills')]);
      else expect(request.params).toMatchObject({ additionalDirectories: [f.personal.path] });
      bridge.update({ sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'my-process', description: 'custom' }, { name: 'a-plugin-command', description: 'plugin' }] });
      await new Promise((resolve) => setImmediate(resolve));
      expect(runtime.availableCommands.map((command) => command.name)).toContain('my-process');
      expect(runtime.availableCommands.map((command) => command.name)).not.toContain('a-plugin-command');
      const close = vi.spyOn(bridge, 'close').mockRejectedValueOnce(new Error('not stopped'));
      await expect(runtime.stop()).rejects.toThrow('not stopped');
      await runtime.stop();
      expect(close).toHaveBeenCalledTimes(2);
    } finally { await runtime.stop(); }
  }
});

it('keeps a Claude projection conflict independent of the other runtimes', async () => {
  const f = await fixture();
  await mkdir(join(f.personal.path, '.claude/skills'), { recursive: true });
  await writeFile(join(f.personal.path, '.claude/skills/keep.txt'), 'unmanaged');
  expect((await f.skills.list('ana')).skills).toHaveLength(1);
  const codex = new CodexAgentRuntime({ agentId: 'ana', cwd: f.root, machine: f.machine, spawn: () => new FakeCodex() });
  await codex.start(); await codex.stop();
  const claude = new ClaudeAgentRuntime({ agentId: 'ana', cwd: f.root, machine: f.machine, spawn: () => new FakeBridge() });
  await expect(claude.start()).rejects.toThrow(/already contains/);
});

it('reports cross-scope collisions without asserting a winner and excludes escaping box links', async () => {
  const f = await fixture(), path = await f.skills.skillPath('ana', 'my-process');
  const project = join(f.root, 'project'); await mkdir(project);
  await symlink(path, join(project, 'my-process'));
  const personal = { path: join(f.personal.path, '.agents/skills'), scope: 'personal' as const, boundary: f.personal.path };
  const outside = await inspectSkillLocations([personal, { path: project, scope: 'project', boundary: project }], ['my-process']);
  expect(outside).toHaveLength(1);
  await rm(join(project, 'my-process')); await mkdir(join(project, 'my-process'));
  await writeFile(join(project, 'my-process/SKILL.md'), '---\nname: my-process\ndescription: A project-specific process\n---\n');
  const both = await inspectSkillLocations([personal, { path: project, scope: 'project', boundary: project }], ['my-process']);
  expect(both).toHaveLength(2);
  expect(both.every((skill) => skill.conflict)).toBe(true);
});
