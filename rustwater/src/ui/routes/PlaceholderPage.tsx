import { Link } from 'react-router';
import { Card } from '../components/index.ts';
import { CHARACTERS_PATH } from '../../publicMode.ts';
import { Screen } from '../Screen.tsx';
import styles from './PlaceholderPage.module.css';

/** "Coming next" card for screens not built yet. */
export function ComingNext() {
  return (
    <Card>
      <p>Coming next.</p>
    </Card>
  );
}

/** Screen not built yet: its title and a "Coming next" card. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Screen title={title}>
      <div className={styles.page}>
        <h1>{title}</h1>
        <ComingNext />
        <BackLink />
      </div>
    </Screen>
  );
}

export function NotFoundPage() {
  return (
    <Screen title="Page not found">
      <div className={styles.page}>
        <h1>Page not found</h1>
        <p>There is nothing at this address.</p>
        <BackLink />
      </div>
    </Screen>
  );
}

export function BackLink() {
  return (
    <Link to={CHARACTERS_PATH} className={styles.back}>
      Back to characters
    </Link>
  );
}
