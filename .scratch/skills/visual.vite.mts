import { fileURLToPath } from 'node:url';
const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
export default {
  root: path('../..'),
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { react: path('../../apps/desktop/node_modules/react'), 'react-dom': path('../../apps/desktop/node_modules/react-dom') } },
  server: { host: '127.0.0.1', port: 35174, strictPort: true },
};
