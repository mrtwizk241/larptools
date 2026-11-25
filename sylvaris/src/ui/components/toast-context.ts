import { createContext, useContext } from 'react';

/** Plain toasts hide after this long. Toasts with Undo stay until dismissed (a11y A-03). */
export const TOAST_DURATION_MS = 5000;

/** At most this many toasts show at once; a new one replaces the oldest. */
export const TOAST_MAX = 2;

/**
 * A plain toast shown this recently before a route change goes along to the new screen: it
 * reports the action that caused the navigation (for example "Checked in ..." on the way back
 * to the event roster).
 */
export const TOAST_ROUTE_GRACE_MS = 2000;

export interface ToastOptions {
  /** Called when the user presses Undo. Only give it when the action is reversible. */
  onUndo?: () => void;
  undoLabel?: string;
}

export interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
}

export interface ToastEntry extends ToastOptions {
  id: number;
  message: string;
  /** The route the toast was shown on. It is cleared when the user leaves that route. */
  path: string;
  /** `Date.now()` when it was shown. */
  shownAt: number;
}

/** Adds a toast, keeping the newest `max`. */
export function addToast(list: ToastEntry[], entry: ToastEntry, max = TOAST_MAX): ToastEntry[] {
  return [...list, entry].slice(-max);
}

/**
 * After a route change: toasts shown for the new screen stay, and so do plain toasts shown in
 * the last moment (they move to the new screen). Everything else, Undo toasts included, goes.
 */
export function toastsForRoute(
  list: ToastEntry[],
  path: string,
  now: number,
  graceMs = TOAST_ROUTE_GRACE_MS,
): ToastEntry[] {
  const next = list.flatMap((toast) => {
    if (toast.path === path) return [toast];
    if (!toast.onUndo && now - toast.shownAt < graceMs) return [{ ...toast, path }];
    return [];
  });
  return next.length === list.length && next.every((toast, i) => toast === list[i]) ? list : next;
}

/** The route path from a hash URL (`#/c/1/play?x` gives `/c/1/play`). */
export function hashPath(hash: string): string {
  const path = hash.replace(/^#/, '').split(/[?#]/)[0] ?? '';
  return path.startsWith('/') ? path : `/${path}`;
}

export const ToastContext = createContext<ToastApi | null>(null);

/** Shows a toast: `useToast().show('Saved.', { onUndo })`. Must be inside ToastProvider. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
