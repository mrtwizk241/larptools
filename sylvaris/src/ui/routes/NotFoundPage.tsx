import { Link } from 'react-router';
import { CHARACTERS_PATH, PUBLIC_MODE } from '../../publicMode.ts';
import { Screen } from '../Screen.tsx';
import styles from './NotFoundPage.module.css';

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
      {PUBLIC_MODE ? 'Back to test builds' : 'Back to characters'}
    </Link>
  );
}
