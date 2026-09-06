import { describe, expect, it } from 'vitest';
import { ClaudeAgentRuntime } from './claude-agent-runtime.js';
import { FakeBridge } from './fake-bridge.js';
import { claudeSandboxFor } from './sandbox.js';
import { claudeModeFor, vouchedTools } from './permissions.js';
import { LocalMachine } from '../../machines/local-machine.js';
import { PersonalDirectories } from '../../personal/personal-directory.js';

describe('native policy independent of approvals', () => {
  it('permits the exact personal folder beside Git metadata without changing approvals on new and resumed sessions', async () => {
    const personal = new PersonalDirectories('/fixture/profiles').forProfile('ana');
    for (const resumeSessionId of [undefined, 'prior-session']) {
      const bridge = new FakeBridge();
      const runtime = new ClaudeAgentRuntime({ agentId: 'ana-blue', cwd: '/fixture/work', spawn: () => bridge,
        machine: new LocalMachine({ agentId: 'ana-blue', workspacePath: '/fixture/work' }, { personalDirectory: personal }),
        gitDirectories: ['/fixture/repo/.git'], ...(resumeSessionId === undefined ? {} : { resumeSessionId }) });
      try {
        await runtime.start();
        const session = bridge.received.find(message => message.method === (resumeSessionId === undefined ? 'session/new' : 'session/load'))!;
        expect(session.params).toMatchObject({ _meta: { claudeCode: { options: { sandbox: {
          enabled: true, autoAllowBashIfSandboxed: false, allowUnsandboxedCommands: false,
          filesystem: { allowWrite: ['/fixture/repo/.git', '/fixture/profiles/ana/files'] },
        } } } } });
      } finally { await runtime.stop(); }
    }
  });
  it('does not let the SDK auto-approve sandboxed Bash or silently fall back', () => {
    expect(claudeSandboxFor('local')).toEqual({
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
      network: { allowLocalBinding: true },
    });
  });

  it('disables only the optional inner fence in a box', () => {
    expect(claudeSandboxFor('box')).toEqual({ enabled: false });
  });

  for (const trust of ['careful', 'normal', 'trusting', 'unattended'] as const) {
    it.each(['new', 'resume', 'forgotten'] as const)(
      `asserts the same native policy on %s while preserving ${trust} approvals and scopes`,
      async (route) => {
        const bridge = new FakeBridge({
          availableModes: [{ id: 'default' }, { id: 'auto' }],
          ...(route === 'forgotten' ? { failLoad: 'session not found' } : {}),
        });
        const runtime = new ClaudeAgentRuntime({
          agentId: 'alice', cwd: '/tmp', trust, spawn: () => bridge,
          gitDirectories: ['/source/one/.git', '/source/two/.git'],
          mcpServers: [{ type: 'http', name: 'blobot', url: 'http://127.0.0.1:1/' }],
          ...(route === 'new' ? {} : { resumeSessionId: 'yesterday' }),
        });
        try {
          await runtime.start();
          const sessions = bridge.received.filter((message) =>
            message.method === 'session/new' || message.method === 'session/load');
          expect(sessions.map((message) => message.method)).toEqual(
            route === 'new' ? ['session/new']
              : route === 'resume' ? ['session/load'] : ['session/load', 'session/new']);
          for (const session of sessions) {
            const options = (session.params as {
              _meta: { claudeCode: { options: {
                sandbox: unknown; settingSources: string[]; allowedTools: string[];
              } } };
            })._meta.claudeCode.options;
            expect(options.sandbox).toEqual(claudeSandboxFor('local', ['/source/one/.git', '/source/two/.git']));
            expect(options.settingSources).toEqual(['user', 'project', 'local']);
            expect(options.allowedTools).toEqual([...vouchedTools(trust), 'mcp__blobot']);
          }
          expect(runtime.permissionMode).toBe(claudeModeFor(trust));
        } finally {
          await runtime.stop();
        }
      },
    );
  }
});
