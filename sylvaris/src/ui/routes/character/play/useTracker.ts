// Spent uses for the Play screen, loaded from and saved to the repository's use tracker.
// Every change is saved at once. An IndexedDB write still in flight can be dropped when the page
// closes, so each change is also written synchronously to a localStorage backup
// (`sy.tracker.<id>`) that is cleared once the repository save lands. A backup found on load is
// newer than the stored tracker, so it wins and is saved again. A failed save is retried on the
// next change or when the page is hidden.
import { useCallback, useEffect, useRef, useState } from 'react';
import { UseTrackerSchema, type UseTracker } from '../../../../engine/model.ts';
import { useRepository } from '../../../data/hooks.ts';
import {
  clampSpent,
  sameSpent,
  spentFromTracker,
  trackerFromSpent,
  type Spent,
  type TrackedUse,
} from './usage.ts';

export type TrackerState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; spent: Spent };

export interface TrackerApi {
  state: TrackerState;
  /** Latest spent counts (also between renders). Null until loaded. */
  current: () => Spent | null;
  /** Sets new spent counts and saves them. */
  commit: (next: Spent) => void;
  /** Last save error, if any; cleared by the next successful save. */
  saveError: string | null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const backupKey = (characterId: string) => `sy.tracker.${characterId}`;

function writeBackup(record: UseTracker): void {
  try {
    localStorage.setItem(backupKey(record.characterId), JSON.stringify(record));
  } catch {
    // Storage blocked or full: the repository save still runs.
  }
}

/** Removes the backup if it still holds this record (a newer change keeps its own backup). */
function clearBackup(record: UseTracker): void {
  try {
    const key = backupKey(record.characterId);
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    const held = JSON.parse(raw) as { updatedAt?: unknown };
    if (held.updatedAt === record.updatedAt) localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

function readBackup(characterId: string): UseTracker | undefined {
  try {
    const raw = localStorage.getItem(backupKey(characterId));
    if (raw === null) return undefined;
    const parsed = UseTrackerSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.characterId === characterId ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function useTracker(characterId: string, items: readonly TrackedUse[]): TrackerApi {
  const repository = useRepository();
  const [loaded, setLoaded] = useState<{ id: string; state: TrackerState } | null>(null);
  const setState = useCallback(
    (next: TrackerState) => setLoaded({ id: characterId, state: next }),
    [characterId],
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const spentRef = useRef<Spent | null>(null);
  const itemsRef = useRef(items);
  const dirtyRef = useRef(false);

  const flush = useCallback(() => {
    const spent = spentRef.current;
    if (!dirtyRef.current || spent === null) return;
    dirtyRef.current = false;
    const record = trackerFromSpent(characterId, spent, itemsRef.current, new Date().toISOString());
    writeBackup(record);
    // IndexedDB runs write transactions on one store in the order they were made, so the latest
    // save wins.
    repository.saveTracker(record).then(
      () => {
        clearBackup(record);
        setSaveError(null);
      },
      (error: unknown) => {
        dirtyRef.current = true;
        setSaveError(message(error));
      },
    );
  }, [characterId, repository]);

  const commit = useCallback(
    (next: Spent) => {
      if (spentRef.current === null) return;
      spentRef.current = next;
      dirtyRef.current = true;
      setState({ status: 'ready', spent: next });
      flush();
    },
    [flush, setState],
  );

  // Load once per character.
  useEffect(() => {
    let live = true;
    spentRef.current = null;
    repository.getTracker(characterId).then(
      (saved) => {
        if (!live) return;
        const backup = readBackup(characterId);
        const tracker = backup ?? saved;
        const stored = spentFromTracker(tracker);
        const spent = clampSpent(stored, itemsRef.current);
        spentRef.current = spent;
        setState({ status: 'ready', spent });
        // Save now to land a backup, or when the sheet shrank a count since the last save.
        if (backup || (tracker && !sameSpent(stored, spent))) {
          dirtyRef.current = true;
          flush();
        }
      },
      (error: unknown) => {
        if (live) setState({ status: 'error', message: message(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [characterId, repository, flush, setState]);

  // The sheet changed: clamp spent counts to the new counts.
  useEffect(() => {
    itemsRef.current = items;
    const spent = spentRef.current;
    if (spent === null) return;
    const clamped = clampSpent(spent, items);
    if (clamped !== spent) commit(clamped);
  }, [items, commit]);

  // Retry a failed save when the page is hidden or closed, or the screen unmounts.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  const current = useCallback(() => spentRef.current, []);
  const state: TrackerState = loaded?.id === characterId ? loaded.state : { status: 'loading' };
  return { state, current, commit, saveError };
}
