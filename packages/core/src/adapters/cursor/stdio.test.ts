import { describe, expect, it } from 'vitest';
import { FORBIDDEN_CURSOR_ARGS, childEnv, cursorArgv } from './stdio.js';

describe('the cursor-agent command line', () => {
  it('is acp --workspace and nothing more', () => {
    expect(cursorArgv('/ws/alice')).toEqual(['acp', '--workspace', '/ws/alice']);
  });

  it('carries none of the flags blobot refuses', () => {
    // `--worktree` is somebody else's AgentWorkspace, `--force` / `--yolo` are ticket 14's
    // ceiling, `--api-key` / `--auth-token` would make blobot carry a credential, and
    // `--plugin-dir` is a vendor surface the palette exists to not offer. The refusal is
    // pinned rather than left as an absence, which is what the constant is for.
    const argv = cursorArgv('/ws/alice');
    for (const flag of FORBIDDEN_CURSOR_ARGS) {
      expect(argv).not.toContain(flag);
    }
  });
});

describe('the child environment', () => {
  const options = { cwd: '/ws/alice', configDir: '/data/cursor-config/alice' };

  it('strips the credential variables the user may have in their shell', () => {
    process.env['CURSOR_API_KEY'] = 'sk-cursor-should-not-travel';
    process.env['CURSOR_AUTH_TOKEN'] = 'tok-should-not-travel';
    try {
      const env = childEnv(options);
      expect(env['CURSOR_API_KEY']).toBeUndefined();
      expect(env['CURSOR_AUTH_TOKEN']).toBeUndefined();
    } finally {
      delete process.env['CURSOR_API_KEY'];
      delete process.env['CURSOR_AUTH_TOKEN'];
    }
  });

  it('points CURSOR_CONFIG_DIR at the per-agent directory, colour off', () => {
    const env = childEnv(options);
    expect(env['CURSOR_CONFIG_DIR']).toBe('/data/cursor-config/alice');
    expect(env['NO_COLOR']).toBe('1');
  });

  it('lets a caller-supplied variable through, but never the credentials', () => {
    const env = childEnv({ ...options, env: { CURSOR_API_KEY: 'even-explicit', EXTRA: 'yes' } });
    expect(env['CURSOR_API_KEY']).toBeUndefined();
    expect(env['EXTRA']).toBe('yes');
  });
});
