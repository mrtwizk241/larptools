// The public site's offline option (offlineSave.ts): a bar above the header until the visitor
// saves the site or closes the bar, and the same control in Settings.
import { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { Button, IconButton } from '../components/index.ts';
import {
  isAppleMobile,
  isInstalled,
  makeAvailableOffline,
  readOfflineChoice,
  saveOfflineChoice,
  useInstallPrompt,
  type OfflineResult,
} from './offlineSave.ts';
import styles from './OfflineBar.module.css';

type Status = 'idle' | 'working' | OfflineResult;

function message(status: Status, installed: boolean): string {
  switch (status) {
    case 'idle':
      return 'Use these tools with no signal at events.';
    case 'working':
      return 'Saving for offline use…';
    case 'ready':
      if (installed) return 'Ready to use offline.';
      return isAppleMobile()
        ? 'Ready to use offline. Also tap Share, then Add to Home Screen: Safari can clear sites not opened for a week, test builds included.'
        : 'Ready to use offline on this device. Bookmark this page to find it with no signal.';
    case 'unsupported':
      return 'This browser cannot save the site for offline use. Private windows often cannot: try a normal window.';
    case 'failed':
      return 'Saving for offline use did not finish. Check your connection and try again.';
  }
}

/** The message, Make available offline, and Install app once saved where the browser offers it. */
export function OfflineControl() {
  const [status, setStatus] = useState<Status>(() =>
    readOfflineChoice() === 'ready' ? 'ready' : 'idle',
  );
  const { canInstall, install } = useInstallPrompt();
  const installed = isInstalled();

  async function save() {
    setStatus('working');
    const result = await makeAvailableOffline();
    if (result === 'ready') saveOfflineChoice('ready');
    setStatus(result);
  }

  return (
    <div className={styles.control}>
      <p role="status" className={styles.text}>
        {message(status, installed)}
      </p>
      {status === 'idle' || status === 'failed' ? (
        <Button variant="primary" icon={<Download />} onClick={() => void save()}>
          {status === 'failed' ? 'Try again' : 'Make available offline'}
        </Button>
      ) : null}
      {status === 'ready' && canInstall && !installed ? (
        <Button icon={<Smartphone />} onClick={() => void install()}>
          Install app
        </Button>
      ) : null}
    </div>
  );
}

/** Above the header on every public page until the site is saved for offline use or closed. */
export function OfflineBar() {
  const [hidden, setHidden] = useState(() => readOfflineChoice() !== null || isInstalled());
  if (hidden) return null;
  return (
    <section aria-label="Offline use" className={styles.bar}>
      <div className={styles.inner}>
        <OfflineControl />
        <IconButton
          aria-label="Close the offline bar"
          icon={<X />}
          onClick={() => {
            if (readOfflineChoice() !== 'ready') saveOfflineChoice('hidden');
            setHidden(true);
          }}
        />
      </div>
    </section>
  );
}
