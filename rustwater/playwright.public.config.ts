import { defineConfig, devices } from '@playwright/test';

// Browser tests for the public site build (vite.public.config.ts, docs/PUBLIC-SITE-PLAN.md).
// Its own port and build folder: away from 4173 and `dist` (the live copy) and from the main
// e2e run (4183, dist-e2e). There is no server API, so no test databases.
const PORT = Number(process.env['E2E_PUBLIC_PORT'] ?? 4194);
const OUT_DIR = 'dist-e2e-public';
const CI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './tests/e2e-public',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: {
    command: `npx tsc -b && npx vite build -c vite.public.config.ts --outDir ${OUT_DIR} && npx vite preview -c vite.public.config.ts --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
