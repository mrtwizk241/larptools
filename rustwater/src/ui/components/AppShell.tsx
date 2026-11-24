import type { ReactNode } from 'react';
import { AppHeader, type HeaderLink } from './AppHeader.tsx';
import { Footer } from './Footer.tsx';
import { cx } from './cx.ts';
import styles from './AppShell.module.css';

export interface AppShellProps {
  children: ReactNode;
  /** Mode badge for the header slot. */
  modeBadge?: ReactNode;
  settingsTo?: string;
  /** A CharacterNav on character screens. */
  nav?: ReactNode;
  /** Main sections in the header. */
  links?: HeaderLink[];
}

/**
 * Skip link, header, main, and footer. With a nav: bottom bar on phones, left rail from 900px.
 * The nav comes after main in the DOM, so Tab reaches the content first (a11y A-08).
 */
export function AppShell({ children, modeBadge, settingsTo, nav, links }: AppShellProps) {
  return (
    <div className={cx(styles.shell, nav ? styles.withNav : null)}>
      {/* Hash routing: "#main" would be read as a route, so the link moves focus itself. */}
      <a
        href="#main"
        className={styles.skip}
        onClick={(event) => {
          event.preventDefault();
          const main = document.getElementById('main');
          main?.focus();
          main?.scrollIntoView?.({ block: 'start' });
        }}
      >
        Skip to content
      </a>
      <AppHeader
        modeBadge={modeBadge}
        {...(settingsTo !== undefined ? { settingsTo } : {})}
        {...(links ? { links } : {})}
        hideLinksOnPhone={Boolean(nav)}
      />
      <div className={styles.body}>
        <main id="main" tabIndex={-1} className={styles.main}>
          {children}
        </main>
        {nav}
      </div>
      <Footer />
    </div>
  );
}
