import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { useOptionalAuth } from '../auth/authContext.ts';
import { Card, Field } from '../components/index.ts';
import { Screen } from '../Screen.tsx';
import { useTheme, type ThemeChoice } from '../theme.ts';
import { APP_VERSION, RULESET_ID, RUSTWATER_SITE_URL } from '../version.ts';
import { DataCard } from './settings/DataCard.tsx';
import { AccountCard } from './settings/AccountCard.tsx';
import styles from './settings/settings.module.css';
import { PUBLIC_MODE } from '../../publicMode.ts';
import { OfflineControl } from '../pwa/OfflineBar.tsx';

/** `#/settings`: account, theme, backup and restore, about. */
export function SettingsPage() {
  return (
    <Screen title="Settings">
      <div className={styles.page}>
        <h1>Settings</h1>
        {PUBLIC_MODE ? null : <AccountCard />}
        <ThemeCard />
        {PUBLIC_MODE ? (
          <Card title="Offline use">
            <OfflineControl />
          </Card>
        ) : null}
        <SignedIn>
          <DataCard />
        </SignedIn>
        <AboutCard />
      </div>
    </Screen>
  );
}

/** The data card needs the server, so it shows only to a signed-in account. */
function SignedIn({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  if (auth && !auth.user) return null;
  return children;
}

function ThemeCard() {
  const { theme, setTheme } = useTheme();
  return (
    <Card title="Theme">
      <Field label="Theme" hint="System follows the device setting.">
        {(control) => (
          <select
            {...control}
            value={theme}
            onChange={(event) => setTheme(event.target.value as ThemeChoice)}
          >
            <option value="system">System</option>
            <option value="light">Parchment (light)</option>
            <option value="dark">Swamp (dark)</option>
          </select>
        )}
      </Field>
    </Card>
  );
}

function AboutCard() {
  return (
    <Card title="About">
      <div className={styles.stack}>
        <dl className={styles.facts}>
          <div>
            <dt>App version</dt>
            <dd className="num">{APP_VERSION}</dd>
          </div>
          <div>
            <dt>Ruleset</dt>
            <dd className="num">{RULESET_ID}</dd>
          </div>
        </dl>
        <p>Unofficial fan tool, not affiliated with Rustwater LARP.</p>
        <a className={styles.external} href={RUSTWATER_SITE_URL} target="_blank" rel="noreferrer">
          Rustwater LARP website
          <ExternalLink aria-hidden="true" className={styles.externalIcon} />
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </div>
    </Card>
  );
}
