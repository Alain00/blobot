import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
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
