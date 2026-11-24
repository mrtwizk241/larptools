import './zod-config.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/azeret-mono/latin-400.css';
import '@fontsource/azeret-mono/latin-600.css';
import '@fontsource/azeret-mono/latin-700.css';
import '@fontsource/permanent-marker/latin-400.css';
import './styles/global.css';
import { App } from './ui/App.tsx';
import { applyTheme, readStoredTheme } from './ui/theme.ts';

// Apply the saved theme before the first render so there is no flash.
applyTheme(readStoredTheme());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
