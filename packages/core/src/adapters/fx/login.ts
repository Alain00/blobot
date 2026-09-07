import { loginUrl, type LoginChallenge, type RuntimeLogin } from '../login.js';
import { FX_MACHINE_IMAGE } from './image.js';

function teamChoice(text: string): LoginChallenge | undefined {
  const start = text.lastIndexOf('Select a Vercel team for AI Gateway:');
  if (start < 0 || !/Team \[\d+\]: $/.test(text)) return;
  const choices = [...text.slice(start).matchAll(/^ {2}(\d+)\. ([^\n]{1,200})\n/gm)]
    .map((match) => ({ value: match[1]!, label: match[2]! }));
  if (choices.length < 2 || choices.length > 100 || choices.some((choice, index) => choice.value !== String(index + 1))) {
    throw new Error('The runtime’s team choices could not be read.');
  }
  return { kind: 'choice', label: 'Choose a Vercel team for AI Gateway.', choices };
}
export const FX_LOGIN: RuntimeLogin = {
  methods: [{ id: 'vercel', label: 'Vercel AI Gateway', detail: 'Uses your Vercel account and its billing setup.' },
    { id: 'codex', label: 'ChatGPT subscription' }, { id: 'grok', label: 'Grok subscription' }],
  spec(method) {
    if (!['vercel', 'codex', 'grok'].includes(method)) throw new Error('Choose a supported fx sign-in method.');
    return {
      executable: FX_MACHINE_IMAGE.executable, args: ['login', method], env: { FX_NO_OPEN_BROWSER: '1' },
      parse(text) {
        if (method === 'vercel') {
          const choice = teamChoice(text); if (choice !== undefined) return choice;
          const start = text.indexOf('Open https://'); if (start < 0) return;
          const url = loginUrl(text.slice(start), (url) => url.origin === 'https://vercel.com' && url.pathname === '/oauth/device');
          const code = /\nCode: ([^\s]+)\n/.exec(text)?.[1];
          return url === undefined || code === undefined || code.length > 128 ? undefined : { kind: 'browser', url: url.href, code };
        }
        if (!text.includes(`Open this URL to sign in with ${method === 'codex' ? 'Codex' : 'Grok'}:`)) return;
        const url = loginUrl(text, (url) => method === 'codex'
          ? url.origin === 'https://auth.openai.com' && url.pathname === '/oauth/authorize'
          : url.origin === 'https://auth.x.ai' && url.pathname === '/oauth2/authorize');
        if (url === undefined || url.searchParams.get('response_type') !== 'code' || !url.searchParams.get('state')) return;
        if (method === 'grok') return { kind: 'browser', url: url.href, input: 'Paste the authorization code from xAI.' };
        const target = url.searchParams.get('redirect_uri');
        if (target === null) return;
        let redirect: URL;
        try { redirect = new URL(target); } catch { throw new Error('The runtime returned an unsupported browser callback.'); }
        const port = Number(redirect.port), state = url.searchParams.get('state')!;
        if (redirect.origin !== `http://localhost:${port}` || ![1455, 1457].includes(port) ||
            redirect.pathname !== '/auth/callback' || redirect.search || redirect.hash || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
          throw new Error('The runtime returned an unsupported browser callback.');
        }
        return { kind: 'browser', url: url.href, callback: { port, path: '/auth/callback', state } };
      },
      completed: (text) => text.includes(method === 'vercel' ? 'Signed in to Vercel.' : `Signed in with ${method === 'codex' ? 'Codex' : 'Grok'}.`),
    };
  },
};
