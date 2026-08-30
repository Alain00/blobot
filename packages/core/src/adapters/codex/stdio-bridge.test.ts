import { describe, expect, it } from 'vitest';
import { CODEX_BRIDGE, codexBridgeEntryPath } from './stdio-bridge.js';
import { codexPostureEnv } from './permissions.js';

describe('the second pinned bridge', () => {
  it('resolves its own pin on disk, the way the first one does', () => {
    const entry = codexBridgeEntryPath();
    expect(entry).toContain(CODEX_BRIDGE.package);
    expect(entry.endsWith('/dist/index.js')).toBe(true);
  });

  /**
   * The bridge depends on `@openai/codex` at a caret range and runs that copy when `CODEX_PATH`
   * is unset, so the variable is the whole of blobot's answer to *which Codex is running*. A
   * rename upstream would be silent otherwise: the bridge would start, answer, and be the wrong
   * program.
   */
  it('names the variable that points it at the user’s own binary', () => {
    expect(CODEX_BRIDGE.executableEnv).toBe('CODEX_PATH');
    expect(CODEX_BRIDGE.binary).toBe('codex');
  });
});

/**
 * The posture is part of the spawn and not an option a caller can forget: an unset
 * `INITIAL_AGENT_MODE` is the bridge's `agent` mode, which was measured writing to the home
 * directory with no permission request at all.
 */
describe('the posture on the spawn', () => {
  it('is set at every trust level, and cannot be unset by the caller env', () => {
    for (const trust of ['careful', 'normal', 'trusting'] as const) {
      expect(codexPostureEnv(trust)).toEqual({ INITIAL_AGENT_MODE: 'read-only' });
    }
  });
});
