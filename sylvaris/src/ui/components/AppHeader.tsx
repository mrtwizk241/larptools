import type { ReactNode } from 'react';
import { BRAND } from '../brandAssets.ts';
import { LOCAL_MODE } from '../../localMode.ts';
import { PUBLIC_MODE } from '../../publicMode.ts';
import { Link, NavLink } from 'react-router';
import { House, Settings } from 'lucide-react';
import { cx } from './cx.ts';
import styles from './AppHeader.module.css';

export interface HeaderLink {
  to: string;
  label: string;
  /** Match the route exactly (for `/`). */
  end?: boolean;
  /**
   * Shown instead of `label` on narrow phones so every link fits. Screen readers still get the
   * full label, which contains this text.
   */
  shortLabel?: string;
}

/** The larptools hub page, at the root of the public site (the app is served at /sylvaris/). */
export const HUB_URL = '/';

export interface AppHeaderProps {
  /** Slot for the mode badge (STAFF or PLAYER). */
  modeBadge?: ReactNode;
  /** Route of the settings screen. */
  settingsTo?: string;
  /** Main sections (characters, wiki, staff, admin), shown as a row under the brand. */
  links?: HeaderLink[];
  /** Hide the section row on phones (character screens have their own bottom nav). */
  hideLinksOnPhone?: boolean;
}

/** Dark band in both themes: logo badge, wordmark, subtitle, mode badge, settings link. */
export function AppHeader({
  modeBadge,
  settingsTo = '/settings',
  links = [],
  hideLinksOnPhone = false,
}: AppHeaderProps) {
  return (
    <header className={styles.header}>
      {/* The public site ships no Sylvaris logo or site art (docs/PUBLIC-SITE-PLAN.md). */}
      {PUBLIC_MODE ? null : (
        <img
          className={styles.art}
          src={BRAND.swamp800}
          srcSet={`${BRAND.swamp800} 800w, ${BRAND.swamp1600} 1600w`}
          sizes="100vw"
          alt=""
          aria-hidden="true"
          decoding="async"
        />
      )}
      <div className={styles.inner}>
        {PUBLIC_MODE ? (
          <div className={styles.hubRow}>
            <a href={HUB_URL} className={styles.hubLink}>
              <House aria-hidden="true" />
              LARP Tools
            </a>
          </div>
        ) : null}
        <Link to="/" className={cx(styles.brand, styles.homeLink)}>
          {PUBLIC_MODE ? null : (
            <img
              className={styles.logo}
              src={BRAND.logo96}
              width={40}
              height={40}
              alt=""
              decoding="async"
            />
          )}
          <div className={styles.titles}>
            <p className={styles.wordmark}>Sylvaris</p>
            <p className={styles.subtitle}>
              {PUBLIC_MODE
                ? 'Unofficial Player Tools'
                : LOCAL_MODE
                  ? 'Character Playground'
                  : 'Character Sheet'}
            </p>
          </div>
        </Link>
        <div className={styles.actions}>
          {modeBadge}
          <Link to={settingsTo} className={styles.settings} aria-label="Settings">
            <Settings aria-hidden="true" />
          </Link>
        </div>
        {links.length > 0 ? (
          <nav
            aria-label="Main"
            className={cx(styles.nav, hideLinksOnPhone ? styles.navWide : null)}
          >
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end ?? false}
                className={({ isActive }) => cx(styles.navLink, isActive ? styles.navActive : null)}
                {...(link.shortLabel ? { 'aria-label': link.label } : {})}
              >
                {link.shortLabel ? (
                  <>
                    <span className={styles.longLabel}>{link.label}</span>
                    <span className={styles.shortLabel}>{link.shortLabel}</span>
                  </>
                ) : (
                  link.label
                )}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
