// The three-dot menu on a test build row (public site, ported from Rustwater): Copy, Export, Delete. Copy makes
// "<name> (copy)" in this browser; Export saves a backup file with this one build, which Restore
// from backup in Settings reads back; Delete asks first.
import { useEffect, useId, useRef, useState } from 'react';
import { Copy, Download, EllipsisVertical, Trash2 } from 'lucide-react';
import { TEST_BUILD_LIMIT } from '../../../publicMode.ts';
import { buildBackupFile, fileNameFor, serializeFile } from '../../../io/index.ts';
import { ConfirmDialog, IconButton, useToast } from '../../components/index.ts';
import { useRepository } from '../../data/hooks.ts';
import { rulesetFor } from '../../data/rulesetContext.ts';
import { saveTextFile } from '../../data/saveFile.ts';
import { copyTestBuild } from './testBuildCopy.ts';
import styles from './testBuildMenu.module.css';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TestBuildMenu({
  id,
  name,
  count,
  onChanged,
}: {
  id: string;
  name: string;
  /** Test builds saved now, for the copy limit. */
  count: number;
  /** Called after a copy or a delete, so the list reloads. */
  onChanged: () => void;
}) {
  const repository = useRepository();
  const toast = useToast();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape or a click outside closes the menu; Escape puts focus back on the button.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  async function copy() {
    setOpen(false);
    if (count >= TEST_BUILD_LIMIT) {
      toast.show(`You can keep up to ${TEST_BUILD_LIMIT} test builds. Delete one to make a copy.`);
      return;
    }
    try {
      const source = await repository.getCharacter(id);
      const ruleset = source ? rulesetFor(source.rulesetId) : undefined;
      if (!source || !ruleset) throw new Error('This test build could not be read.');
      const result = copyTestBuild(ruleset, source, crypto.randomUUID(), new Date().toISOString());
      if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(' '));
      await repository.saveCharacter(result.character);
      toast.show(`Copied ${name} as ${result.name}.`);
      onChanged();
    } catch (error) {
      toast.show(`The copy could not be made: ${message(error)}`);
    }
  }

  async function exportFile() {
    setOpen(false);
    try {
      const source = await repository.getCharacter(id);
      if (!source) throw new Error('This test build could not be read.');
      const file = buildBackupFile({ characters: [source], events: [] });
      const result = await saveTextFile(serializeFile(file), fileNameFor('backup', name), name);
      if (result === 'shared') toast.show(`Shared ${name}.`);
      if (result === 'downloaded')
        toast.show(`Saved ${name}. Restore from backup in Settings opens it.`);
    } catch (error) {
      toast.show(`The file could not be made: ${message(error)}`);
    }
  }

  async function remove() {
    setConfirming(false);
    try {
      await repository.deleteCharacter(id);
      toast.show(`Deleted ${name}.`);
      onChanged();
    } catch (error) {
      toast.show(`The test build could not be deleted: ${message(error)}`);
    }
  }

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <IconButton
        ref={buttonRef}
        className={styles.button}
        aria-label={`More for ${name}`}
        aria-expanded={open}
        aria-controls={menuId}
        icon={<EllipsisVertical />}
        onClick={() => setOpen((v) => !v)}
      />
      {open ? (
        <ul id={menuId} className={styles.menu} aria-label={`Actions for ${name}`}>
          <li>
            <button type="button" className={styles.item} onClick={() => void copy()}>
              <Copy aria-hidden="true" className={styles.icon} />
              Copy
            </button>
          </li>
          <li>
            <button type="button" className={styles.item} onClick={() => void exportFile()}>
              <Download aria-hidden="true" className={styles.icon} />
              Export
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`${styles.item} ${styles.danger}`}
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
            >
              <Trash2 aria-hidden="true" className={styles.icon} />
              Delete
            </button>
          </li>
        </ul>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={`Delete ${name}?`}
        confirmLabel="Delete test build"
        danger
        onCancel={() => setConfirming(false)}
        onConfirm={() => void remove()}
      >
        <p>This removes the test build from this browser. Export it first to keep a copy.</p>
      </ConfirmDialog>
    </div>
  );
}
