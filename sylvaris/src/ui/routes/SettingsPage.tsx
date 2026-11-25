import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { useOptionalAuth } from '../auth/authContext.ts';
import { Card, Field } from '../components/index.ts';
import { OfflineStatusCard } from '../pwa/OfflineStatus.tsx';
import { LOCAL_MODE } from '../../localMode.ts';
import { PUBLIC_MODE } from '../../publicMode.ts';
import { OfflineControl } from '../pwa/OfflineBar.tsx';
import { useRepository } from '../data/hooks.ts';
import { Screen } from '../Screen.tsx';
import { useTheme, type ThemeChoice } from '../theme.ts';
import { APP_VERSION, RULESET_ID, SYLVARIS_SITE_URL } from '../version.ts';
import { DataCard } from './settings/DataCard.tsx';
import { AccountCard } from './settings/AccountCard.tsx';
import styles from './settings/settings.module.css';

/** `#/settings`: account, theme, backup and restore, about. */
export function SettingsPage() {
  return (
    <Screen title="Settings">
      <div className={styles.page}>
        <h1>Settings</h1>
        {LOCAL_MODE ? <LocalSaveCard /> : <AccountCard />}
        <ThemeCard />
        {PUBLIC_MODE ? (
          <Card title="Use with no signal">
            <OfflineControl />
          </Card>
        ) : LOCAL_MODE ? null : (
          <OfflineStatusCard />
        )}
        <SignedIn>
          <DataCard />
        </SignedIn>
        <AboutCard />
      </div>
    </Screen>
  );
}

/** No-login builder: where characters are kept, and how to keep them safe or move them. */
function LocalSaveCard() {
  const repository = useRepository() as { persistent?: boolean };
  return (
    <Card title="Saved on this device">
      <div className={styles.stack}>
        {PUBLIC_MODE ? (
          <PublicSaveText persistent={repository.persistent !== false} />
        ) : repository.persistent === false ? (
          <p role="alert">
            This browser is not letting the file save, so your characters last only until you close
            it. Use Back up all characters below before you close, or open the file in Safari,
            Chrome, Firefox, or Edge.
          </p>
        ) : (
          <p>
            Your characters are saved in this browser, for this file, on this device. Nothing is
            sent anywhere and there is no sign-in.
          </p>
        )}
        {PUBLIC_MODE ? null : (
          <p>
            To move a character to another device or person, open it, then More, then Share
            character file. They load it with Upload character sheet on their character list. Back
            up all characters below keeps a copy of everything.
          </p>
        )}
      </div>
    </Card>
  );
}

/** Public site: test builds live in this browser; Export and the backup move them. */
function PublicSaveText({ persistent }: { persistent: boolean }) {
  return (
    <>
      {persistent ? (
        <p>
          Your test builds are saved in this browser on this device. Nothing is sent anywhere and
          there is no sign-in. Clearing this site&apos;s data, or using a private window, deletes
          them.
        </p>
      ) : (
        <p role="alert">
          This browser is not letting the site save, so your test builds last only until you close
          it. Use Back up all characters below before you close, or try a normal window.
        </p>
      )}
      <p>
        To keep a copy or move test builds to another device, use Back up all characters below, or
        Export in a test build&apos;s menu on Test Builds. Restore from backup reads either file.
      </p>
    </>
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
            <option value="light">Vellum (light)</option>
            <option value="dark">Nightfall (dark)</option>
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
        <p>Unofficial fan tool, not affiliated with Sylvaris LARP or Sylvaris Games, LLC.</p>
        <a className={styles.external} href={SYLVARIS_SITE_URL} target="_blank" rel="noreferrer">
          Sylvaris LARP website
          <ExternalLink aria-hidden="true" className={styles.externalIcon} />
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </div>
    </Card>
  );
}
