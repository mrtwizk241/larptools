// The public site build (docs/PUBLIC-SITE-PLAN.md): the test builder and the Soak and Damage
// Calculator with no sign-in and no server. Test builds stay in the visitor's browser.
// Build: `npm run build:public`, output in dist-public/. `src/publicMode.ts` switches the app.
import { defineConfig } from 'vite';
import { appConfig } from './vite.app.ts';

export default defineConfig(appConfig(true));
