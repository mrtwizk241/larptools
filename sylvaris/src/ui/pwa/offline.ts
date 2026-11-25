// Use with no signal. Event sites often have no phone signal, so players need to see, before
// they leave home, that the app (the rules wiki above all) is saved on their device. The service
// worker precaches every screen and the rules data on the first visit; this module reports
// whether that copy is in place, whether the device is online, and whether the browser promised
// to keep the copy (persistent storage).
import { useCallback, useEffect, useState } from 'react';

/** `off`: no service worker in this build (dev, tests). */
export type SaveState = 'off' | 'unsupported' | 'saving' | 'ready';

export interface OfflineStatus {
  save: SaveState;
  online: boolean;
  /** Whether the browser promised to keep the saved copy; null when unknown. */
  kept: boolean | null;
  /** Running as an installed app (Home Screen) rather than in a browser tab. */
  installed: boolean;
  /** iPhone or iPad, where the Home Screen tip differs. */
  apple: boolean;
}

/** What the hook needs from the browser. Tests pass a fake. */
export interface OfflineEnv {
  /** A production build registers the service worker. */
  enabled: boolean;
  /** Service workers need https or localhost. */
  secure: boolean;
  /** Resolves once a service worker is active, which means its precache is complete. */
  workerReady: (() => Promise<unknown>) | null;
  persisted: (() => Promise<boolean>) | null;
  persist: (() => Promise<boolean>) | null;
  online: () => boolean;
  installed: () => boolean;
  apple: boolean;
  /** Calls `onChange` when the device goes online or offline; returns the unsubscribe. */
  watchOnline: (onChange: () => void) => () => void;
}

let cachedEnv: OfflineEnv | undefined;

/** The real browser, read once. */
export function browserEnv(): OfflineEnv {
  if (cachedEnv) return cachedEnv;
  const hasWindow = typeof window !== 'undefined' && typeof navigator !== 'undefined';
  const sw = hasWindow && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
  const storage = hasWindow ? navigator.storage : undefined;
  cachedEnv = {
    enabled: import.meta.env.PROD,
    secure: hasWindow && window.isSecureContext,
    workerReady: sw ? () => sw.ready : null,
    persisted: storage?.persisted ? () => storage.persisted() : null,
    persist: storage?.persist ? () => storage.persist() : null,
    online: () => (hasWindow ? navigator.onLine : true),
    installed: () =>
      hasWindow &&
      ((typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches) ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true),
    apple:
      hasWindow &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)),
    watchOnline: (onChange) => {
      if (!hasWindow) return () => undefined;
      window.addEventListener('online', onChange);
      window.addEventListener('offline', onChange);
      return () => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
      };
    },
  };
  return cachedEnv;
}

function initialSave(env: OfflineEnv): SaveState {
  if (!env.enabled) return 'off';
  if (!env.secure || !env.workerReady) return 'unsupported';
  return 'saving';
}

/** The device's offline status, plus `keep` to ask the browser to keep the saved copy. */
export function useOfflineStatus(env: OfflineEnv = browserEnv()): {
  status: OfflineStatus;
  keep: () => Promise<void>;
} {
  const [save, setSave] = useState<SaveState>(() => initialSave(env));
  const [online, setOnline] = useState(() => env.online());
  const [kept, setKept] = useState<boolean | null>(null);

  useEffect(() => {
    if (save !== 'saving' || !env.workerReady) return;
    let cancelled = false;
    void env
      .workerReady()
      .then(() => {
        if (!cancelled) setSave('ready');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [env, save]);

  useEffect(() => {
    if (save !== 'ready' || !env.persisted) return;
    let cancelled = false;
    // Asking whether storage is kept never shows a prompt; asking to keep it can (Firefox), so
    // that waits for the button.
    void env
      .persisted()
      .then((isKept) => {
        if (!cancelled) setKept(isKept);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [env, save]);

  useEffect(() => env.watchOnline(() => setOnline(env.online())), [env]);

  const keep = useCallback(async () => {
    if (!env.persist) return;
    const granted = await env.persist().catch(() => false);
    setKept(granted);
  }, [env]);

  return {
    status: { save, online, kept, installed: env.installed(), apple: env.apple },
    keep,
  };
}

export interface OfflineText {
  title: string;
  lines: string[];
  /** Show the "Keep the saved copy" button. */
  canKeep: boolean;
  tip: string | null;
}

/** Plain-English wording for a status; null when there is nothing to say (no service worker). */
export function describeOffline(status: OfflineStatus): OfflineText | null {
  if (status.save === 'off') return null;
  if (status.save === 'unsupported') {
    return {
      title: 'Not saved for use with no signal',
      lines: [
        'This browser cannot save the app on this device. Open it from its https address in Safari or Chrome.',
      ],
      canKeep: false,
      tip: null,
    };
  }
  if (status.save === 'saving') {
    return {
      title: status.online ? 'Saving for use with no signal' : 'Not saved yet',
      lines: [
        status.online
          ? 'Saving the rules wiki and the app on this device. Keep this page open for a moment.'
          : 'This device has no saved copy yet. Open the app once with signal before the event.',
      ],
      canKeep: false,
      tip: null,
    };
  }
  const lines = status.online
    ? [
        'The rules wiki and the character sheets you have opened are saved on this device, so they work with no signal.',
        'Open the app with signal before each event to get the latest rules and sheets.',
      ]
    : [
        'You are reading the copy saved on this device. The rules wiki works fully; character sheets show what this device saved last.',
      ];
  if (status.kept === true) lines.push('The browser will keep the saved copy.');
  if (status.kept === false)
    lines.push('The browser may clear the saved copy if the device runs low on space.');
  let tip: string | null = null;
  if (!status.installed) {
    tip = status.apple
      ? 'Tip: add it to your Home Screen (Share, then Add to Home Screen). Safari can clear the saved copy of a site you have not opened for a week; an app on the Home Screen keeps it.'
      : 'Tip: install it (browser menu, then Install app or Add to Home screen) so the saved copy stays and opens like an app.';
  }
  return {
    title: status.online ? 'Ready with no signal' : 'No signal: reading the saved copy',
    lines,
    canKeep: status.kept === false,
    tip,
  };
}
