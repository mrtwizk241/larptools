import { useRef, useState, type ChangeEvent } from 'react';
import { Download, Upload, X } from 'lucide-react';
import type { Action, GameEvent } from '../../../engine/model.ts';
import {
  buildBackupFile,
  fileNameFor,
  parseBackupFile,
  readImportFile,
  serializeFile,
} from '../../../io/index.ts';
import { Button, Card, Dialog, IconButton, useToast } from '../../components/index.ts';
import { useRepository, useSettings } from '../../data/hooks.ts';
import {
  charactersToSave,
  planRestore,
  type RestoreEntry,
  type RestorePlan,
} from '../../data/restore.ts';
import { rulesetFor, useRuleset } from '../../data/rulesetContext.ts';
import { saveTextFile } from '../../data/saveFile.ts';
import { summarizeCharacter } from '../../data/summary.ts';
import { actionLookup, describeAction } from '../../lib/describeAction.ts';
import { dateTimeText } from '../../lib/names.ts';
import styles from './settings.module.css';
import { PUBLIC_MODE } from '../../../publicMode.ts';

/** Added actions listed per character; the rest are counted. */
const MAX_LISTED = 20;

type PendingRestore = { plan: RestorePlan; events: GameEvent[] };
type Problem = { title: string; details: string[] };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function actorText(action: Action): string {
  const role =
    action.actor.role === 'staff' ? 'Staff' : action.actor.role === 'player' ? 'Player' : 'System';
  return action.actor.name ? `${role}: ${action.actor.name}` : role;
}

