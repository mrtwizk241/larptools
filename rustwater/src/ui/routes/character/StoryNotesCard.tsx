// Story Notes (I-14): visible story notes and knowledges from the action log, plus, for staff,
// notes hidden from the player. Hidden notes live on the server only (never in the log), so the
// player's copy of the character never holds them.
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api, errorMessage } from '../../../api/client.ts';
import type { HiddenNote } from '../../../api/contract.ts';
import { STORY_NOTE_MAX } from '../../../engine/index.ts';
import { Alert, Badge, Button, Card, Dialog, Field, useToast } from '../../components/index.ts';
import { useCommand } from '../../data/engineHooks.ts';
import { useRepository } from '../../data/hooks.ts';
import { dateText } from '../../lib/names.ts';
import { ErrorList } from './ErrorList.tsx';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

/** One row of the list: a visible note or knowledge, or a staff-only hidden note. */
interface NoteRow {
  id: string;
  text: string;
  at: string;
  kind: 'note' | 'knowledge' | 'hidden';
}

type HiddenState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; notes: HiddenNote[] }
  | { status: 'error'; message: string };

/**
 * Hidden notes for staff on a live character with the server. Off for players, test builds
 * (ADR 0007), and the device-only mode. Not cached for offline use.
 */
function useHiddenNotes(view: CharacterView): HiddenState & { reload: () => Promise<void> } {
  const repository = useRepository();
  const enabled = repository.server === true && view.isStaff && view.meta?.kind !== 'test';
  const [state, setState] = useState<HiddenState>(
    enabled ? { status: 'loading' } : { status: 'off' },
  );
  const load = useCallback(async (): Promise<HiddenState> => {
    if (!enabled) return { status: 'off' };
    try {
      return { status: 'ready', notes: (await api.hiddenNotes(view.id)).items };
    } catch (error) {
      return { status: 'error', message: errorMessage(error) };
    }
  }, [enabled, view.id]);
  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);
  const reload = useCallback(async () => {
    setState(await load());
  }, [load]);
  return { ...state, reload };
}

/** Visible notes and hidden notes in one list, newest first. */
function noteRows(view: CharacterView, hidden: readonly HiddenNote[]): NoteRow[] {
  const rows: NoteRow[] = [
    ...view.sheet.storyNotes.map((n) => ({
      id: n.id,
      text: n.text,
      at: n.addedAt,
      kind: n.source,
    })),
    ...hidden.map((n) => ({ id: n.id, text: n.text, at: n.createdAt, kind: 'hidden' as const })),
  ];
  // Stable sort: notes added at the same moment keep log order, reversed with the rest.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.at.localeCompare(a.row.at) || b.index - a.index)
    .map(({ row }) => row);
}

