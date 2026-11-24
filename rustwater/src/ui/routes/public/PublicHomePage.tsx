// `#/test-builds` on the public site (docs/PUBLIC-SITE-PLAN.md): the visitor's test builds saved in
// this browser. The calculator is the start page (`#/`). No sign-in, nothing sent anywhere.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Plus } from 'lucide-react';
import { TEST_BUILD_LIMIT } from '../../../api/contract.ts';
import { Alert, ButtonLink, Card } from '../../components/index.ts';
import { useRepository } from '../../data/hooks.ts';
import { summarizeCharacter, type CharacterSummary } from '../../data/summary.ts';
import { Screen } from '../../Screen.tsx';
import styles from '../RosterPage.module.css';

type Builds =
  | { status: 'loading' }
  | { status: 'ready'; rows: CharacterSummary[]; unreadable: number }
  | { status: 'error'; message: string };

/**
 * Asks the browser to keep this site's storage when space runs low, so test builds are not
 * cleared on their own. Browsers may say no; the backup in Settings still covers that.
 */
async function askToKeepStorage(): Promise<void> {
  try {
    if ((await navigator.storage?.persisted?.()) === false) await navigator.storage.persist();
  } catch {
    // Not supported, or blocked: nothing to do.
  }
}

function ancestryText(ancestry: string, subtype: string): string {
  return subtype ? `${ancestry}, ${subtype}` : ancestry;
}

export function PublicHomePage() {
  const repository = useRepository();
  const [builds, setBuilds] = useState<Builds>({ status: 'loading' });

  useEffect(() => {
    void askToKeepStorage();
    let cancelled = false;
    repository
      .listCharacters()
      .then((result) => {
        if (cancelled) return;
        setBuilds({
          status: 'ready',
          rows: result.items.map((character) => summarizeCharacter(character)),
          unreadable: result.invalid.length,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBuilds({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const count = builds.status === 'ready' ? builds.rows.length : 0;
  const full = count >= TEST_BUILD_LIMIT;

  return (
    <Screen title="Test Builds">
      <div className={styles.page}>
        <h1>Test Builds</h1>
        <Alert kind="info" title="Unofficial, player-made tool">
          <p>
            Made by a player, not by Rustwater LARP. Staff have not checked or approved it, so if
            anything here disagrees with the rulebook or staff, the rulebook and staff win.
          </p>
        </Alert>
        <p>
          Plan a character with a test build: try out skills, points, and ancestries. No sign-in, no
          tracking, and no analytics: nothing you enter leaves this browser.
        </p>

        <Alert kind="info" title="Your test builds are saved only in this browser">
          <p>
            Clearing this site&apos;s data, or using a private window, deletes them. To keep a copy
            or move builds to another device, use Back up in <Link to="/settings">Settings</Link>.
          </p>
        </Alert>

        <Card title="Test builds">
          {builds.status === 'loading' ? <p>Loading test builds…</p> : null}
          {builds.status === 'error' ? (
            <p role="alert">Your test builds could not be read: {builds.message}</p>
          ) : null}
          {builds.status === 'ready' && builds.unreadable > 0 ? (
            <p role="alert">
              {builds.unreadable === 1
                ? '1 saved test build could not be read.'
                : `${builds.unreadable} saved test builds could not be read.`}
            </p>
          ) : null}
          {builds.status === 'ready' && count === 0 ? (
            <p>No test builds yet. Make one to try out skills, points, and ancestries.</p>
          ) : null}
          {builds.status === 'ready' && count > 0 ? (
            <ul className={styles.list}>
              {builds.rows.map((row) => (
                <li key={row.id} className={styles.row}>
                  <Link to={`/c/${row.id}`} className={styles.rowLink}>
                    <span className={styles.rowMain}>
                      <span className={styles.name}>{row.characterName}</span>
                      <span className={styles.meta}>
                        CXP <span className="num">{row.cxpTotal}</span> total
                      </span>
                    </span>
                    <span className={styles.side}>
                      {row.ancestryName ? (
                        <span className={styles.ancestry}>
                          {ancestryText(row.ancestryName, row.subtypeName)}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight aria-hidden="true" className={styles.chevron} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {builds.status === 'ready' ? (
            <div className={styles.actions}>
              {full ? (
                <p className={styles.note}>
                  You have {TEST_BUILD_LIMIT} test builds, the most this site keeps. Delete one to
                  make another.
                </p>
              ) : (
                <ButtonLink to="/new" variant="primary" icon={<Plus />}>
                  New test build
                </ButtonLink>
              )}
            </div>
          ) : null}
        </Card>
      </div>
    </Screen>
  );
}
