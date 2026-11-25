import { useState } from 'react';
import { Link } from 'react-router';
import {
  ChevronRight,
  ClipboardCheck,
  Coins,
  Compass,
  Flag,
  History,
  Inbox,
  PawPrint,
  Printer,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { buildCharacterFile, fileNameFor, serializeFile } from '../../../io/index.ts';
import { useToast } from '../../components/index.ts';
import { saveTextFile } from '../../data/saveFile.ts';
import { UNNAMED_CHARACTER } from '../../data/summary.ts';
import { APP_VERSION } from '../../version.ts';
import { ErrorList } from './ErrorList.tsx';
import { LOCAL_MODE } from '../../../localMode.ts';
import { OwnerCard } from './OwnerCard.tsx';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';
import moreStyles from './more.module.css';

interface MoreItem {
  icon: LucideIcon;
  label: string;
  /** Path under the character, or an app path starting with `/`. */
  path: string;
  staffOnly?: boolean;
}

/** Character screens that are not in the bottom bar (Overview, Skills, Magic, Play, More). */
const ITEMS: MoreItem[] = [
  { icon: Compass, label: 'Calling', path: 'calling' },
  { icon: PawPrint, label: 'Artifact, familiar, and extras', path: 'extras' },
  { icon: History, label: 'Log', path: 'log' },
  { icon: ClipboardCheck, label: 'Check-in', path: 'checkin', staffOnly: true },
  { icon: Coins, label: 'Points', path: 'points', staffOnly: true },
  { icon: Flag, label: 'Retirement', path: 'retire', staffOnly: true },
  { icon: Printer, label: 'Print', path: 'print' },
  { icon: Inbox, label: 'Learning requests', path: '/requests' },
];

/** More items the no-login builder leaves out. */
const BUILDER_HIDDEN: ReadonlySet<string> = new Set([
  'checkin',
  'retire',
  '/requests',
  // In the bottom bar instead.
  'calling',
  'extras',
]);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `#/c/:id/more`: links to the less used character screens, and sharing the character file. */
export function MorePage({ view }: { view: CharacterView }) {
  const toast = useToast();
  const [problem, setProblem] = useState<string | null>(null);
  // The no-login builder is a build playground: Points, but no events, retirement, or staff to
  // send learning requests to.
  const items = ITEMS.filter((item) =>
    LOCAL_MODE ? !BUILDER_HIDDEN.has(item.path) : view.isStaff || !item.staffOnly,
  );
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
    <section aria-labelledby="more-heading" className={styles.section}>
      <h2 id="more-heading">More</h2>
      <ul className={styles.list}>
        {items.map(({ icon: Icon, label, path }) => (
          <li key={path}>
            <Link to={path.startsWith('/') ? path : `/c/${view.id}/${path}`} className={styles.row}>
              <Icon aria-hidden="true" className={styles.rowIcon} />
              <span className={styles.rowLabel}>{label}</span>
              <ChevronRight aria-hidden="true" className={styles.chevron} />
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            className={`${styles.row} ${moreStyles.rowButton}`}
            onClick={() => void share()}
          >
            <Share2 aria-hidden="true" className={styles.rowIcon} />
            <span className={styles.rowLabel}>Share character file</span>
          </button>
        </li>
      </ul>
      {view.isStaff && !view.meta ? (
        <p className={moreStyles.note}>
          Give this file to the player. A newer file from you replaces their copy.
        </p>
      ) : null}
      <ErrorList messages={problem ? [problem] : []} />
      {view.isStaff && view.meta ? <OwnerCard view={view} /> : null}
    </section>
  );
}