/** Data: back up all characters (anyone), restore from a backup (staff only). */
export function DataCard() {
  const repository = useRepository();
  const { settings } = useSettings();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  // Restore replaces data: focus starts on Cancel so Enter never restores by accident.
  const cancelRestore = useRef<HTMLButtonElement>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [replaceIds, setReplaceIds] = useState<ReadonlySet<string>>(new Set());

  const isStaff = settings?.mode === 'staff';

  async function backUp() {
    setProblem(null);
    try {
      const [characters, events] = await Promise.all([
        repository.listCharacters(),
        repository.listEvents(),
      ]);
      const file = buildBackupFile({ characters: characters.items, events: events.items });
      const date = file.exportedAt.slice(0, 10);
      const result = await saveTextFile(
        serializeFile(file),
        fileNameFor('backup', `sylvaris-backup-${date}`),
        'Sylvaris backup',
      );
      if (result !== 'cancelled') {
        const count = plural(characters.items.length, 'character', 'characters');
        toast.show(
          result === 'shared' ? `Backup of ${count} shared.` : `Backup of ${count} saved.`,
        );
      }
      if (characters.invalid.length > 0) {
        setProblem({
          title: `${plural(characters.invalid.length, 'saved character', 'saved characters')} could not be read and ${characters.invalid.length === 1 ? 'was' : 'were'} left out of the backup.`,
          details: [],
        });
      }
    } catch (error) {
      setProblem({ title: 'The backup could not be made.', details: [message(error)] });
    }
  }

  async function onFilePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProblem(null);
    const text = await readImportFile(file);
    const parsed = text.ok ? parseBackupFile(text.value) : text;
    if (!parsed.ok) {
      setProblem({ title: 'This backup could not be restored.', details: parsed.errors });
      return;
    }
    try {
      const local = await repository.listCharacters();
      setReplaceIds(new Set());
      setPending({
        plan: planRestore(local.items, parsed.value.characters),
        events: parsed.value.events,
      });
    } catch (error) {
      setProblem({ title: 'This backup could not be restored.', details: [message(error)] });
    }
  }

  async function restore() {
    const current = pending;
    setPending(null);
    if (!current) return;
    try {
      const toSave = charactersToSave(current.plan, replaceIds);
      // A restore overwrites what the server has for these characters.
      for (const character of toSave) await repository.saveCharacter(character, { replace: true });
      for (const gameEvent of current.events) await repository.saveEvent(gameEvent);
      toast.show(
        toSave.length > 0
          ? `Restored ${plural(toSave.length, 'character', 'characters')}.`
          : 'Nothing needed restoring.',
      );
    } catch (error) {
      setProblem({ title: 'The restore did not finish.', details: [message(error)] });
    }
  }

  function toggleReplace(id: string, on: boolean) {
    setReplaceIds((ids) => {
      const next = new Set(ids);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Card title="Data">
      <div className={styles.stack}>
        <p>
          {PUBLIC_MODE
            ? "A backup file holds every test build saved in this browser. Keep one somewhere safe: clearing this site's data deletes your test builds."
            : 'A backup file holds every character and event on this device. Settings and the PIN are not included.'}
        </p>
        {problem ? (
          <div role="alert" className={styles.alert}>
            <div className={styles.alertText}>
              <p className={styles.alertTitle}>{problem.title}</p>
              {problem.details.length > 0 ? (
                <ul>
                  {problem.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <IconButton
              aria-label="Dismiss message"
              icon={<X />}
              onClick={() => setProblem(null)}
            />
          </div>
        ) : null}
        <div className={styles.row}>
          <Button variant="secondary" icon={<Download />} onClick={() => void backUp()}>
            Back up all characters
          </Button>
          {isStaff ? (
            <Button
              variant="secondary"
              icon={<Upload />}
              onClick={() => fileInput.current?.click()}
            >
              Restore from backup
            </Button>
          ) : null}
        </div>
        {isStaff ? null : <p className={styles.note}>Restoring a backup is for staff.</p>}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => void onFilePicked(event)}
        />
      </div>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Restore from backup?"
        initialFocusRef={cancelRestore}
        actions={
          <>
            <Button variant="primary" onClick={() => void restore()}>
              Restore
            </Button>
            <Button ref={cancelRestore} variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </>
        }
      >
        {pending ? (
          <RestoreSummary plan={pending.plan} replaceIds={replaceIds} onToggle={toggleReplace} />
        ) : null}
      </Dialog>
    </Card>
  );
}

function RestoreSummary({
  plan,
  replaceIds,
  onToggle,
}: {
  plan: RestorePlan;
  replaceIds: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <div className={styles.stack}>
      <ul className={styles.summary}>
        <li>New: {plan.added.length}</li>
        <li>Unchanged: {plan.unchanged.length}</li>
        <li>Newer in the backup, will update: {plan.updated.length}</li>
        <li>Newer here, kept: {plan.newerHere.length}</li>
        <li>Conflicts: {plan.conflicts.length}</li>
      </ul>
      {plan.updated.length > 0 ? (
        <section className={styles.stack} aria-label="Updates">
          <p className={styles.legend}>Updates</p>
          {plan.updated.map((entry) => (
            <AddedActions
              key={entry.incoming.id}
              entry={entry}
              intro={`The backup adds to ${summarizeCharacter(entry.incoming).characterName}`}
            />
          ))}
        </section>
      ) : null}
      {plan.conflicts.length > 0 ? (
        <fieldset className={styles.conflicts}>
          <legend className={styles.legend}>Conflicts</legend>
          <p className={styles.note}>
            These characters have a different history here and in the backup. They are skipped
            unless you tick Replace.
          </p>
          {plan.conflicts.map((entry) => {
            const { incoming } = entry;
            const name = summarizeCharacter(incoming).characterName;
            return (
              <div key={incoming.id} className={styles.stack}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={replaceIds.has(incoming.id)}
                    onChange={(event) => onToggle(incoming.id, event.target.checked)}
                  />
                  <span>Replace {name} with the backup copy</span>
                </label>
                <AddedActions entry={entry} intro={`Replacing ${name} adds`} />
              </div>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}

/** The backup's actions a restore would bring in for one character, at most MAX_LISTED. */
function AddedActions({ entry, intro }: { entry: RestoreEntry; intro: string }) {
  const fallback = useRuleset();
  const { incoming, addedActions } = entry;
  const ruleset = rulesetFor(incoming.rulesetId) ?? fallback;
  const lookup = actionLookup(incoming.actions);
  const shown = addedActions.slice(0, MAX_LISTED);
  const more = addedActions.length - shown.length;
  return (
    <div className={styles.stack}>
      <p>
        {intro} {plural(addedActions.length, 'entry', 'entries')}:
      </p>
      <ol className={styles.added}>
        {shown.map((action) => {
          const described = describeAction(ruleset, action, lookup);
          return (
            <li key={action.id}>
              <span className={styles.addedLabel}>{described.label}</span> {described.summary}
              <span className={styles.meta}>
                {dateTimeText(action.at)} · {actorText(action)}
              </span>
              {action.note ? <span className={styles.meta}>Note: {action.note}</span> : null}
            </li>
          );
        })}
      </ol>
      {more > 0 ? <p className={styles.note}>and {more} more.</p> : null}
    </div>
  );
}
