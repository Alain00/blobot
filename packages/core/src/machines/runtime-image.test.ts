import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { CLAUDE_MACHINE_IMAGE } from '../adapters/claude/image.js';
import { CODEX_MACHINE_IMAGE } from '../adapters/codex/image.js';
import { OPENCODE_MACHINE_IMAGE } from '../adapters/opencode/image.js';
import { FX_MACHINE_IMAGE } from '../adapters/fx/image.js';
import { CURSOR_MACHINE_IMAGE } from '../adapters/cursor/image.js';
import { BRIDGE_VERSION } from '../adapters/claude/stdio-bridge.js';
import { CODEX_BRIDGE_VERSION } from '../adapters/codex/stdio-bridge.js';
import { runtimeImageBuild } from './runtime-image.js';

it('keeps image build pins aligned with the adapters that consume them', async () => {
  const root = new URL('../../../../images/machines/', import.meta.url);
  const inputs = JSON.parse(await readFile(new URL('inputs.json', root), 'utf8'));
  for (const [runtime, image] of Object.entries({ claude: CLAUDE_MACHINE_IMAGE, codex: CODEX_MACHINE_IMAGE,
    opencode: OPENCODE_MACHINE_IMAGE, fx: FX_MACHINE_IMAGE, cursor: CURSOR_MACHINE_IMAGE })) {
    expect(image.cliVersion).toBe(inputs.runtimes[runtime].version);
  }
  for (const [runtime, version] of [['claude', BRIDGE_VERSION], ['codex', CODEX_BRIDGE_VERSION]]) {
    const manifest = JSON.parse(await readFile(new URL(`bridges/${runtime}/package.json`, root), 'utf8'));
    expect(manifest.dependencies[`@agentclientprotocol/${runtime === 'claude' ? 'claude-agent-acp' : 'codex-acp'}`]).toBe(version);
  }
});

it('does not invent a download for an unsupported host architecture', () => {
  expect(runtimeImageBuild(CLAUDE_MACHINE_IMAGE, 'riscv64')).toBeUndefined();
});
