// "Make available offline" on the public site (docs/PUBLIC-SITE-PLAN.md). The service worker
// already saves the whole site on the first visit; this makes that visible, asks the browser to
// keep the saved copy (persistent storage), and offers to install the app where the browser can.
// The app with accounts shows the same facts as a status card instead (offline.ts,
// OfflineStatus.tsx); both read "installed" and "iPhone" from offline.ts's browserEnv().
import { useSyncExternalStore } from 'react';
import { browserEnv } from './offline.ts';

export const OFFLINE_KEY = 'sy.offline';

/** "ready": saved for offline use. "hidden": the visitor closed the bar. */
export type OfflineChoice = 'ready' | 'hidden';

export function readOfflineChoice(): OfflineChoice | null {
  try {
    const value = localStorage.getItem(OFFLINE_KEY);
    return value === 'ready' || value === 'hidden' ? value : null;
  } catch {
    return null;
  }
}

export function saveOfflineChoice(choice: OfflineChoice): void {
  try {
    localStorage.setItem(OFFLINE_KEY, choice);
  } catch {
    // Storage blocked: the bar shows again next visit, which is harmless.
  }
}

export type OfflineResult = 'ready' | 'unsupported' | 'failed';

/** What `makeAvailableOffline` uses from the browser; tests pass their own. */
export interface OfflineDeps {
  serviceWorker?: { ready: Promise<unknown> } | undefined;
  cacheMatch?: ((url: string) => Promise<unknown>) | undefined;
  persist?: (() => Promise<boolean>) | undefined;
  baseUrl: string;
  timeoutMs: number;
}

function browserDeps(): OfflineDeps {
  return {
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    cacheMatch:
      typeof caches === 'undefined'
        ? undefined
        : (url) => caches.match(url, { ignoreSearch: true }),
    persist: navigator.storage?.persist ? () => navigator.storage.persist() : undefined,
    baseUrl: document.baseURI,
    timeoutMs: 30_000,
  };
}

/**
 * Waits until the service worker has saved the site, then asks the browser to keep it. "ready"
 * once the start page is in the offline cache; "unsupported" with no service worker (some private
 * windows); "failed" if saving did not finish in time.
 */
export async function makeAvailableOffline(
  deps: OfflineDeps = browserDeps(),
): Promise<OfflineResult> {
  const { serviceWorker, cacheMatch } = deps;
  if (!serviceWorker || !cacheMatch) return 'unsupported';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), deps.timeoutMs);
  });
  const first = await Promise.race([serviceWorker.ready, timedOut]);
  clearTimeout(timer);
  if (first === 'timeout') return 'failed';
  try {
    await deps.persist?.();
  } catch {
    // Not allowed: the site is still saved, the browser may just clear it when space runs low.
  }
  const page = await cacheMatch(new URL('index.html', deps.baseUrl).href);
  return page ? 'ready' : 'failed';
}

// ---------- Install prompt (Chrome, Edge, Android) ----------

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/**
 * Keeps the browser's install offer so a button can show it later. Call once at startup: the
 * event can fire before any screen renders.
 */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    notify();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const canInstallNow = () => installEvent !== null;

/** Whether the browser offers to install the app, and the action that shows its offer. */
export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const canInstall = useSyncExternalStore(subscribe, canInstallNow, canInstallNow);
  return {
    canInstall,
    async install() {
      const event = installEvent;
      if (!event) return;
      await event.prompt();
      await event.userChoice;
      installEvent = null;
      notify();
    },
  };
}

/** True when the site is already running as an installed app. */
export function isInstalled(): boolean {
  return browserEnv().installed();
}

/** iPhone and iPad Safari have no install offer: Share, then Add to Home Screen. */
export function isAppleMobile(): boolean {
  return browserEnv().apple;
}
