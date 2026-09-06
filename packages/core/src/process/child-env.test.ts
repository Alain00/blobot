import { afterEach, describe, expect, it } from 'vitest';
import { childEnvironment } from './child-env.js';
import { childEnv as cursorEnv } from '../adapters/cursor/stdio.js';

describe('the environment a runtime is spawned with', () => {
  afterEach(() => {
    delete process.env['BLOBOT_OPENAI_API_KEY'];
    delete process.env['BLOBOT_DEEPGRAM_API_KEY'];
  });

  it('never carries a speech provider key, wherever it came from', () => {
    process.env['BLOBOT_OPENAI_API_KEY'] = 'sk-should-not-travel';
    const env = childEnvironment({ BLOBOT_DEEPGRAM_API_KEY: 'dg-should-not-travel', KEEP: 'yes' });
    expect(env['BLOBOT_OPENAI_API_KEY']).toBeUndefined();
    expect(env['BLOBOT_DEEPGRAM_API_KEY']).toBeUndefined();
    expect(env['KEEP']).toBe('yes');
    expect(env['PATH']).toBe(process.env['PATH']);
  });

  it('is what the Cursor adapter builds on, beside its own stripping', () => {
    process.env['BLOBOT_OPENAI_API_KEY'] = 'sk-should-not-travel';
    const env = cursorEnv({ cwd: '/w', configDir: '/c' });
    expect(env['BLOBOT_OPENAI_API_KEY']).toBeUndefined();
    expect(env['CURSOR_CONFIG_DIR']).toBe('/c');
  });
});
