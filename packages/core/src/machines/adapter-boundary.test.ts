import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MACHINE_CLIENT_CAPABILITIES } from '../adapters/acp/client-capabilities.js';
import { LocalMachine } from './local-machine.js';
import type { Machine, MachineSpawnRequest, MachineTransport } from './machine.js';
import { spawnClaudeBridge } from '../adapters/claude/stdio-bridge.js';
import { spawnCodexBridge } from '../adapters/codex/stdio-bridge.js';
import { spawnOpencode } from '../adapters/opencode/stdio.js';
import { spawnFx } from '../adapters/fx/stdio.js';
import { spawnCursor } from '../adapters/cursor/stdio.js';
import { ClaudeAgentRuntime } from '../adapters/claude/claude-agent-runtime.js';
import { CodexAgentRuntime } from '../adapters/codex/codex-agent-runtime.js';
import { OpencodeAgentRuntime } from '../adapters/opencode/opencode-agent-runtime.js';
import { FxAgentRuntime } from '../adapters/fx/fx-agent-runtime.js';
import { CursorAgentRuntime } from '../adapters/cursor/cursor-agent-runtime.js';
import { FakeCodex } from '../adapters/codex/fake-codex.js';
import { CODEX_MACHINE_IMAGE } from '../adapters/codex/image.js';
import { prepareSbxExec } from './sbx/transport.js';

