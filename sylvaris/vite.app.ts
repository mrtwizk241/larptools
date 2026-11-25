import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build as viteBuild, type Plugin, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The app's Vite config, shared by `vite.config.ts` (the app with accounts, which adds the server
// API plugin) and `vite.public.config.ts` (the public site, docs/PUBLIC-SITE-PLAN.md). This file
// imports nothing from `server/`, so it can be copied to the public repo
// (scripts/export-public.mjs).

/**
 * Content Security Policy as a meta tag (security audit S-04). The same text as server/
 * securityHeaders.ts (a test keeps them equal), which `vite preview` also sends as a header with
 * frame-ancestors (ignored in a meta tag); public/_headers repeats it for a static host. Build
 * only: the dev server needs an inline React refresh script, injected styles, and the HMR
 * WebSocket.
 */
export const CSP = [
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

// The test-build planner for the downloaded wiki file: one self-contained script (the rules
// engine, the rules data, and React) emitted as planner/planner.js. "Download wiki" fetches it
// (the service worker precaches it) and puts it inside the HTML file. Build only.
function plannerBundle(): Plugin {
  return {
    name: 'planner-bundle',
    apply: 'build',
    async generateBundle() {
      const result = await viteBuild({
        configFile: false,
        logLevel: 'warn',
        publicDir: false,
        plugins: [react()],
        define: { 'process.env.NODE_ENV': JSON.stringify('production') },
        build: {
          write: false,
          minify: true,
          lib: {
            entry: fileURLToPath(new URL('./src/planner/main.tsx', import.meta.url)),
            formats: ['iife'],
            name: 'SylvarisTestBuild',
            fileName: () => 'planner.js',
          },
        },
      });
      const outputs = Array.isArray(result) ? result : [result];
      for (const out of outputs) {
        if (!('output' in out)) continue;
        for (const item of out.output) {
          if (item.type !== 'chunk') continue;
          this.emitFile({ type: 'asset', fileName: 'planner/planner.js', source: item.code });
          return;
        }
      }
      throw new Error('planner-bundle: the planner build produced no script');
    },
  };
}

/** Page title and description for the public build (docs/PUBLIC-SITE-PLAN.md). */
export const PUBLIC_TITLE = 'Sylvaris Tools (Unofficial)';
export const PUBLIC_DESCRIPTION =
  'Unofficial, player-made Sylvaris LARP test builder, Life and Damage Calculator, and Rules Wiki. No sign-in.';

/**
 * The public build serves `public-site/` (plain icons, scripts/public-icons.py) instead of
 * `public/`, so no Sylvaris logo or site art ships. It still sends the same `_headers`, read from
 * `public/_headers` so the security headers have one source.
 */
function publicHtml(): Plugin {
  return {
    name: 'public-html',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: readFileSync(new URL('./public/_headers', import.meta.url), 'utf8'),
      });
    },
    transformIndexHtml: (html) =>
      html
        // No header art on the public site, so nothing to preload.
        .replace(/<!-- The header art[^>]*-->\s*/g, '')
        .replace(/<link\s+rel="preload"[\s\S]*?\/>\s*/g, '')
        .replace(
          /<meta name="description"[^>]*>/,
          `<meta name="description" content="${PUBLIC_DESCRIPTION}" />`,
        )
        .replace('<title>Sylvaris Character Sheet</title>', `<title>${PUBLIC_TITLE}</title>`),
  };
}

/**
 * `publicBuild` is the no-sign-in public site (`src/publicMode.ts`, on top of the no-login app in
 * `src/localMode.ts`): no server API, its own output folder, name, icons, and description.
 * `apiPlugins` are added to the app with accounts only.
 */
export function appConfig(publicBuild: boolean, apiPlugins: Plugin[] = []): UserConfig {
  return {
    // Relative base so the static build works from any folder or subpath.
    base: './',
    define: {
      __SY_LOCAL__: publicBuild ? 'true' : 'false',
      __SY_PUBLIC__: publicBuild ? 'true' : 'false',
    },
    ...(publicBuild ? { publicDir: 'public-site' } : {}),
    plugins: [
      react(),
      cspMeta(),
      plannerBundle(),
      // The public build gets its title, icons, and _headers. The app with accounts gets the API
      // under /api (server/), which runs inside `vite` and `vite preview`.
      ...(publicBuild ? [publicHtml()] : apiPlugins),
      VitePWA({
        registerType: 'prompt',
        // The workbox globPatterns below already precache every icon and brand image; listing
        // them here as well put each one in the precache list twice (performance.md).
        includeManifestIcons: false,
        manifest: {
          name: publicBuild ? PUBLIC_TITLE : 'Sylvaris Character Sheet (Unofficial)',
          short_name: publicBuild ? 'Sylvaris Tools' : 'Sylvaris Sheet',
          description: publicBuild
            ? PUBLIC_DESCRIPTION
            : 'Unofficial offline character sheet for the Sylvaris LARP.',
          display: 'standalone',
          start_url: './',
          scope: './',
          // --color-header-bg: the dark band the app opens with.
          theme_color: '#17161a',
          background_color: '#17161a',
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
    // Chunking (docs/audits/performance.md). Screens other than the start screen are lazy
    // routes. The React libraries and the rules (engine, data, Zod) get chunks of their own: the
    // start screen needs both, every screen shares them, and they change less often than the
    // screens.
    build: {
      ...(publicBuild ? { outDir: 'dist-public', emptyOutDir: true } : {}),
      // One stylesheet, as before the split: the cascade order stays as written (global.css
      // first) and the start screen waits on a single CSS request instead of two.
      cssCodeSplit: false,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'react',
                // React's server renderer is left out: only "Download wiki" uses it, so it stays
                // in that lazy chunk instead of every visitor's first load.
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/](?!.*server)/,
                priority: 2,
              },
              {
                // The season's rules data (JSON only, no code): about 316 kB raw, 59 kB gzip. Its
                // own chunk keeps every chunk under the 500 kB warning, downloads in parallel
                // with the engine, and stays cached when only the code changes (performance.md).
                name: 'rules-data',
                test: /[\\/]src[\\/]data[\\/]rulesets[\\/].*\.json$/,
                priority: 3,
              },
              {
                // zod-config.ts must share this chunk: it sets Zod's jitless mode (CSP, audit
                // S-04) and has to run before the schema modules here are built.
                name: 'rules',
                test: /[\\/](src[\\/](engine[\\/]|data[\\/]|zod-config\.ts)|node_modules[\\/]zod[\\/])/,
                priority: 1,
              },
              {
                // Shared UI code, plus the global styles and fonts so that, in the one
                // stylesheet, global.css still comes before the component styles.
                name: 'shared',
                test: /[\\/](src[\\/](styles[\\/]|ui[\\/](components|lib|data|pwa)[\\/])|node_modules[\\/](lucide-react|@fontsource)[\\/])/,
              },
            ],
          },
        },
      },
    },
  };
}
