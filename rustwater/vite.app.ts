/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import type { Plugin, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Content Security Policy (security audit S-04). Keep in step with public/_headers, which also
// sends frame-ancestors (ignored in a meta tag). Build only: the dev server needs an inline
// React refresh script, injected styles, and the HMR WebSocket.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend',
      },
    ],
  };
}

/** Page title and description for the public build (docs/PUBLIC-SITE-PLAN.md). */
export const PUBLIC_TITLE = 'Rustwater Tools (Unofficial)';
export const PUBLIC_DESCRIPTION =
  'Unofficial, player-made Rustwater LARP test builder and Soak and Damage Calculator. No sign-in.';

/**
 * The public build serves `public-site/` (plain icons, scripts/public-icons.py) instead of
 * `public/`, so no Rustwater logo or site art ships. It still sends the same `_headers`, read from
 * `public/_headers` so the security headers have one source.
 */
function publicHtml(): Plugin {
  return {
    name: 'public-html',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: readFileSync(new URL('./public/_headers', import.meta.url), 'utf8'),
      });
    },
    transformIndexHtml: (html) =>
      html
        .replace(
          /<meta name="description"[^>]*>/,
          `<meta name="description" content="${PUBLIC_DESCRIPTION}" />`,
        )
        .replace('<title>Rustwater Character Sheet</title>', `<title>${PUBLIC_TITLE}</title>`),
  };
}

/**
 * The app's Vite config, shared by `vite.config.ts` (the app with accounts, which adds the server
 * API plugin) and `vite.public.config.ts`. `publicBuild` is the no-sign-in public site
 * (`src/publicMode.ts`): no server API, its own output folder, name, and description. This file
 * imports nothing from `server/`, so it can be copied to the public repo
 * (`scripts/export-public.mjs`).
 */
export function appConfig(publicBuild: boolean, apiPlugins: Plugin[] = []): UserConfig {
  return {
    // Relative base so the static build works from any folder or subpath.
    base: './',
    define: { __RW_PUBLIC__: publicBuild ? 'true' : 'false' },
    ...(publicBuild ? { publicDir: 'public-site' } : {}),
    plugins: [
      react(),
      cspMeta(),
      // The public build gets its title and _headers. The app with accounts gets the API under
      // /api (server/), which runs inside `vite` and `vite preview`.
      ...(publicBuild ? [publicHtml()] : apiPlugins),
      VitePWA({
        registerType: 'prompt',
        includeAssets: publicBuild
          ? ['icons/apple-touch-icon-180.png']
          : ['icons/apple-touch-icon-180.png', 'brand/*.webp'],
        manifest: {
          name: publicBuild ? PUBLIC_TITLE : 'Rustwater Character Sheet (Unofficial)',
          short_name: publicBuild ? 'Rustwater Tools' : 'Rustwater Sheet',
          description: publicBuild
            ? PUBLIC_DESCRIPTION
            : 'Unofficial offline character sheet for the Rustwater LARP.',
          display: 'standalone',
          start_url: './',
          scope: './',
          // --color-header-bg: the dark band the app opens with.
          theme_color: '#16120b',
          background_color: '#16120b',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,woff2,json}'],
          // The API is always live: never answer it from the offline cache.
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
    // Chunking (docs/audits/performance.md). Screens other than the roster are lazy routes. The
    // React libraries and the rules (engine, data, Zod) get chunks of their own: the roster needs
    // both, every screen shares them, and they change less often than the screens.
    build: {
      ...(publicBuild ? { outDir: 'dist-public', emptyOutDir: true } : {}),
      // One stylesheet, as before the split: the cascade order stays as written (global.css first)
      // and the start screen waits on a single CSS request instead of two.
      cssCodeSplit: false,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
                priority: 2,
              },
              {
                // zod-config.ts must share this chunk: it sets Zod's jitless mode (CSP, audit
                // S-04) and has to run before the schema modules here are built.
                name: 'rules',
                test: /[\\/](src[\\/](engine[\\/]|data[\\/]|zod-config\.ts)|node_modules[\\/]zod[\\/])/,
                priority: 1,
              },
              {
                // Shared UI code, plus the global styles and fonts so that, in the one stylesheet,
                // global.css still comes before the component styles.
                name: 'shared',
                test: /[\\/](src[\\/](styles[\\/]|ui[\\/](components|lib|data|pwa)[\\/])|node_modules[\\/](lucide-react|@fontsource)[\\/])/,
              },
            ],
          },
        },
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'tests/parity/**/*.test.ts'],
      setupFiles: ['./src/test-setup.ts'],
    },
  };
}
