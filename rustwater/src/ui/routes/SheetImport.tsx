// Staff "Upload character sheet" with a downloaded .xlsx of the official Google Sheet: reads it,
// shows what it found and every warning, lets staff pick the player account, and creates the
// character. The import module (with its unzip library) loads on first use.
import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { SheetImport } from '../../xlsx-import/index.ts';
import { ConfirmDialog, useToast } from '../components/index.ts';
import { suggestedOwner, useAccounts } from '../data/accounts.ts';
import { publishCharacterSaved } from '../data/characterEvents.ts';
import { useRepository } from '../data/hooks.ts';
import { useRuleset } from '../data/rulesetContext.ts';
import { OwnerSelect } from './staff/OwnerSelect.tsx';
import { Preview } from './SheetImportPreview.tsx';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface SheetImportOptions {
  /** Shows why a file could not be imported (null clears it), in the page's alert. */
  onProblem: (errors: string[] | null) => void;
}

/** `open(file)` reads a workbook and shows the preview; render `dialog` once on the page. */
export function useSheetImport({ onProblem }: SheetImportOptions): {
  open: (file: File) => Promise<void>;
  dialog: ReactNode;
} {
  const repository = useRepository();
  const ruleset = useRuleset();
  const toast = useToast();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const busy = useRef(false);
  const [found, setFound] = useState<SheetImport | null>(null);
  const [owner, setOwner] = useState('');
  const users = accounts.status === 'ready' ? accounts.users : [];

  async function open(file: File) {
    if (busy.current) return;
    busy.current = true;
    onProblem(null);
    try {
      const xlsx = await import('../../xlsx-import/index.ts');
      if (file.size > xlsx.MAX_XLSX_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        onProblem([`The file is too large (${mb} MB). The limit is 10 MB.`]);
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        const result = xlsx.importSheet(bytes, ruleset, {
          characterId: crypto.randomUUID(),
          now: new Date().toISOString(),
          newId: () => crypto.randomUUID(),
        });
        setOwner(suggestedOwner(users, result.preview.playerEmail));
        setFound(result);
      } catch (error) {
        onProblem([
          xlsx.isImportError(error)
            ? error.message
            : `The workbook could not be read: ${message(error)}`,
        ]);
      }
    } catch (error) {
      onProblem([`The file could not be read: ${message(error)}`]);
    } finally {
      busy.current = false;
    }
  }

  async function create() {
    const current = found;
    setFound(null);
    if (!current) return;
    try {
      const saved = await repository.saveCharacter(
        current.stored,
        repository.server ? { ownerId: owner === '' ? null : owner } : {},
      );
      publishCharacterSaved(repository, saved);
      // Navigate first: a toast belongs to the route it is shown on.
      void navigate(`/c/${saved.id}`);
      toast.show(`Created ${current.preview.characterName} from the Google Sheet.`);
    } catch (error) {
      onProblem([`The character could not be saved: ${message(error)}`]);
    }
  }

  const dialog = (
    <ConfirmDialog
      open={found !== null}
      title="Import from Google Sheet"
      confirmLabel="Create character"
      onCancel={() => setFound(null)}
      onConfirm={() => void create()}
    >
      {found ? (
        <>
          <Preview found={found} />
          {accounts.status === 'ready' ? (
            <OwnerSelect users={users} value={owner} onChange={setOwner} />
          ) : null}
        </>
      ) : null}
    </ConfirmDialog>
  );

  return { open, dialog };
}
