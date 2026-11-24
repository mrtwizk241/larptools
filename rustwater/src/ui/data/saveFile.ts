// Hands a text file to the user: the share sheet when the device can share files (ADR 0003),
// otherwise a download.
import { FILE_MIME_TYPE } from '../../io/index.ts';

export type SaveFileResult = 'shared' | 'downloaded' | 'cancelled';

/** How long the download URL stays valid after the click. */
const REVOKE_AFTER_MS = 60_000;

function canShareFile(file: File): boolean {
  try {
    return (
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

export async function saveTextFile(
  text: string,
  fileName: string,
  title: string,
): Promise<SaveFileResult> {
  const file = new File([text], fileName, { type: FILE_MIME_TYPE });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Sharing failed for another reason (for example no share target): fall back.
    }
  }
  download(file, fileName);
  return 'downloaded';
}
