import { useId, useState, type FormEvent } from 'react';
import { preview, type BoonEntry } from '../../../../engine/index.ts';
import type { Request } from '../../../../engine/model.ts';
import { Button, Card, ConfirmDialog, Dialog, Field, useToast } from '../../../components/index.ts';
import { useCommand, type CommandApi } from '../../../data/engineHooks.ts';
import { useRepository } from '../../../data/hooks.ts';
import { newRequest } from '../../../data/requests.ts';
import { ErrorList } from '../ErrorList.tsx';
import { canRequest } from '../skills/requestParts.ts';
import type { CharacterView } from '../view.ts';
import shared from '../character.module.css';
import styles from '../profession/profession.module.css';

const STAT_NAMES: Record<string, string> = {
  maxHealth: 'Max Health',
  armor: 'Armor',
  weaponDamage: 'Weapon damage',
};

/** "+10 Max Health, +1 Weapon damage". */
function effectsText(effects: BoonEntry['effects']): string {
  return effects
    .map((e) => `${e.add >= 0 ? '+' : ''}${e.add} ${STAT_NAMES[e.stat] ?? e.stat}`)
    .join(', ');
}

/**
 * Boons: up to 3, each with its text and expiry. Players ask for a standard boon (staff approve
 * it in Staff tools); staff add a standard or a custom boon, and remove boons.
 */
export function BoonsCard({ view }: { view: CharacterView }) {
  const { ruleset, sheet, isStaff } = view;
  const command = useCommand(view.id);
  const [dialog, setDialog] = useState<'add' | 'custom' | 'ask' | null>(null);
  const [removing, setRemoving] = useState<BoonEntry | null>(null);
  const slots = ruleset.boons.rules.slots;
  // A free-text boon checks only the slot rule, so its reasons say whether any boon fits.
  const room = preview(ruleset, sheet, { type: 'addBoon', name: 'Boon' });
  const roomProps = room.allowed ? {} : { disabledReason: room.reasons.join(' ') };

  async function remove(boon: BoonEntry) {
    setRemoving(null);
    await command.run(
      { type: 'removeBoon', boonActionId: boon.actionId },
      { success: `Removed ${boon.name}.` },
    );
  }

  const close = () => {
    setDialog(null);
    command.clear();
  };

  return (
    <Card title="Boons" className={shared.card ?? ''}>
      <div className={shared.stack}>
        <p className={shared.muted}>
          <span className="num">{sheet.boons.length}</span> of <span className="num">{slots}</span>{' '}
          boon slots used.
        </p>
        {sheet.boons.length === 0 ? (
          <p>No boons.</p>
        ) : (
          <ul className={styles.items}>
            {sheet.boons.map((boon) => (
              <li key={boon.actionId} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.itemName}>
                    {boon.name}
                    {boon.boonId === null ? ' (custom)' : ''}
                  </span>
                  {isStaff ? (
                    <Button variant="ghost" onClick={() => setRemoving(boon)}>
                      Remove {boon.name}
                    </Button>
                  ) : null}
                </div>
                {boon.expires ? <p className={shared.muted}>{boon.expires}</p> : null}
                {boon.effects.length > 0 ? (
                  <p className={shared.muted}>{effectsText(boon.effects)}</p>
                ) : null}
                {boon.text ? <p className={shared.text}>{boon.text}</p> : null}
              </li>
            ))}
          </ul>
        )}
        {isStaff ? (
          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={!room.allowed}
              {...roomProps}
              onClick={() => setDialog('add')}
            >
              Add a boon
            </Button>
            <Button disabled={!room.allowed} {...roomProps} onClick={() => setDialog('custom')}>
              Add a custom boon
            </Button>
          </div>
        ) : canRequest(view) ? (
          <div className={styles.actions}>
            <Button
              variant="primary"
              disabled={!room.allowed}
              {...roomProps}
              onClick={() => setDialog('ask')}
            >
              Submit a boon for approval
            </Button>
          </div>
        ) : null}
        <ErrorList messages={dialog ? [] : command.errors.map((e) => e.message)} />
      </div>
      {dialog === 'add' ? <AddBoonDialog view={view} command={command} onClose={close} /> : null}
      {dialog === 'custom' ? (
        <CustomBoonDialog view={view} command={command} onClose={close} />
      ) : null}
      {dialog === 'ask' ? <AskBoonDialog view={view} onClose={close} /> : null}
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? 'boon'}?`}
        confirmLabel="Remove boon"
        danger
        onConfirm={() => {
          if (removing) void remove(removing);
        }}
        onCancel={() => setRemoving(null)}
      >
        <p>The boon leaves its slot. The removal is recorded in the log.</p>
      </ConfirmDialog>
    </Card>
  );
}

/** The standard boons, grouped by where they come from, with the chosen one's text. */
function BoonPicker({
  view,
  boonId,
  error,
  onChange,
}: {
  view: CharacterView;
  boonId: string;
  error: string;
  onChange: (id: string) => void;
}) {
  const { ruleset } = view;
  const boon = boonId ? ruleset.boonsById[boonId] : undefined;
  const expiry = boon
    ? ruleset.boons.expiryKinds.find((k) => k.id === boon.expiry)?.text
    : undefined;
  return (
    <>
      <Field label="Boon" required error={error}>
        {(control) => (
          <select {...control} value={boonId} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose a boon</option>
            {ruleset.boons.origins.map((origin) => (
              <optgroup key={origin.id} label={origin.name}>
                {ruleset.boons.boons
                  .filter((b) => b.origin === origin.id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        )}
      </Field>
      {boon ? (
        <div className={shared.rule}>
          <h3 className={shared.ruleName}>{boon.name}</h3>
          {expiry ? <p className={shared.muted}>{expiry}</p> : null}
          {boon.restrictedTo ? (
            <p className={shared.muted}>
              Only for{' '}
              {boon.restrictedTo.map((id) => ruleset.ancestriesById[id]?.name ?? id).join(', ')}.
            </p>
          ) : null}
          <p className={shared.text}>{boon.text}</p>
        </div>
      ) : null}
    </>
  );
}

function AddBoonDialog({
  view,
  command,
  onClose,
}: {
  view: CharacterView;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const [boonId, setBoonId] = useState('');
  const [error, setError] = useState('');
  const boon = boonId ? view.ruleset.boonsById[boonId] : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!boon) return setError('Choose a boon.');
    setError('');
    const result = await command.run(
      { type: 'addBoon', boonId: boon.id },
      { success: `Added ${boon.name}.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a boon"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Add boon
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <BoonPicker
          view={view}
          boonId={boonId}
          error={error}
          onChange={(id) => {
            setBoonId(id);
            setError('');
            command.clear();
          }}
        />
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

