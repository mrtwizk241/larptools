import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useInRouterContext, useLocation } from 'react-router';
import { X } from 'lucide-react';
import { Button } from './Button.tsx';
import { IconButton } from './IconButton.tsx';
import {
  addToast,
  hashPath,
  TOAST_DURATION_MS,
  ToastContext,
  toastsForRoute,
  type ToastApi,
  type ToastEntry,
} from './toast-context.ts';
import styles from './Toast.module.css';

/** The route a toast belongs to. The app uses hash routing, and navigate() updates it at once. */
function currentPath(): string {
  return hashPath(window.location.hash);
}

/**
 * Toast rules (docs/design/style-guide.md, a11y A-03):
 * - plain toasts hide after 5 s; toasts with Undo stay until Undo, Dismiss, or replacement;
 * - at most 2 show at once, a new one replaces the oldest;
 * - leaving a route clears the toasts shown on it (a plain toast shown just before the change
 *   goes along: it reports the action that navigated);
 * - they sit above the bottom nav, and keyboard focus is kept clear of them.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);
  const region = useRef<HTMLDivElement>(null);
  const inRouter = useInRouterContext();

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const routeChanged = useCallback(() => {
    const path = currentPath();
    const now = Date.now();
    setToasts((list) => toastsForRoute(list, path, now));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show: (message, options = {}) => {
        const entry: ToastEntry = {
          id: nextId.current++,
          message,
          path: currentPath(),
          shownAt: Date.now(),
          ...options,
        };
        setToasts((list) => addToast(list, entry));
      },
    }),
    [],
  );

  useToastSpace(region, toasts.length);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {inRouter ? <RouteWatcher onChange={routeChanged} /> : null}
      {/* The live region is always in the DOM so new messages are announced. */}
      <div ref={region} role="status" aria-live="polite" className={styles.region}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Calls `onChange` when the route's pathname changes (not on the first render). */
function RouteWatcher({ onChange }: { onChange: () => void }) {
  const { pathname } = useLocation();
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    onChange();
  }, [pathname, onChange]);
  return null;
}

/**
 * Publishes the space the toasts take at the bottom of the viewport as `--toast-stack` (used for
 * `scroll-padding-bottom` and page padding in global.css), and scrolls the focused element up if
 * a new toast would cover it. Focus itself never moves.
 */
function useToastSpace(region: RefObject<HTMLDivElement | null>, count: number): void {
  const space = useRef(0);
  useLayoutEffect(() => {
    const el = region.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = count > 0 && rect.height > 0 ? Math.ceil(window.innerHeight - rect.top) + 8 : 0;
      const grew = next > space.current;
      space.current = next;
      root.style.setProperty('--toast-stack', `${next}px`);
      if (!grew) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body || el.contains(active))
        return;
      if (active.getBoundingClientRect().bottom > window.innerHeight - next)
        active.scrollIntoView?.({ block: 'nearest' });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [region, count]);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('--toast-stack');
    },
    [],
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const sticky = toast.onUndo !== undefined;

  // Plain toasts hide after 5 s; pointer or keyboard focus on the toast pauses the timer.
  // Toasts with Undo never time out, so keyboard users can reach Undo (a11y A-03).
  useEffect(() => {
    if (paused || sticky) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [paused, sticky, toast.id, onDismiss]);

  return (
    <div
      className={styles.toast}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className={styles.message}>{toast.message}</p>
      {toast.onUndo ? (
        <>
          <Button
            variant="ghost"
            className={styles.undo}
            onClick={() => {
              toast.onUndo?.();
              onDismiss(toast.id);
            }}
          >
            {toast.undoLabel ?? 'Undo'}
          </Button>
          <IconButton aria-label="Dismiss" icon={<X />} onClick={() => onDismiss(toast.id)} />
        </>
      ) : null}
    </div>
  );
}