export function StoryNotesCard({ view }: { view: CharacterView }) {
  const hidden = useHiddenNotes(view);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<NoteRow | null>(null);
  const [removing, setRemoving] = useState<NoteRow | null>(null);
  const rows = noteRows(view, hidden.status === 'ready' ? hidden.notes : []);
  const canHide = hidden.status === 'ready';
  return (
    <Card title="Story Notes" className={styles.card ?? ''}>
      {hidden.status === 'error' ? (
        <Alert>Hidden notes could not be loaded: {hidden.message}</Alert>
      ) : null}
      {rows.length === 0 ? (
        <p className={styles.muted}>No story notes yet.</p>
      ) : (
        <ul className={styles.noteList}>
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`} className={styles.note}>
              <p className={styles.text}>{row.text}</p>
              <p className={styles.noteMeta}>
                <span>{dateText(row.at)}</span>
                {row.kind === 'knowledge' ? <Badge kind="player">Knowledge</Badge> : null}
                {row.kind === 'hidden' ? <Badge kind="staff">Hidden</Badge> : null}
              </p>
              {view.isStaff ? (
                <span className={styles.itemActions}>
                  <Button
                    variant="ghost"
                    aria-label={`Edit story note: ${row.text}`}
                    onClick={() => setEditing(row)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Remove story note: ${row.text}`}
                    onClick={() => setRemoving(row)}
                  >
                    Remove
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {view.isStaff ? (
        <div className={styles.cardActions}>
          <Button variant="ghost" icon={<Plus />} onClick={() => setAdding(true)}>
            Add a story note
          </Button>
        </div>
      ) : null}
      {adding ? (
        <NoteDialog
          view={view}
          canHide={canHide}
          onSaved={hidden.reload}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {editing ? (
        <NoteDialog
          view={view}
          row={editing}
          canHide={false}
          onSaved={hidden.reload}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {removing ? (
        <RemoveNoteDialog
          view={view}
          row={removing}
          onRemoved={hidden.reload}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </Card>
  );
}

/** Add a story note (optionally hidden from the player), or edit one. */
function NoteDialog({
  view,
  row,
  canHide,
  onSaved,
  onClose,
}: {
  view: CharacterView;
  row?: NoteRow;
  canHide: boolean;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const formId = useId();
  const command = useCommand(view.id);
  const toast = useToast();
  const [text, setText] = useState(row?.text ?? '');
  const [hide, setHide] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveHidden(save: () => Promise<unknown>, success: string) {
    setSaving(true);
    try {
      await save();
      await onSaved();
      toast.show(success);
      onClose();
    } catch (failure) {
      setProblem(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (value === '') {
      setError('Type the story note.');
      return;
    }
    setError(undefined);
    setProblem(null);
    if (saving) return;
    if (row?.kind === 'hidden') {
      await saveHidden(() => api.editHiddenNote(view.id, row.id, value), 'Story note saved.');
      return;
    }
    if (!row && hide) {
      await saveHidden(() => api.addHiddenNote(view.id, value), 'Hidden story note added.');
      return;
    }
    const result = await command.run(
      row
        ? { type: 'editStoryNote', noteId: row.id, text: value }
        : { type: 'addStoryNote', text: value },
      { success: row ? 'Story note saved.' : 'Story note added.' },
    );
    if (result.ok) onClose();
  }

  const checkId = `${formId}-hidden`;
  return (
    <Dialog
      open
      onClose={onClose}
      title={row ? 'Edit Story Note' : 'Add a Story Note'}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            {row ? 'Save story note' : 'Add story note'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        {row?.kind === 'hidden' ? <p className={styles.muted}>Hidden from the player.</p> : null}
        <Field label="Story note" required error={error}>
          {(control) => (
            <textarea
              {...control}
              maxLength={STORY_NOTE_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        {canHide && !row ? (
          <div className={styles.check}>
            <input
              id={checkId}
              type="checkbox"
              checked={hide}
              aria-describedby={`${checkId}-detail`}
              onChange={(e) => setHide(e.target.checked)}
            />
            <span className={styles.checkText}>
              <label htmlFor={checkId} className={styles.checkLabel}>
                Hidden from player
              </label>
              <span id={`${checkId}-detail`} className={styles.muted}>
                Only staff see it. It is not in the character's log or files.
              </span>
            </span>
          </div>
        ) : null}
        {problem ? <Alert>{problem}</Alert> : null}
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function RemoveNoteDialog({
  view,
  row,
  onRemoved,
  onClose,
}: {
  view: CharacterView;
  row: NoteRow;
  onRemoved: () => Promise<void>;
  onClose: () => void;
}) {
  const formId = useId();
  const command = useCommand(view.id);
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const hidden = row.kind === 'hidden';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    if (hidden) {
      try {
        await api.deleteHiddenNote(view.id, row.id);
        await onRemoved();
        toast.show('Story note removed.');
        onClose();
      } catch (failure) {
        setProblem(errorMessage(failure));
      }
      return;
    }
    const result = await command.run(
      {
        type: 'removeStoryNote',
        noteId: row.id,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
      { success: 'Story note removed.' },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Remove Story Note"
      actions={
        <>
          <Button variant="danger" type="submit" form={formId}>
            Remove story note
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p className={styles.text}>{row.text}</p>
        {hidden ? (
          <p>This hidden note is deleted for good.</p>
        ) : (
          <Field label="Reason" hint="Optional. Recorded in the log.">
            {(control) => (
              <textarea {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
        )}
        {problem ? <Alert>{problem}</Alert> : null}
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}
