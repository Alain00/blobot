import { loginUrl, type RuntimeLogin } from '../login.js';
import { CURSOR_MACHINE_IMAGE } from './image.js';

export const CURSOR_LOGIN: RuntimeLogin = {
  methods: [{ id: 'browser', label: 'Cursor account' }],
  spec(method) {
    if (method !== 'browser') throw new Error('Choose the Cursor browser sign-in method.');
    return {
      executable: CURSOR_MACHINE_IMAGE.executable, args: ['login'], env: { NO_OPEN_BROWSER: '1' },
      parse(text) {
        if (!text.includes('Open a browser and navigate to this link:')) return;
        const url = loginUrl(text, (url) => url.origin === 'https://cursor.com' && url.pathname === '/loginDeepControl' &&
          url.searchParams.get('mode') === 'login' && url.searchParams.get('redirectTarget') === 'cli' &&
          /^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('challenge') ?? '') &&
          /^[a-f0-9-]{36}$/i.test(url.searchParams.get('uuid') ?? ''));
        return url === undefined ? undefined : { kind: 'browser', url: url.href };
      },
      completed: (text) => text.includes('Authentication tokens stored securely.'),
    };
  },
};
