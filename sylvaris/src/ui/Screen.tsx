import type { ReactNode } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { LOCAL_MODE } from '../localMode.ts';
import { CHARACTERS_PATH, PUBLIC_MODE } from '../publicMode.ts';
import { AppShell, Badge, IconButton, type HeaderLink } from './components/index.ts';
import { isStaffRole, ROLE_LABEL, useOptionalAuth } from './auth/authContext.ts';
import { useSettings, useStartup } from './data/hooks.ts';
import { pageTitle, useDocumentTitle } from './lib/routeFocus.ts';
import { OfflineBar } from './pwa/OfflineBar.tsx';
import { UpdateBanner } from './pwa/UpdateBanner.tsx';
import styles from './Screen.module.css';

export interface ScreenProps {
  children: ReactNode;
  nav?: ReactNode;
  /**
   * Screen name for `document.title`, most specific first: `['Skills', 'Ash Merrow']` gives
   * "Skills · Ash Merrow · Sylvaris" (a11y A-06). Leave it out to keep the current title.
   */
  title?: string | (string | null | undefined)[];
}

/** App shell for every screen: mode badge, the new-version banner, the startup error banner. */
export function Screen({ children, nav, title }: ScreenProps) {
  useDocumentTitle(
    title === undefined ? undefined : pageTitle(...(Array.isArray(title) ? title : [title])),
  );
  const { settings } = useSettings();
  const startup = useStartup();
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const links: HeaderLink[] = [];
  if (PUBLIC_MODE) {
    links.push(
      { to: '/', label: 'Life and Damage Calculator', shortLabel: 'Calculator', end: true },
      { to: CHARACTERS_PATH, label: 'Test Builds' },
      { to: '/wiki', label: 'Rules Wiki' },
    );
  } else if (LOCAL_MODE) {
    links.push({ to: '/', label: 'Characters', end: true }, { to: '/wiki', label: 'Rules wiki' });
  } else if (auth) {
    if (user)
      links.push({
        to: '/',
        label: isStaffRole(user.role) ? 'Characters' : 'My characters',
        end: true,
      });
    if (user) links.push({ to: '/events', label: 'Events' });
    if (user && isStaffRole(user.role)) links.push({ to: '/staff', label: 'Staff tools' });
    if (user?.role === 'admin') links.push({ to: '/admin', label: 'Admin' });
    links.push({ to: '/wiki', label: 'Rules wiki' });
    if (!user && auth.state.status === 'signed-out') links.push({ to: '/login', label: 'Sign in' });
  }
  // With accounts the badge shows the signed-in role; tests without accounts show the mode.
  const badge = LOCAL_MODE ? undefined : auth ? (
    user ? (
      <Badge kind={isStaffRole(user.role) ? 'staff' : 'player'}>{ROLE_LABEL[user.role]}</Badge>
    ) : undefined
  ) : settings ? (
    <Badge kind={settings.mode} />
  ) : undefined;
  return (
    <AppShell
      modeBadge={badge}
      nav={nav}
      links={links}
      {...(PUBLIC_MODE ? { topBar: <OfflineBar /> } : {})}
    >
      <UpdateBanner />
      {startup.errors.length > 0 ? (
        <div role="alert" className={styles.banner}>
          <CircleAlert aria-hidden="true" className={styles.bannerIcon} />
          <div className={styles.bannerText}>
            {startup.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
          <IconButton aria-label="Dismiss message" icon={<X />} onClick={startup.dismiss} />
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
