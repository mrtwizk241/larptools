// `#/test-builds/new` (players): make a private test build (ADR 0007), either from scratch with
// the create wizard in test mode, or as a copy of one of the player's own live characters.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Copy, Plus } from 'lucide-react';
import { TEST_BUILD_LIMIT, type CharacterEntry } from '../../../api/contract.ts';
import { createTestBuild, loadCharacterEntries } from '../../../storage/remote.ts';
import { useOptionalAuth } from '../../auth/authContext.ts';
import { Alert, Button, ButtonLink, useToast } from '../../components/index.ts';
import { rulesetFor, useRuleset } from '../../data/rulesetContext.ts';
import { summarizeCharacter } from '../../data/summary.ts';
import { Screen } from '../../Screen.tsx';
import { BackLink } from '../PlaceholderPage.tsx';
import { ErrorList } from '../character/ErrorList.tsx';
import { copyableEntries, rosterSections } from './testBuilds.ts';
import styles from './testBuilds.module.css';

type Loaded =
  | { status: 'loading' }
  | { status: 'ready'; entries: CharacterEntry[] }
  | { status: 'error'; message: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function NewTestBuildPage() {
  const role = useOptionalAuth()?.user?.role;
  return (
    <Screen title="New test build">
      <div className={styles.page}>
        <h1>New test build</h1>
        <p>
          A test build is a private copy for planning. Only you see it, and changes to it never
          affect your live characters.
        </p>
        {role === undefined || role === 'player' ? (
          <Choices />
        ) : (
          <p>Test builds are for player accounts.</p>
        )}
        <BackLink />
      </div>
    </Screen>
  );
}

function Choices() {
  const ruleset = useRuleset();
  const navigate = useNavigate();
  const toast = useToast();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [copying, setCopying] = useState<string | null>(null);
  const [problem, setProblem] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadCharacterEntries().then(
      (entries) => {
        if (!cancelled) setLoaded({ status: 'ready', entries });
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ status: 'error', message: message(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (loaded.status === 'loading') return <p>Loading…</p>;
  if (loaded.status === 'error')
    return <p role="alert">Your characters could not be read: {loaded.message}</p>;

  const count = rosterSections(loaded.entries).test.length;
  if (count >= TEST_BUILD_LIMIT)
    return (
      <Alert kind="info" title="No room for another test build">
        <p>
          You have {count} test builds, the most you can keep. Open one and delete it to make
          another.
        </p>
      </Alert>
    );

  const sources = copyableEntries(loaded.entries, rulesetFor);
  const nameOf = (entry: CharacterEntry) =>
    summarizeCharacter(entry.character, ruleset).characterName;

  async function copy(entry: CharacterEntry) {
    if (copying) return;
    setCopying(entry.character.id);
    setProblem([]);
    try {
      const made = await createTestBuild({ from: 'copy', sourceId: entry.character.id });
      toast.show(`Made the test build ${nameOf(made)}.`);
      void navigate(`/c/${made.character.id}`);
    } catch (error) {
      setProblem([`The copy could not be made: ${message(error)}`]);
      setCopying(null);
    }
  }

  return (
    <>
      <section aria-labelledby="scratch-heading" className={styles.section}>
        <h2 id="scratch-heading">Start from scratch</h2>
        <p>
          Build a new character with the create wizard. It is saved as a test build, not sent to
          staff.
        </p>
        <div>
          <ButtonLink to="/new?test=1" variant="primary" icon={<Plus />}>
            Start from scratch
          </ButtonLink>
        </div>
      </section>
      <section aria-labelledby="copy-heading" className={styles.section}>
        <h2 id="copy-heading">Copy a live character</h2>
        {sources.length === 0 ? (
          <p className={styles.note}>You have no approved live characters to copy.</p>
        ) : (
          <>
            <p>The copy keeps the whole log. Your live character does not change.</p>
            <ul className={styles.list}>
              {sources.map((entry) => {
                const summary = summarizeCharacter(entry.character, ruleset);
                return (
                  <li key={entry.character.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.name}>{summary.characterName}</span>
                      <span className={styles.meta}>
                        CXP <span className="num">{summary.cxpTotal}</span> total
                      </span>
                    </span>
                    <Button
                      icon={<Copy />}
                      aria-label={`Copy ${summary.characterName}`}
                      aria-busy={copying === entry.character.id || undefined}
                      onClick={() => void copy(entry)}
                    >
                      Copy
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <ErrorList messages={problem} />
      </section>
    </>
  );
}
