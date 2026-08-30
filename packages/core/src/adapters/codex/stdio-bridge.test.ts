import { describe, expect, it } from 'vitest';
import { CODEX_BRIDGE, codexBridgeEntryPath } from './stdio-bridge.js';

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
