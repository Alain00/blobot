import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { GitWorktreeWorkspaces } from '../../workspace/git-worktrees.js';
import { boxWorkspaceMounts } from '../../workspace/box-mounts.js';
import { agentGitEnvironment } from '../../workspace/git-identity.js';
import { OwnedSbxMachine } from './owned-machine.js';
import { SbxRegistry } from './registry.js';
import { sbxClientEnvironment } from './client-environment.js';
import { verifySbxReference } from './observations.js';

const exec = promisify(execFile);
it.skipIf(process.env['BLOBOT_LIVE_SBX_WORKTREE'] !== '1')('runs the staged lifecycle on a real host worktree and retains its branch and loose files across sleep', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'blobot-worktree-live-')));
  const source = join(root, 'source'), agentId = `workspace-${randomUUID()}`;
  const registry = new SbxRegistry(join(root, 'registry'));
  const run = async (args: string[]) => (await exec('sbx', args, { env: sbxClientEnvironment(), timeout: 90_000 })).stdout;
  const git = async (args: string[]) => (await exec('git', args, { cwd: source,
    env: { PATH: process.env['PATH'], GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...agentGitEnvironment('Fixture') } })).stdout.trim();
  let machine: OwnedSbxMachine | undefined;
  try {
    expect(JSON.parse(await run(['daemon', 'status', '--json'])).status).toBe('running');
    expect(JSON.parse(await run(['template', 'ls', '--json'])).images.some((image: { tag: string }) => image.tag === 'shell-docker')).toBe(true);
    await mkdir(source);
    await git(['init']); await writeFile(join(source, 'README'), 'base\n');
    await git(['add', '.']); await git(['commit', '-m', 'base']);
    await git(['remote', 'add', 'origin', 'https://example.invalid/worktree-fixture.git']);
    const mainHead = await git(['rev-parse', 'HEAD']);
    const config = await readFile(join(source, '.git/config'), 'utf8');
    const provider = new GitWorktreeWorkspaces(join(root, 'worktrees'));
    const request = { workspacePath: source, teamName: 'Fixture', agentId, agentName: 'Alice' };
    const workspace = await provider.provision(request);
    const plan = await boxWorkspaceMounts('git', request, workspace, 'none');
    const sharedSkillsPath = join(root, 'skills');
    await mkdir(join(sharedSkillsPath, 'fixture'), { recursive: true });
    await writeFile(join(sharedSkillsPath, 'fixture/SKILL.md'), '# Synthetic skill');
    const identity = agentGitEnvironment('Alice');
    machine = new OwnedSbxMachine({ agentId, registry,
      kit: { image: 'docker/sandbox-templates:shell-docker', guestNode: '/usr/bin/node', dataBytes: 512 * 1024 ** 2,
        workspace: { ...plan, sharedSkillsPath }, sharedSkillLocations: ['/home/agent/.claude/skills', '/home/agent/.agents/skills', '/home/agent/.cursor/skills', '/home/agent/.config/opencode/skills'] },
      limits: { maxCpus: 2, maxMemoryBytes: 2 * 1024 ** 3 },
      transport: { moduleRoot: '/opt/blobot/node_modules', allowedEnvironment: Object.keys(identity) },
    });
    expect((await machine.start({ mailboxPort: 34571 })).workspacePath).toBe(workspace.path);
    expect(machine.location().volumes?.workspace).toBeNull();
    const active = (await registry.read(agentId))!.active!;
    for (const uid of ['0', '1000']) {
      const readOnly = JSON.parse(await run(['exec', '-u', uid, active.name, '/usr/bin/node', '-e',
        `const fs=require('node:fs');let writable=true;try{fs.writeFileSync('/home/agent/.claude/skills/probe','bad')}catch{writable=false}
        console.log(JSON.stringify({writable,skill:fs.readFileSync('/home/agent/.agents/skills/fixture/SKILL.md','utf8')}))`]));
      expect(readOnly).toEqual({ writable: false, skill: '# Synthetic skill' });
    }
    const script = `const fs=require('node:fs'),cp=require('node:child_process');
      fs.writeFileSync('README','Alice work\\n');cp.execFileSync('git',['add','-A']);cp.execFileSync('git',['commit','-m','Alice work']);
      fs.writeFileSync('loose','not committed');
      console.log(JSON.stringify({uid:process.getuid(),sha:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
        author:cp.execFileSync('git',['log','-1','--format=%an|%ae|%cn|%ce|%G?'],{encoding:'utf8'}).trim(),
        mainVisible:fs.existsSync(${JSON.stringify(join(source, 'README'))})}));`;
    const transport = machine.spawn({ cwd: workspace.path, env: identity,
      command: { kind: 'exec', executable: '/usr/bin/node', args: ['-e', script] } });
    const lines: string[] = [];
    for await (const line of transport.lines()) lines.push(line);
    await transport.close();
    expect(lines).toHaveLength(1);
    const result = JSON.parse(lines[0]!);
    expect(result).toMatchObject({ uid: 1000, mainVisible: false,
      author: 'Alice|alice@agents.blobot.invalid|Alice|alice@agents.blobot.invalid|N' });
    expect(await git(['rev-parse', workspace.branch!])).toBe(result.sha);
    expect(await git(['rev-parse', 'HEAD'])).toBe(mainHead);
    expect(await readFile(join(source, '.git/config'), 'utf8')).toBe(config);
    await machine.stop();
    await machine.start({ mailboxPort: 34572 });
    expect((await registry.read(agentId))?.active?.id).toBe(active.id);
    expect(await readFile(join(workspace.path, 'loose'), 'utf8')).toBe('not committed');
    await machine.beforeWork();
    await expect(machine.reconfigure({ maxCpus: 3, maxMemoryBytes: 3 * 1024 ** 3 })).rejects.toThrow('complete Machine state preservation');
    expect((await registry.read(agentId))?.active?.id).toBe(active.id);
    await machine.stop();
    await machine.destroy();
    expect(await registry.read(agentId)).toBeUndefined();
    expect(await git(['rev-parse', workspace.branch!])).toBe(result.sha);
    expect(await readFile(join(workspace.path, 'loose'), 'utf8')).toBe('not committed');
  } finally {
    await machine?.stop().catch(() => {});
    const record = await registry.read(agentId);
    const references = [record?.active, ...(record?.retained ?? []), ...(record?.pending?.id ? [{ name: record.pending.name, id: record.pending.id }] : [])].filter((ref) => ref !== undefined);
    for (const ref of references) {
      verifySbxReference(JSON.parse(await run(['ls', '--json'])), ref);
      await run(['rm', '-f', ref.name]);
    }
    if (record?.pending?.id === undefined && record?.pending !== undefined) {
      const inventory = JSON.parse(await run(['ls', '--json']));
      expect(inventory.sandboxes.some((box: { name: string }) => box.name === record.pending!.name)).toBe(false);
    }
    await rm(root, { recursive: true, force: true });
  }
}, 150_000);
