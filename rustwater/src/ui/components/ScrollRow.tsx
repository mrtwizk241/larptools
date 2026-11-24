import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './ScrollRow.module.css';

export interface ScrollRowProps {
  /** `ul` for a list of chips (children are `li`), `div` for a group of buttons. */
  as?: 'ul' | 'div';
  /** Accessible name of the row (the list or group label). */
  label: string;
  /** Adds `role="group"`; use with `as="div"` for a set of toggle buttons. */
  group?: boolean;
  /**
   * When the row has no focusable children (plain chips), the row itself joins the tab order
   * while it overflows, so keyboard users can scroll it with the arrow keys.
   */
  focusable?: boolean;
  /** From 900px wide the items wrap onto more rows instead of scrolling. */
  wrapOnDesktop?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * One horizontally scrollable row of chips: no visible scrollbar, scroll snap, and a fade on the
 * right edge while more items are hidden.
 */
export function ScrollRow({
  as: Tag = 'ul',
  label,
  group = false,
  focusable = false,
  wrapOnDesktop = false,
  className,
  children,
}: ScrollRowProps) {
  const ref = useRef<HTMLUListElement & HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ any: false, more: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const any = el.scrollWidth > el.clientWidth + 1;
    const more = any && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setOverflow((old) => (old.any === any && old.more === more ? old : { any, more }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, children]);

  return (
    <div
      className={cx(styles.wrap, overflow.more && styles.more, wrapOnDesktop && styles.desktopWrap)}
    >
      <Tag
        ref={ref}
        className={cx(styles.row, className)}
        aria-label={label}
        role={group ? 'group' : undefined}
        tabIndex={focusable && overflow.any ? 0 : undefined}
        onScroll={measure}
      >
        {children}
      </Tag>
    </div>
  );
}