describe('the Machine boundary across every adapter', () => {
  it('admits the Codex runtime persona through its real sandbox launch contract', async () => {
    const bridge = new FakeCodex();
    const machine: Machine = {
      kind: 'box', mailboxHostname: 'host.docker.internal',
      location: () => { throw new Error('must not inspect'); },
      readiness: async () => ({ state: 'ready' }),
      reconcile: async () => ({ state: 'absent', detail: 'Not created.' }),
      start: async () => { throw new Error('must not start'); },
      spawn(request) {
        const launch = prepareSbxExec({ ...CODEX_MACHINE_IMAGE, sandboxName: 'blobot-codex-test' }, request);
        const body = JSON.parse(launch.header.subarray(4).toString('utf8'));
        expect(JSON.parse(body.env.CODEX_CONFIG).developer_instructions).toContain('You are Alice.');
        return bridge;
      },
      stop: async () => {}, destroy: async () => {}, measure: async () => null,
    };
    const runtime = new CodexAgentRuntime({ agentId: 'alice', cwd: '/workspace', persona: 'You are Alice.', machine });
    try {
      await runtime.start();
      expect(runtime.lifecycle).toBe('ready');
      expect(runtime.sessionId).toBe('session_fake_codex');
    } finally { await runtime.stop(); }
  });

  it('pins every adapter to capabilities that cannot reach the host filesystem or terminal', () => {
    expect(MACHINE_CLIENT_CAPABILITIES).toEqual({
      fs: { readTextFile: false, writeTextFile: false }, terminal: false,
    });
    expect(Object.isFrozen(MACHINE_CLIENT_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(MACHINE_CLIENT_CAPABILITIES.fs)).toBe(true);
    const root = fileURLToPath(new URL('../adapters/', import.meta.url));
    const files = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      .flatMap((entry) => readdirSync(join(root, entry.name))
        .filter((file) => file.endsWith('-agent-runtime.ts'))
        .map((file) => join(root, entry.name, file)));
    expect(files).toHaveLength(5);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source.match(/clientCapabilities:\s*MACHINE_CLIENT_CAPABILITIES/g), file).toHaveLength(1);
      expect(source.match(/clientCapabilities\s*:/g), file).toHaveLength(1);
      expect(source).not.toMatch(/setRequestHandler\(['"](?:fs\/|terminal\/)/);
    }
  });

  it('routes all five launchers through the supplied Machine with an explicit environment layer', () => {
    const machine = new LocalMachine({ agentId: 'alice', workspacePath: '/workspace' });
    const transport: MachineTransport = {
      write() {}, async *lines() {}, async close() {}, onClose: () => () => {},
    };
    const spawn = vi.spyOn(machine, 'spawn').mockReturnValue(transport);
    const shared = { machine, cwd: '/workspace', env: { EXPLICIT: 'yes' } };
    expect(spawnClaudeBridge({ ...shared, claudeExecutable: process.execPath })).toBe(transport);
    expect(spawnCodexBridge({ ...shared, codexExecutable: process.execPath })).toBe(transport);
    expect(spawnOpencode({ ...shared, opencodeExecutable: process.execPath, configContent: '{}' })).toBe(transport);
    expect(spawnFx({ ...shared, fxExecutable: process.execPath, trust: 'normal' })).toBe(transport);
    expect(spawnCursor({ ...shared, cursorExecutable: process.execPath, configDir: '/config' })).toBe(transport);
    expect(spawn).toHaveBeenCalledTimes(5);
    for (const [request] of spawn.mock.calls) {
      expect(request.cwd).toBe('/workspace');
      expect(request.env?.['EXPLICIT']).toBe('yes');
      expect(request.env).not.toHaveProperty('HOME');
      expect(request.env).not.toHaveProperty('PATH');
    }
    expect(spawn.mock.calls[0]?.[0].command).toMatchObject({ kind: 'node-module', version: '0.70.0' });
    expect(spawn.mock.calls[1]?.[0].env).toHaveProperty('INITIAL_AGENT_MODE', 'read-only');
    expect(spawn.mock.calls[2]?.[0].env).toHaveProperty('OPENCODE_CONFIG_CONTENT', '{}');
    expect(spawn.mock.calls[4]?.[0].env).toMatchObject({ CURSOR_API_KEY: undefined, CURSOR_AUTH_TOKEN: undefined });
  });

  it('constructs box runtimes without host configuration or palette preparation', () => {
    const machine: Machine = {
      kind: 'box', mailboxHostname: 'host.docker.internal',
      location: () => { throw new Error('must not prepare'); },
      readiness: async () => { throw new Error('must not prepare'); },
      reconcile: async () => { throw new Error('must not prepare'); },
      start: async () => { throw new Error('must not prepare'); },
      spawn: () => { throw new Error('must not spawn'); },
      stop: async () => {}, destroy: async () => {}, measure: async () => null,
    };
    const options = { agentId: 'alice', agentName: 'Alice', cwd: '/workspace', persona: 'Alice', machine };
    for (const Runtime of [ClaudeAgentRuntime, CodexAgentRuntime, OpencodeAgentRuntime, FxAgentRuntime, CursorAgentRuntime]) {
      expect(() => new Runtime(options)).not.toThrow();
    }
  });

  it('launches box runtimes with guest executables, guest modules and guest Cursor configuration', () => {
    const transport: MachineTransport = { write() {}, async *lines() {}, async close() {}, onClose: () => () => {} };
    const spawn = vi.fn((_request: MachineSpawnRequest) => transport);
    const machine: Machine = {
      kind: 'box', mailboxHostname: 'host.docker.internal',
      location: () => { throw new Error('must not inspect'); },
      readiness: async () => ({ state: 'ready' }), reconcile: async () => ({ state: 'absent', detail: 'Not created.' }),
      start: async () => { throw new Error('must not start'); }, spawn,
      stop: async () => {}, destroy: async () => {}, measure: async () => null,
    };
    const shared = { machine, cwd: '/host/worktree', env: { GIT_AUTHOR_NAME: 'Alice' } };
    spawnClaudeBridge({ ...shared, claudeExecutable: '/absent/host/claude' });
    spawnCodexBridge({ ...shared, codexExecutable: '/absent/host/codex' });
    spawnOpencode({ ...shared, opencodeExecutable: '/absent/host/opencode' });
    spawnFx({ ...shared, fxExecutable: '/absent/host/fx', trust: 'normal' });
    spawnCursor({ ...shared, cursorExecutable: '/absent/host/cursor', configDir: '/absent/host/config' });
    for (const [request] of spawn.mock.calls) {
      expect(request.cwd).toBe('/host/worktree');
      expect(request.command).not.toHaveProperty('localEntryPath');
      expect(request.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
      expect(request.env).not.toHaveProperty('HOME');
      expect(request.env).not.toHaveProperty('PATH');
      expect(JSON.stringify(request)).not.toContain('/absent/host');
    }
  });
});
