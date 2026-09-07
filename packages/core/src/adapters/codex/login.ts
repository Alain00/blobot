import { loginUrl, type RuntimeLogin } from '../login.js';
import { CODEX_MACHINE_IMAGE } from './image.js';

export const CODEX_LOGIN: RuntimeLogin = {
  methods: [{ id: 'device', label: 'ChatGPT account', detail: 'Enable device-code sign-in in your ChatGPT account or workspace settings.' }],
  spec(method) {
    if (method !== 'device') throw new Error('Choose the ChatGPT device sign-in method.');
    return {
      executable: CODEX_MACHINE_IMAGE.executable, args: ['login', '--device-auth'],
      parse(text) {
        const url = loginUrl(text, (url) => url.origin === 'https://auth.openai.com' && url.pathname === '/codex/device');
        const code = /2\.[^\n]*Enter this one-time code[^\n]*\n(?:\s*\n)* {3}([^\s]+)[ \t]*\n/i.exec(text)?.[1];
        if (url === undefined || code === undefined || code.length > 128) return;
        return { kind: 'browser', url: url.href, code };
      },
      completed: (text) => /(?:^|\n)Successfully logged in\n/.test(text),
    };
  },
};
