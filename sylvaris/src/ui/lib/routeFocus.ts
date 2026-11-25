import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router';

export const APP_NAME = 'Sylvaris';
export const DEFAULT_TITLE = 'Sylvaris Character Sheet';

/** `document.title` for a screen: "Skills · Ash Merrow · Sylvaris" (a11y A-06). */
export function pageTitle(...parts: (string | null | undefined)[]): string {
  const named = parts.map((part) => part?.trim()).filter((part): part is string => !!part);
  return named.length > 0 ? [...named, APP_NAME].join(' · ') : DEFAULT_TITLE;
}

const CHARACTER = /^\/c\/([^/]+)/;

/**
 * Where focus goes after a route change (a11y A-07). Between screens of the same character the
 * header stays, so focus goes to the sub-screen heading; anywhere else to the page's h1.
 */
export function routeFocusKind(previous: string, next: string): 'subscreen' | 'page' {
  const a = CHARACTER.exec(previous)?.[1];
  const b = CHARACTER.exec(next)?.[1];
  return a !== undefined && a === b ? 'subscreen' : 'page';
}

/** The heading to focus inside `main`, or null while the screen is still loading. */
export function findRouteHeading(root: ParentNode, kind: 'subscreen' | 'page'): HTMLElement | null {
  const main = root.querySelector('main');
  if (!main || /Loading…/.test(main.textContent)) return null;
  if (kind === 'subscreen') {
    for (const section of Array.from(main.querySelectorAll('section[aria-labelledby]'))) {
      const id = section.getAttribute('aria-labelledby') ?? '';
      const heading = id ? section.querySelector<HTMLElement>(`h2[id="${CSS.escape(id)}"]`) : null;
      if (heading) return heading;
    }
  }
  return main.querySelector<HTMLElement>('h1');
}

const WAIT_MS = 5000;

/**
 * Moves focus to the new screen's heading after a route change, not on the first load. It waits
 * for lazily loaded screens and stays out of the way if the screen moved focus itself.
 */
export function useRouteFocus(): void {
  const { pathname } = useLocation();
  const shown = useRef(pathname);
  const pending = useRef<{
    kind: 'subscreen' | 'page';
    origin: Element | null;
    started: number;
  } | null>(null);
  // Runs before the screens' own effects: the element still focused from the old screen (or body
  // if it was removed). Anything else focused later was put there on purpose.
  useLayoutEffect(() => {
    if (shown.current === pathname) return;
    pending.current = {
      kind: routeFocusKind(shown.current, pathname),
      origin: document.activeElement,
      started: Date.now(),
    };
    shown.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    const attempt = () => {
      const job = pending.current;
      if (!job) return;
      const active = document.activeElement;
      const heading =
        // The screen (or the user) already put focus somewhere on purpose.
        active && active !== job.origin && active !== document.body
          ? undefined
          : findRouteHeading(document, job.kind);
      if (heading === null && Date.now() - job.started < WAIT_MS) {
        frame = requestAnimationFrame(attempt);
        return;
      }
      pending.current = null;
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
}

/** Sets `document.title` while the screen is shown. */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (title !== undefined) document.title = title;
  }, [title]);
}
