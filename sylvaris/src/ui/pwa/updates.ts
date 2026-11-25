// Service worker updates (security audit S-05). The worker is registered in prompt mode: a new
// version waits until the user presses Reload in the update banner, so an open page never keeps
// running old rules without notice.
import { useSyncExternalStore } from 'react';
import type { RegisterSWOptions } from 'virtual:pwa-register';

export type RegisterFn = (options?: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>;

const noUpdate = () => Promise.resolve();

/**
 * The plugin's registerSW, loaded only in production builds: dev and tests have no service worker
 * (and Vitest cannot load the virtual module).
 */
const registerFromPlugin: RegisterFn = (options) => {
  const ready = import.meta.env.PROD
    ? import('virtual:pwa-register')
        .then((module) => module.registerSW(options))
        .catch(() => noUpdate)
    : Promise.resolve(noUpdate);
  return async (reloadPage) => {
    const update = await ready;
    await update(reloadPage);
  };
};

export interface UpdateStore {
  /** Registers the service worker once; later calls do nothing. */
  start: () => void;
  /** True when a new version is installed and waiting. */
  getSnapshot: () => boolean;
  subscribe: (listener: () => void) => () => void;
  /** Activates the waiting version; the page reloads when it takes control. */
  reload: () => Promise<void>;
}

/** An update store over `register` (the plugin's registerSW, or a mock in tests). */
export function createUpdateStore(register: RegisterFn): UpdateStore {
  let needRefresh = false;
  let update: ((reloadPage?: boolean) => Promise<void>) | null = null;
  const listeners = new Set<() => void>();

  return {
    start() {
      if (update) return;
      update = register({
        onNeedRefresh() {
          needRefresh = true;
          for (const listener of listeners) listener();
        },
      });
    },
    getSnapshot: () => needRefresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async reload() {
      await update?.(true);
    },
  };
}

/** The app's store. In dev and tests nothing is registered. */
export const appUpdates: UpdateStore = createUpdateStore(registerFromPlugin);

/** Whether a new version is waiting, and the action that loads it. */
export function useUpdatePrompt(store: UpdateStore = appUpdates): {
  needRefresh: boolean;
  reload: () => Promise<void>;
} {
  const needRefresh = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { needRefresh, reload: store.reload };
}
