import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The three faces of the register (see ui/tokens.css's --display, --sans and
// --mono), self-hosted through fontsource so Vite bundles the woff2 files
// and the game never reaches for a font over the network.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/azeret-mono';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import './ui/tokens.css';
import './ui/chrome.css';
import './ui/startup.css';
import './ui/map.css';
import './ui/debug.css';
import App from './ui/App.tsx';
import { CrashBoundary } from './ui/Crash.tsx';
import { applySettings } from './ui/settings.ts';
import { store } from './ui/store.ts';

// Text size and colour vision, before the first paint.
applySettings();

// For the dev tools that drive the real app (tools/newplayer.mjs): a
// read-only look at the run, so a scripted player can check what it did.
// Never in a production build.
if (import.meta.env.DEV) {
  Object.assign(globalThis, { __unischool: { snapshot: () => store.getSnapshot() } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashBoundary>
      <App />
    </CrashBoundary>
  </StrictMode>,
);
