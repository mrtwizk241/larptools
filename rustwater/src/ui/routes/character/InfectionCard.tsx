import { useId, useState, type FormEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import { TRAUMA_MAX, type InfectionSection, type Trauma } from '../../../engine/index.ts';
import { Button, Card, Dialog, Field } from '../../components/index.ts';
import { useCommand } from '../../data/engineHooks.ts';
import { ErrorList } from './ErrorList.tsx';
import type { CharacterView } from './view.ts';
import styles from './character.module.css';

/**
 * Infection (Connection for Aware): current level, starting level, and traumas ([PLAY-TRAUMA]).
 * Staff change the level with a reason (and an optional trauma), and edit or remove traumas.
 * Players read it.
 */
export function InfectionCard({
  view,
  infection,
}: {
  view: CharacterView;
  infection: InfectionSection;
}) {
  const [changing, setChanging] = useState(false);
  const [editing, setEditing] = useState<Trauma | null>(null);
  const [removing, setRemoving] = useState<Trauma | null>(null);
  const connection = infection.track === 'connection';
  const title = connection ? 'Connection' : 'Infection';
  const { traumas } = view.sheet;
  return (
    <Card title={title} className={styles.card ?? ''}>
      <dl className={styles.facts}>
        <div>
          <dt>{infection.label}</dt>
          <dd>
            <span className="num">{infection.current}</span> of{' '}
            <span className="num">{infection.max}</span>
          </dd>
        </div>
        <div>
          <dt>{connection ? 'Starting connection' : 'Starting infection'}</dt>
          <dd className="num">{infection.base + infection.extra}</dd>
        </div>
      </dl>
      {infection.reachedMax ? (
        <p className={styles.warnLine}>
          <TriangleAlert aria-hidden="true" className={styles.warnIcon} />
          {connection
            ? 'At the maximum: this character rises as a Restless.'
            : 'At the maximum: this character becomes a Risen.'}
        </p>
      ) : null}
      <h3 className={styles.subHeading}>Traumas</h3>
      {traumas.length === 0 ? (
        <p className={styles.muted}>No traumas.</p>
      ) : (
        <ul className={styles.bullets}>
          {traumas.map((trauma) => (
            <li key={trauma.id}>
              <span className={styles.text}>{trauma.text}</span>
              {view.isStaff ? (
                <span className={styles.itemActions}>
                  <Button
                    variant="ghost"
                    aria-label={`Edit trauma: ${trauma.text}`}
                    onClick={() => setEditing(trauma)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Remove trauma: ${trauma.text}`}
                    onClick={() => setRemoving(trauma)}
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
          <Button variant="ghost" onClick={() => setChanging(true)}>
            Change {infection.label}
          </Button>
        </div>
      ) : null}
      {changing ? (
        <InfectionDialog view={view} infection={infection} onClose={() => setChanging(false)} />
      ) : null}
      {editing ? (
        <EditTraumaDialog view={view} trauma={editing} onClose={() => setEditing(null)} />
      ) : null}
      {removing ? (
        <RemoveTraumaDialog view={view} trauma={removing} onClose={() => setRemoving(null)} />
      ) : null}
    </Card>
  );
}

function InfectionDialog({
  view,
  infection,
  onClose,
}: {
  view: CharacterView;
  infection: InfectionSection;
  onClose: () => void;
}) {
  const formId = useId();
  const command = useCommand(view.id);
  const [level, setLevel] = useState(String(infection.current));
  const [reason, setReason] = useState('');
  const [trauma, setTrauma] = useState('');
  const [errors, setErrors] = useState<{ level?: string; reason?: string }>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: { level?: string; reason?: string } = {};
    const value = level.trim();
    if (!/^\d+$/.test(value) || Number(value) > infection.max)
      found.level = `Enter a whole number from 0 to ${infection.max}.`;
    if (reason.trim() === '') found.reason = 'Enter a reason for the change.';
    setErrors(found);
    if (found.level || found.reason) return;
    const toLevel = Number(value);
    const traumaText = trauma.trim();
    const result = await command.run(
      {
        type: 'changeInfection',
        toLevel,
        reason: reason.trim(),
        ...(traumaText ? { trauma: traumaText } : {}),
      },
      {
        success: traumaText
          ? `${infection.label} is now ${toLevel}. Trauma added.`
          : `${infection.label} is now ${toLevel}.`,
      },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Change ${infection.label}`}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Save change
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p>
          Now <span className="num">{infection.current}</span> of{' '}
          <span className="num">{infection.max}</span>.
        </p>
        <Field label="New level" hint={`0 to ${infection.max}.`} required error={errors.level}>
          {(control) => (
            <input
              {...control}
              inputMode="numeric"
              autoComplete="off"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
          )}
        </Field>
        <Field label="Reason" hint="Recorded in the log." required error={errors.reason}>
          {(control) => (
            <textarea {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        <Field label="Trauma" hint="Optional. Added to the character's traumas.">
          {(control) => (
            <textarea
              {...control}
              maxLength={TRAUMA_MAX}
              value={trauma}
              onChange={(e) => setTrauma(e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function EditTraumaDialog({
  view,
  trauma,
  onClose,
}: {
  view: CharacterView;
  trauma: Trauma;
  onClose: () => void;
}) {
  const formId = useId();
  const command = useCommand(view.id);
  const [text, setText] = useState(trauma.text);
  const [error, setError] = useState<string | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim() === '') {
      setError('Type the trauma.');
      return;
    }
    setError(undefined);
    const result = await command.run(
      { type: 'editTrauma', traumaId: trauma.id, text: text.trim() },
      { success: 'Trauma saved.' },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit Trauma"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Save trauma
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <Field label="Trauma" required error={error}>
          {(control) => (
            <textarea
              {...control}
              maxLength={TRAUMA_MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function RemoveTraumaDialog({
  view,
  trauma,
  onClose,
}: {
  view: CharacterView;
  trauma: Trauma;
  onClose: () => void;
}) {
  const formId = useId();
  const command = useCommand(view.id);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim() === '') {
      setError('Enter a reason for removing it.');
      return;
    }
    setError(undefined);
    const result = await command.run(
      { type: 'removeTrauma', traumaId: trauma.id, reason: reason.trim() },
      { success: 'Trauma removed.' },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Remove Trauma"
      actions={
        <>
          <Button variant="danger" type="submit" form={formId}>
            Remove trauma
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={styles.form} onSubmit={(e) => void submit(e)}>
        <p className={styles.text}>{trauma.text}</p>
        <Field label="Reason" hint="Recorded in the log." required error={error}>
          {(control) => (
            <textarea {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}
