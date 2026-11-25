import './zod-config.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { App } from './ui/App.tsx';
import { applyTheme, readStoredTheme } from './ui/theme.ts';
import { PUBLIC_MODE } from './publicMode.ts';
import { captureInstallPrompt } from './ui/pwa/offlineSave.ts';

// Apply the saved theme before the first render so there is no flash.
applyTheme(readStoredTheme());
// The public site offers Install app; the browser's offer can arrive before the first render.
if (PUBLIC_MODE) captureInstallPrompt();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
