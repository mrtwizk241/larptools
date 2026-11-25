/// <reference types="vitest/config" />
// Unit tests (`npm test`) run the app as it is in the original repo, with its account
// screens switched on and no server. The site itself is built by vite.public.config.ts.
import { defineConfig } from 'vite';
import { appConfig } from './vite.app.ts';

export default defineConfig({
  ...appConfig(false),
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
