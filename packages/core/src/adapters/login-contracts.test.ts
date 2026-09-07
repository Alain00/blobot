import { describe, expect, it } from 'vitest';
import { CLAUDE_LOGIN } from './claude/login.js';
import { CODEX_LOGIN } from './codex/login.js';
import { CURSOR_LOGIN } from './cursor/login.js';
import { OPENCODE_LOGIN } from './opencode/login.js';
import { FX_LOGIN } from './fx/login.js';
import { loginText } from './login.js';

const state = 'a'.repeat(43);
describe('pinned provider login challenges', () => {
  it('selects Claude’s manual callback and binds the pasted state to its URL', () => {
    const spec = CLAUDE_LOGIN.spec('subscription');
    const url = `https://claude.com/cai/oauth/authorize?response_type=code&state=${state}&redirect_uri=${encodeURIComponent('https://platform.claude.com/oauth/code/callback')}`;
    const text = loginText(`If the browser didn't open, visit: \x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\\nPaste code here if prompted > `);
    const challenge = spec.parse(text);
    expect(challenge).toMatchObject({ kind: 'browser', url, input: expect.any(String) });
    expect(spec.validateInput?.(`one-use#${state}`, challenge!)).toBe(true);
    expect(spec.validateInput?.('one-use#other', challenge!)).toBe(false);
    expect(spec.parse(text.replaceAll(encodeURIComponent('https://platform.claude.com/oauth/code/callback'), encodeURIComponent('http://localhost:1234/callback')))).toBeUndefined();
  });
  it('extracts the complete Codex device challenge, without inventing a code format', () => {
    const spec = CODEX_LOGIN.spec('device');
    const text = '1. Open this link\n   https://auth.openai.com/codex/device\n\n2. Enter this one-time code (expires in 15 minutes)\n\n   opaque_code\n';
    expect(spec.parse(text)).toEqual({ kind: 'browser', url: 'https://auth.openai.com/codex/device', code: 'opaque_code' });
    expect(spec.parse(text.slice(0, -1))).toBeUndefined();
    expect(spec.parse(text.replace('auth.openai.com', 'unrelated.example'))).toBeUndefined();
  });
  it('recognizes selected OpenCode headless methods and refuses Done after authorization failure', () => {
    const spec = OPENCODE_LOGIN.spec('openai');
    expect(spec.parse('│\n●  Go to: https://auth.openai.com/codex/device\n●  Enter code: opaque-code\n'))
      .toMatchObject({ kind: 'browser', code: 'opaque-code' });
    expect(spec.completed?.('■  Failed to authorize\nDone\n')).toBe(false);
    expect(spec.completed?.('◇  Login successful\nDone\n')).toBe(true);
    expect(() => OPENCODE_LOGIN.spec('api-key')).toThrow();
  });
  it('recognizes Cursor’s browser challenge but does not expose account text', () => {
    const spec = CURSOR_LOGIN.spec('browser');
    const url = `https://cursor.com/loginDeepControl?mode=login&redirectTarget=cli&challenge=${state}&uuid=00000000-0000-4000-8000-000000000000`;
    expect(spec.parse(`Open a browser and navigate to this link: ${url}\n`)).toEqual({ kind: 'browser', url });
    expect(spec.parse(`Open a browser and navigate to this link: ${url.replace('cursor.com', 'elsewhere.example')}\n`)).toBeUndefined();
    expect(spec.completed?.('Logged in as fixture@example.com\nAuthentication tokens stored securely.')).toBe(true);
  });
  it('keeps fx provider routes distinct and requires an explicit Vercel team selection', () => {
    const gateway = FX_LOGIN.spec('vercel');
    expect(gateway.parse('Open https://vercel.com/oauth/device\nCode: opaque-code\n\n')).toMatchObject({ kind: 'browser', code: 'opaque-code' });
    expect(gateway.parse('Select a Vercel team for AI Gateway:\nBilling note\n  1. Personal (personal) (default)\n  2. Work (work)\nTeam [1]: '))
      .toEqual({ kind: 'choice', label: 'Choose a Vercel team for AI Gateway.', choices: [
        { value: '1', label: 'Personal (personal) (default)' }, { value: '2', label: 'Work (work)' },
      ] });
    const codex = FX_LOGIN.spec('codex');
    const url = `https://auth.openai.com/oauth/authorize?response_type=code&state=${state}&redirect_uri=${encodeURIComponent('http://localhost:1455/auth/callback')}`;
    expect(codex.parse(`Open this URL to sign in with Codex:\n${url}\n\n`)).toMatchObject({
      kind: 'browser', callback: { port: 1455, path: '/auth/callback', state },
    });
    expect(codex.completed?.('Signed in to Vercel.')).toBe(false);
    expect(() => codex.parse(`Open this URL to sign in with Codex:\n${url.replace('1455', '8888')}\n`)).toThrow('unsupported');
    const grok = FX_LOGIN.spec('grok');
    expect(grok.parse(`Open this URL to sign in with Grok:\nhttps://auth.x.ai/oauth2/authorize?response_type=code&state=${state}\n`))
      .toMatchObject({ kind: 'browser', input: expect.any(String) });
  });
});
