import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import styles from './CharacterNav.module.css';

export interface CharacterNavItem {
  icon: LucideIcon;
  label: string;
  /** Shown instead of `label` in the phone bottom bar (the link keeps the full name). */
  shortLabel?: string;
  route: string;
  /** Match the route exactly (default true). False also marks child routes as current. */
  end?: boolean;
}

export interface CharacterNavProps {
  items: CharacterNavItem[];
  /** Accessible name of the navigation landmark. */
  label?: string;
}

/**
 * Character screen navigation: a bottom bar under 900px, a left rail from 900px. NavLink sets
 * aria-current="page" on the current item. With six or more items (the no-login builds) the bar
 * scrolls sideways when they do not fit, keeping the current one in view (as on Rustwater).
 */
export function CharacterNav({ items, label = 'Character' }: CharacterNavProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    const left = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    list.scrollTo?.({ left: Math.max(0, left) });
  }, [pathname]);
  return (
    <nav
      aria-label={label}
      className={styles.nav}
      data-bottom-nav=""
      data-crowded={items.length > 5 ? '' : undefined}
    >
      <ul ref={listRef} className={styles.list}>
        {items.map(({ icon: Icon, label: itemLabel, shortLabel, route, end = true }) => (
          <li key={route} className={styles.listItem}>
            <NavLink
              to={route}
              end={end}
              className={styles.item ?? ''}
              {...(shortLabel && shortLabel !== itemLabel ? { 'aria-label': itemLabel } : {})}
            >
              <Icon aria-hidden="true" className={styles.icon} />
              {shortLabel && shortLabel !== itemLabel ? (
                <>
                  <span className={`${styles.label} ${styles.short}`}>{shortLabel}</span>
                  <span className={`${styles.label} ${styles.long}`}>{itemLabel}</span>
                </>
              ) : (
                <span className={styles.label}>{itemLabel}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
