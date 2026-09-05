import { describe, expect, it } from 'vitest';
import { ClaudeAgentRuntime } from './claude-agent-runtime.js';
import { FakeBridge } from './fake-bridge.js';
import { claudeSandboxFor } from './sandbox.js';

describe('prepared native policy', () => {
  it('does not let the SDK auto-approve sandboxed Bash or silently fall back', () => {
    expect(claudeSandboxFor('local')).toEqual({
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: false,
    });
  });

  it('disables only the optional inner fence in a box', () => {
    expect(claudeSandboxFor('box')).toEqual({ enabled: false });
  });

  it('keeps activation closed until the native startup failure condition is resolved', async () => {
    const bridge = new FakeBridge();
    const runtime = new ClaudeAgentRuntime({ agentId: 'alice', cwd: '/tmp', spawn: () => bridge });
    await runtime.start();
    const session = bridge.received.find((message) => message.method === 'session/new');
    const options = (session?.params as {
      _meta: { claudeCode: { options: { sandbox?: unknown; settingSources: string[] } } };
    })._meta.claudeCode.options;
    expect(options.sandbox).toBeUndefined();
    expect(options.settingSources).toEqual(['user', 'project', 'local']);
    await runtime.stop();
  });
});
