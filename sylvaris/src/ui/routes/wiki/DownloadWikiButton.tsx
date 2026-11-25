import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, useToast } from '../../components/index.ts';
import styles from './wiki.module.css';

export interface DownloadWikiButtonProps {
  /** Tests replace the download. */
  download?: () => Promise<string>;
}

async function realDownload(): Promise<string> {
  const { downloadWikiHtml } = await import('./downloadWiki.ts');
  return downloadWikiHtml();
}

/** "Download wiki": saves the whole wiki as one HTML file to share or keep. */
export function DownloadWikiButton({ download = realDownload }: DownloadWikiButtonProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className={styles.download}>
      <Button
        variant="secondary"
        icon={<Download aria-hidden="true" />}
        aria-disabled={busy || undefined}
        onClick={() => {
          if (busy) return;
          setBusy(true);
          download()
            .then((name) => toast.show(`Saved ${name}.`))
            .catch(() => toast.show('Could not make the file. Try again.'))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? 'Making the file…' : 'Download wiki'}
      </Button>
      <p className={styles.downloadHint}>
        One HTML file with every page and list. It opens in any browser with no signal, so you can
        share it with anyone.
      </p>
    </div>
  );
}
