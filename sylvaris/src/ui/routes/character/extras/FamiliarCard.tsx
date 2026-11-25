// The Familiar: name, form, quality, trick slots, and tricks. Staff set it (a new set replaces
// it) and remove it with a reason ([FAM-RULES]).
import { useId, useState, type FormEvent } from 'react';
import type { FamiliarSection, SetFamiliarCommand } from '../../../../engine/index.ts';
import { Button, Card, Dialog, Field } from '../../../components/index.ts';
import { useCommand, type CommandApi } from '../../../data/engineHooks.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { levelName, plural } from '../journals/events.ts';
import { trickName, trickSkillOptions, trickSlots } from './extrasModel.ts';
import shared from '../character.module.css';
import styles from '../journals/screens.module.css';

const QUALITIES = ['basic', 'expert', 'master', 'grandmaster'] as const;
type Quality = (typeof QUALITIES)[number];

interface TrickRow {
  key: number;
  id: string;
  slots: number;
  detail: string;
}

export function FamiliarCard({ view }: { view: CharacterView }) {
  const { ruleset, sheet, isStaff } = view;
  const command = useCommand(view.id);
  const [open, setOpen] = useState<'set' | 'remove' | null>(null);
  const f = sheet.familiar;
  const close = () => {
    command.clear();
    setOpen(null);
  };
  return (
    <Card title="Familiar" className={shared.card ?? ''}>
      <div className={shared.stack}>
        {f ? (
          <>
            <p className={shared.lead}>
              {f.name}
              {f.form ? `, ${f.form}` : ''}
            </p>
            <p className={shared.muted}>
              {levelName(f.quality)} quality.{' '}
              {f.stable ? 'Stable.' : 'Unstable: leaves at the end of the event.'} Trick slots:{' '}
              {f.slotsUsed} of {f.trickSlots} used.
            </p>
            {f.tricks.length === 0 ? (
              <p>No tricks yet.</p>
            ) : (
              <ul className={styles.bullets} aria-label="Tricks">
                {f.tricks.map((t) => (
                  <li key={t.id}>
                    {t.kind === 'skill' ? t.name : trickName(ruleset, t.id)}
                    {t.detail ? ` (${t.detail})` : ''}: {plural(t.slots, 'slot')}
                    {t.level ? `, ${levelName(t.level)}` : ''}
                    {t.uses !== null ? `, ${plural(t.uses, 'use')} per re-pop` : ''}.
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p>No Familiar.</p>
        )}
        {isStaff ? (
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setOpen('set')}>
              {f ? 'Edit the Familiar' : 'Add a Familiar'}
            </Button>
            {f ? (
              <Button variant="ghost" onClick={() => setOpen('remove')}>
                Remove the Familiar
              </Button>
            ) : null}
          </div>
        ) : null}
        {open === null ? <ErrorList messages={command.errors.map((e) => e.message)} /> : null}
      </div>
      {open === 'set' ? (
        <SetDialog view={view} familiar={f} command={command} onClose={close} />
      ) : null}
      {open === 'remove' && f ? (
        <RemoveFamiliarDialog name={f.name} command={command} onClose={close} />
      ) : null}
    </Card>
  );
}

function SetDialog({
  view,
  familiar,
  command,
  onClose,
}: {
  view: CharacterView;
  familiar: FamiliarSection | null;
  command: CommandApi;
  onClose: () => void;
}) {
  const { ruleset, sheet } = view;
  const formId = useId();
  const [name, setName] = useState(familiar?.name ?? '');
  const [form, setForm] = useState(familiar?.form ?? '');
  const [quality, setQuality] = useState<Quality>(
    (QUALITIES as readonly string[]).includes(familiar?.quality ?? '')
      ? (familiar?.quality as Quality)
      : 'basic',
  );
  const [stable, setStable] = useState(familiar?.stable ?? true);
  const [rows, setRows] = useState<TrickRow[]>(
    (familiar?.tricks ?? []).map((t, i) => ({
      key: i,
      id: t.id,
      slots: t.slots,
      detail: t.detail ?? '',
    })),
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const [error, setError] = useState('');
  const slots = trickSlots(ruleset, quality);
  const used = rows.reduce((n, r) => n + r.slots, 0);
  const skills = trickSkillOptions(ruleset, sheet);
  const specials = ruleset.familiars.specialTricks.map(
    (t) => [t.id, trickName(ruleset, t.id)] as [string, string],
  );
  const maxPerSkill = ruleset.familiars.rules.skillTricks.maxSlotsPerSkill;

  function update(key: number, patch: Partial<TrickRow>) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    if (!name.trim()) return setError('Name the Familiar.');
    if (rows.some((r) => !r.id)) return setError('Choose a trick in every row, or remove it.');
    setError('');
    const cmd: SetFamiliarCommand = {
      type: 'setFamiliar',
      name: name.trim(),
      ...(form.trim() ? { form: form.trim() } : {}),
      quality,
      stable,
      tricks: rows.map((r) => ({
        id: r.id,
        slots: r.slots,
        ...(r.detail.trim() ? { detail: r.detail.trim() } : {}),
      })),
    };
    const result = await command.run(cmd, { success: `${name.trim()} is saved.` });
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={familiar ? 'Edit the Familiar' : 'Add a Familiar'}
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Save the Familiar
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <Field label="Name" required>
          {(control) => (
            <input
              {...control}
              value={name}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Form" hint="For example a raven.">
          {(control) => (
            <input
              {...control}
              value={form}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setForm(e.target.value)}
            />
          )}
        </Field>
        <Field label="Quality">
          {(control) => (
            <select
              {...control}
              value={quality}
              onChange={(e) => setQuality(e.target.value as Quality)}
            >
              {QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {levelName(q)} ({plural(trickSlots(ruleset, q), 'trick slot')})
                </option>
              ))}
            </select>
          )}
        </Field>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={stable} onChange={(e) => setStable(e.target.checked)} />
          <span>Stable</span>
        </label>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Tricks</legend>
          <p className={styles.count} aria-live="polite">
            {used} of {plural(slots, 'trick slot')} used.
          </p>
          {rows.map((row, index) => {
            const special = Boolean(ruleset.specialTricksById[row.id]);
            return (
              <div key={row.key} className={styles.editRow}>
                <Field label={`Trick ${index + 1}`}>
                  {(control) => (
                    <select
                      {...control}
                      value={row.id}
                      onChange={(e) =>
                        update(row.key, {
                          id: e.target.value,
                          slots: ruleset.specialTricksById[e.target.value] ? 1 : row.slots,
                        })
                      }
                    >
                      <option value="">Choose</option>
                      <optgroup label="Special tricks">
                        {specials.map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Skills">
                        {skills.map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  )}
                </Field>
                <Field label={`Trick ${index + 1} slots`}>
                  {(control) => (
                    <select
                      {...control}
                      value={String(row.slots)}
                      disabled={special}
                      onChange={(e) => update(row.key, { slots: Number(e.target.value) })}
                    >
                      {Array.from({ length: special ? 1 : maxPerSkill }, (_, i) => i + 1).map(
                        (n) => (
                          <option key={n} value={String(n)}>
                            {n}
                          </option>
                        ),
                      )}
                    </select>
                  )}
                </Field>
                <Field label={`Trick ${index + 1} detail`}>
                  {(control) => (
                    <input
                      {...control}
                      value={row.detail}
                      maxLength={200}
                      autoComplete="off"
                      onChange={(e) => update(row.key, { detail: e.target.value })}
                    />
                  )}
                </Field>
                <Button
                  variant="ghost"
                  aria-label={`Remove trick ${index + 1}`}
                  onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                >
                  Remove trick {index + 1}
                </Button>
              </div>
            );
          })}
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => {
                setRows((list) => [...list, { key: nextKey, id: '', slots: 1, detail: '' }]);
                setNextKey((n) => n + 1);
              }}
            >
              Add a trick
            </Button>
          </div>
        </fieldset>
        <ErrorList
          messages={[...(error ? [error] : []), ...command.errors.map((e) => e.message)]}
        />
      </form>
    </Dialog>
  );
}

function RemoveFamiliarDialog({
  name,
  command,
  onClose,
}: {
  name: string;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    if (!reason.trim()) return setError('Give a reason.');
    setError('');
    const result = await command.run(
      { type: 'removeFamiliar', reason: reason.trim() },
      { success: `${name} is removed.` },
    );
    if (result.ok) onClose();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Remove ${name}?`}
      actions={
        <>
          <Button variant="danger" type="submit" form={formId}>
            Remove the Familiar
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <Field label="Reason" required error={error}>
          {(control) => (
            <input
              {...control}
              value={reason}
              maxLength={2000}
              autoComplete="off"
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}
