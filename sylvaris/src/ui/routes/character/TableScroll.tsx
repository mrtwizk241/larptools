// A wide table that scrolls sideways on its own when the text is large, instead of the page
// (a11y A-10). Shared by the character sub-screens.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './character.module.css';

/** Wrap a `<table className={styles.table}>`. It joins the tab order only while it overflows. */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      // A scrollable region must be reachable by keyboard (axe scrollable-region-focusable).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={overflows ? 0 : undefined}
      className={styles.tableScroll}
    >
      {children}
    </div>
  );
}
