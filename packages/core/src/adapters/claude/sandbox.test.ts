import { describe, expect, it } from 'vitest';
import { ClaudeAgentRuntime } from './claude-agent-runtime.js';
import { FakeBridge } from './fake-bridge.js';
import { claudeSandboxFor } from './sandbox.js';
import { claudeModeFor, vouchedTools } from './permissions.js';

describe('native policy independent of approvals', () => {
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