/** Player: ask staff to put a standard boon on the sheet. */
function AskBoonDialog({ view, onClose }: { view: CharacterView; onClose: () => void }) {
  const formId = useId();
  const repository = useRepository();
  const toast = useToast();
  const [boonId, setBoonId] = useState('');
  const [givenBy, setGivenBy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const boon = boonId ? view.ruleset.boonsById[boonId] : undefined;
  const draft: Request | null = boon
    ? {
        id: 'draft',
        characterId: view.id,
        createdAt: new Date(0).toISOString(),
        kind: 'boon',
        boonId: boon.id,
        teacher: '',
        note: '',
        status: 'draft',
      }
    : null;
  const check = draft
    ? preview(view.ruleset, view.sheet, { type: 'approveRequest', request: draft })
    : null;
  const reasons = [...new Set(check?.errors.map((e) => e.message) ?? [])];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!boon) return setError('Choose a boon.');
    setError('');
    setSaving(true);
    try {
      await repository.saveRequest(
        newRequest({
          kind: 'boon',
          characterId: view.id,
          boonId: boon.id,
          teacher: givenBy,
          note,
        }),
      );
      toast.show(`Sent ${boon.name} to staff. Their answer shows under My learning requests.`);
      onClose();
    } catch (e) {
      setSaveError(`The request could not be sent: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Submit a boon for approval"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Send to staff
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p>Choose the boon you received. Staff approve it and it goes on your sheet.</p>
        <BoonPicker
          view={view}
          boonId={boonId}
          error={error}
          onChange={(id) => {
            setBoonId(id);
            setError('');
          }}
        />
        <Field label="Who gave it to you?" hint="Optional: the crafter or the event.">
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              maxLength={200}
              value={givenBy}
              onChange={(e) => setGivenBy(e.target.value)}
            />
          )}
        </Field>
        <Field label="Note" hint="Optional: anything staff should know.">
          {(control) => (
            <textarea
              {...control}
              maxLength={5000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        {reasons.length > 0 ? (
          <div className={shared.stack}>
            <p className={shared.lead}>Staff may not be able to approve this yet:</p>
            <ul className={shared.warningList}>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {saveError ? <p role="alert">{saveError}</p> : null}
      </form>
    </Dialog>
  );
}

const EFFECT_FIELDS = [
  { stat: 'maxHealth', label: 'Max Health bonus' },
  { stat: 'armor', label: 'Armor bonus' },
  { stat: 'weaponDamage', label: 'Weapon damage bonus' },
] as const;

/** Staff: a boon outside the standard list (plot rewards, other rulings). */
function CustomBoonDialog({
  view,
  command,
  onClose,
}: {
  view: CharacterView;
  command: CommandApi;
  onClose: () => void;
}) {
  const formId = useId();
  const kinds = view.ruleset.boons.expiryKinds;
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [expiry, setExpiry] = useState(kinds[0]?.id ?? '');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter the boon name.');
    setError('');
    const effects = EFFECT_FIELDS.flatMap(({ stat }) => {
      const n = Number(amounts[stat] ?? '');
      return Number.isInteger(n) && n !== 0 ? [{ stat, add: n }] : [];
    });
    const expires = kinds.find((k) => k.id === expiry)?.text;
    const result = await command.run(
      {
        type: 'addBoon',
        name: trimmed,
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(expires ? { expires } : {}),
        ...(effects.length > 0 ? { effects } : {}),
      },
      { success: `Added ${trimmed}.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a custom boon"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Add boon
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p>For a boon that is not in the rulebook, such as a plot reward. It uses a boon slot.</p>
        <Field label="Boon name" required error={error}>
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="What it does" hint="Optional. The player sees this on their sheet.">
          {(control) => (
            <textarea
              {...control}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <Field label="How long it lasts">
          {(control) => (
            <select {...control} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.text}
                </option>
              ))}
            </select>
          )}
        </Field>
        {EFFECT_FIELDS.map(({ stat, label }) => (
          <Field key={stat} label={label} hint="Optional. Counted on the Play Tracker.">
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="numeric"
                value={amounts[stat] ?? ''}
                onChange={(e) => setAmounts((a) => ({ ...a, [stat]: e.target.value }))}
              />
            )}
          </Field>
        ))}
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}
