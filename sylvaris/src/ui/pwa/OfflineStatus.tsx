import { useState } from 'react';
import { CircleCheck, CloudDownload, WifiOff } from 'lucide-react';
import { Button, Card } from '../components/index.ts';
import { cx } from '../components/cx.ts';
import { describeOffline, useOfflineStatus, type OfflineEnv } from './offline.ts';
import styles from './OfflineStatus.module.css';

export interface OfflineStatusCardProps {
  /** Tests: a fake browser. Leave it out in the app. */
  env?: OfflineEnv;
}

/**
 * "Use with no signal": whether the app and the rules wiki are saved on this device. Shown on the
 * wiki home and in Settings. Renders nothing in builds without a service worker (dev, tests).
 */
export function OfflineStatusCard({ env }: OfflineStatusCardProps) {
  const { status, keep } = useOfflineStatus(env);
  const [asking, setAsking] = useState(false);
  const text = describeOffline(status);
  if (!text) return null;
  return (
    <Card title="Use with no signal" className={cx(styles.card)}>
      <div role="status" aria-live="polite" className={styles.body}>
        <p className={status.save === 'ready' ? styles.ready : styles.title}>{text.title}</p>
        {text.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {text.canKeep ? (
        <Button
          variant="secondary"
          aria-disabled={asking || undefined}
          onClick={() => {
            if (asking) return;
            setAsking(true);
            void keep().finally(() => setAsking(false));
          }}
        >
          Keep the saved copy
        </Button>
      ) : null}
      {text.tip ? <p className={styles.tip}>{text.tip}</p> : null}
    </Card>
  );
}

/**
 * One line near the top of the wiki home with the same status, so a player sees it at a glance.
 * Not a live region: the card announces changes.
 */
export function OfflineStatusLine({ env }: OfflineStatusCardProps) {
  const { status } = useOfflineStatus(env);
  const text = describeOffline(status);
  if (!text) return null;
  const Icon = !status.online ? WifiOff : status.save === 'ready' ? CircleCheck : CloudDownload;
  return (
    <p className={status.save === 'ready' && status.online ? styles.lineReady : styles.line}>
      <Icon aria-hidden="true" className={styles.icon} />
      <span>{text.title}. Details at the end of this page.</span>
    </p>
  );
}
