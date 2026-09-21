// v1 REFERENCE EXPORT — read-only prior art, not wired into the v2 build (see reference/v1/README.md).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The three faces of the register (Plan 18, PR A — see styles.css's
// --display, --sans and --mono), self-hosted through fontsource so Vite
// bundles the woff2 files and the game never reaches for a font over the
// network. Bricolage and Azeret Mono are variable fonts (one file each
// covers the whole weight range); Archivo is the four static weights the
// text actually uses. Azeret Mono is the figures face — the cash readout
// and its weekly net (see .toolbar-funds-btn): a grotesque's tabular digits
// line up, but a monospace at 800 reads as a COUNTER, which is what a sum
// that ticks every week is.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/azeret-mono';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
