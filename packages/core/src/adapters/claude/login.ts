import { loginUrl, type RuntimeLogin } from '../login.js';
import { CLAUDE_MACHINE_IMAGE } from './image.js';

export const CLAUDE_LOGIN: RuntimeLogin = {
  methods: [{ id: 'subscription', label: 'Claude subscription' }, { id: 'console', label: 'Claude Console' }],
  spec(method) {
    if (method !== 'subscription' && method !== 'console') throw new Error('Choose a supported Claude sign-in method.');
    return {
      executable: CLAUDE_MACHINE_IMAGE.executable, args: ['auth', 'login', method === 'console' ? '--console' : '--claudeai'],
      // Verified on this Linux CLI pin: retain its manual URL/stdin, open only from the UI.
      env: { BROWSER: '/bin/true' },
      parse(text) {
        const marker = text.indexOf("If the browser didn't open, visit:");
        if (marker < 0) return;
        const url = loginUrl(text.slice(marker), (url) =>
          ((url.hostname === 'claude.com' && url.pathname === '/cai/oauth/authorize') ||
           (url.hostname === 'platform.claude.com' && url.pathname === '/oauth/authorize')) &&
          url.searchParams.get('redirect_uri') === 'https://platform.claude.com/oauth/code/callback' &&
          url.searchParams.get('response_type') === 'code' && (url.searchParams.get('state')?.length ?? 0) >= 16);
        if (url === undefined) return;
        return { kind: 'browser', url: url.href, input: 'Paste the authorization code from your browser.',
          detail: 'This sign-in belongs to this agent’s sandbox.' };
      },
      validateInput(value, challenge) {
        const [code, state, extra] = value.split('#');
        return challenge.kind === 'browser' && !!code && extra === undefined && state === new URL(challenge.url).searchParams.get('state');
      },
      completed: (text) => /(?:^|\n)Login successful\.\n/.test(text) && !/(?:^|\n)Login failed:/.test(text),
    };
  },
};
