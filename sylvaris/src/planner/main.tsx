// Entry for the test-build planner bundle (built by the `planner-bundle` plugin in vite.config.ts
// into planner/planner.js). "Download wiki" puts this script inside the HTML file, where it fills
// the Test build section and hides the "needs scripts" note.
import '../zod-config.ts';
import { createRoot } from 'react-dom/client';
import { Planner } from './Planner.tsx';
import type { StorageLike } from './buildModel.ts';

function browserStorage(): StorageLike | null {
  try {
    const store = window.localStorage;
    const probe = '__sylvaris_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

const mount = document.getElementById('test-build-app');
if (mount) {
  document.getElementById('test-build-note')?.setAttribute('hidden', '');
  createRoot(mount).render(<Planner storage={browserStorage()} />);
}
