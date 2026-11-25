// The public site build (docs/PUBLIC-SITE-PLAN.md): the test builder, the Life and Damage
// Calculator, and the Rules Wiki with no sign-in and no server. Test builds stay in the visitor's
// browser. Build: `npm run build:public`, output in dist-public/. `src/publicMode.ts` switches the
// app. Shared settings live in vite.app.ts.
import { defineConfig } from 'vite';
import { appConfig } from './vite.app.ts';

export default defineConfig({
  ...appConfig(true),
  server: { port: 5293, strictPort: true },
  preview: { port: 4293, strictPort: true },
});
