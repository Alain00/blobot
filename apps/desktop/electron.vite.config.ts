import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

/**
 * `@blobot/core` is workspace TypeScript source, so it is bundled rather than externalized —
 * Electron cannot import a `.ts` file at runtime. `better-sqlite3` is native and stays
 * external, which is why it is a dependency of this package too.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@blobot/core'] })],
    build: { rollupOptions: { external: ['better-sqlite3'] } },
  },
  preload: { plugins: [externalizeDepsPlugin({ exclude: ['@blobot/core'] })] },
  renderer: { root: 'src/renderer', plugins: [react()] },
});
