import { RefreshCw } from 'lucide-react';
import { Button } from '../components/index.ts';
import { useUpdatePrompt, type UpdateStore } from './updates.ts';
import styles from './UpdateBanner.module.css';

/** Shown when a new app version is waiting. Reload activates it; until then the app keeps working. */
export function UpdateBanner({ store }: { store?: UpdateStore }) {
  const { needRefresh, reload } = useUpdatePrompt(store);
  if (!needRefresh) return null;
  return (
    <div role="status" className={styles.banner}>
      <RefreshCw aria-hidden="true" className={styles.icon} />
      <p className={styles.text}>A new version is ready.</p>
      <Button variant="primary" onClick={() => void reload()}>
        Reload
      </Button>
    </div>
  );
}
