import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { buildCharacterFile, fileNameFor, serializeFile } from '../../../io/index.ts';
import { useToast } from '../../components/index.ts';
import { saveTextFile } from '../../data/saveFile.ts';
import { UNNAMED_CHARACTER } from '../../data/summary.ts';
import { APP_VERSION } from '../../version.ts';
import { ErrorList } from './ErrorList.tsx';
import { OwnerCard } from './OwnerCard.tsx';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';
import shareStyles from './share.module.css';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `#/c/:id/share`: share the character file; staff also see which player account owns it. */
export function SharePage({ view }: { view: CharacterView }) {
  const toast = useToast();
  const [problem, setProblem] = useState<string | null>(null);
  const name = view.sheet.profile.characterName.trim() || UNNAMED_CHARACTER;

  async function share() {
    setProblem(null);
    try {
      const file = buildCharacterFile(view.character, { appVersion: APP_VERSION });
      const result = await saveTextFile(serializeFile(file), fileNameFor('character', name), name);
      if (result === 'shared') toast.show(`Shared ${name}.`);
      if (result === 'downloaded') toast.show(`Saved the character file for ${name}.`);
    } catch (error) {
      setProblem(`The character file could not be made: ${message(error)}`);
    }
  }

  return (
    <section aria-labelledby="share-heading" className={styles.section}>
      <h2 id="share-heading">Share</h2>
      <ul className={styles.list}>
        <li>
          <button
            type="button"
            className={`${styles.row} ${shareStyles.rowButton}`}
            onClick={() => void share()}
          >
            <Share2 aria-hidden="true" className={styles.rowIcon} />
            <span className={styles.rowLabel}>Share character file</span>
          </button>
        </li>
      </ul>
      {view.isStaff && !view.meta ? (
        <p className={shareStyles.note}>
          Give this file to the player. A newer file from you replaces their copy.
        </p>
      ) : null}
      <ErrorList messages={problem ? [problem] : []} />
      {view.isStaff && view.meta ? <OwnerCard view={view} /> : null}
    </section>
  );
}
