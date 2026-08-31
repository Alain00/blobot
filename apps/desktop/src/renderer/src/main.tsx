import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
/*
 * The three typefaces, **self-hosted**, from `@fontsource`.
 *
 * They were a `<link>` to Google Fonts in `index.html`, which meant a local-first app that
 * rendered in Geist when the machine had a network and in whatever `ui-sans-serif` resolves to
 * when it did not, with no way to tell which you were looking at. Geist is not installed on any
 * of the machines this runs on, so the fallback was always the real second state.
 *
 * Latin only, and only the weights DESIGN.md actually names: 300/400/500/600 sans, 400/500 mono,
 * 500 for the hand. Every subset of every weight is about thirty files nobody looks at.
 */
import '@fontsource/geist-sans/latin-300.css';
import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-sans/latin-600.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import '@fontsource/caveat/latin-500.css';
// Before `styles.css`, and that is load-bearing. The rules that hold the library's idle layer
// at zero carry the same specificity as the ones they override, so order is the only thing
// deciding them, exactly as with the `prefers-reduced-motion` block at the end of our sheet.
import 'blobatar/motion.css';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('no #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
