import { loginUrl, type RuntimeLogin } from '../login.js';
import { OPENCODE_MACHINE_IMAGE } from './image.js';

export const OPENCODE_LOGIN: RuntimeLogin = {
  methods: [{ id: 'openai', label: 'ChatGPT account', detail: 'Uses device-code sign-in.' },
    { id: 'xai', label: 'Grok account', detail: 'Uses device-code sign-in.' }],
  spec(method) {
    if (method !== 'openai' && method !== 'xai') throw new Error('Choose a supported OpenCode sign-in method.');
    return {
      executable: OPENCODE_MACHINE_IMAGE.executable,
      args: ['auth', 'login', '--provider', method, '--method', method === 'openai' ? 'ChatGPT Pro/Plus (headless)' : 'xAI Grok OAuth (Headless / Remote / VPS)'],
      parse(text) {
        const lines = text.replace(/^[│|●•◇■ox]\s*/gm, '');
        const start = lines.indexOf('Go to: ');
        if (start < 0) return;
        // xAI's response supplies its device URL. Limit this UI navigation to its official auth origins.
        const url = loginUrl(lines.slice(start), (url) => method === 'openai'
          ? url.origin === 'https://auth.openai.com' && url.pathname === '/codex/device'
          : url.origin === 'https://accounts.x.ai' && url.pathname === '/oauth2/device');
        const code = /(?:Enter code: |enter code: )([^\s]+)[ \t]*\n/.exec(lines)?.[1];
        if (url === undefined || code === undefined || code.length > 128) return;
        return { kind: 'browser', url: url.href, code };
      },
      completed: (text) => text.includes('Login successful') && !text.includes('Failed to authorize'),
    };
  },
};
