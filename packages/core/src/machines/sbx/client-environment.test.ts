import { describe, expect, it } from 'vitest';
import { sbxClientEnvironment } from './client-environment.js';

describe('sbx client environment', () => {
  it('retains only engine discovery paths and locale, never host credentials or SSH', () => {
    expect(sbxClientEnvironment({
      HOME: '/operator', PATH: '/bin', LANG: 'es_ES.UTF-8', SSH_AUTH_SOCK: '/private/agent.sock',
      BLOBOT_OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', HTTPS_PROXY: 'private',
      NODE_OPTIONS: '--inspect', SBX_NO_TELEMETRY: '0',
    })).toEqual({ HOME: '/operator', PATH: '/bin', LANG: 'es_ES.UTF-8', SBX_NO_TELEMETRY: '1' });
  });

  it('opts out even when no environment is inherited', () => {
    expect(sbxClientEnvironment({})).toEqual({ SBX_NO_TELEMETRY: '1' });
  });
});
