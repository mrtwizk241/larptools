// Boons (greater and lesser slots), familiarized places, and items owed. Staff add and remove.
import { useId, useState, type ReactNode } from 'react';
import type { BoonEntry, LocationEntry } from '../../../../engine/index.ts';
import { Badge, Button, Card, Dialog, Field } from '../../../components/index.ts';
import { useCommand, type CommandApi } from '../../../data/engineHooks.ts';
import { dateText } from '../../../lib/names.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { eventLabel, eventsNewestFirst } from '../journals/events.ts';
import { locationsText } from './extrasModel.ts';
import shared from '../character.module.css';
import styles from '../journals/screens.module.css';

/** A dialog with one form: submit and cancel buttons, and the command's errors. */
function FormDialog({
  title,
  submitLabel,
  danger,
  command,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  submitLabel: string;
  danger?: boolean;
  command: CommandApi;
  onSubmit: () => Promise<void>;
  onClose: () => void;
  children: ReactNode;
}) {
  const formId = useId();
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      actions={
        <>
          <Button variant={danger ? 'danger' : 'primary'} type="submit" form={formId}>
            {submitLabel}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className={shared.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (!command.running) void onSubmit();
        }}
      >
        {children}
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function ReasonField({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label="Reason" required error={error}>
      {(control) => (
        <input
          {...control}
          value={value}
          maxLength={2000}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

// ---- Boons ----

export function BoonsCard({ view }: { view: CharacterView }) {
  const { sheet, isStaff } = view;
  const command = useCommand(view.id);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<BoonEntry | null>(null);
  const b = sheet.boons;
  const close = () => {
    command.clear();
    setAdding(false);
    setRemoving(null);
  };
  return (
    <Card title="Boons" className={shared.card ?? ''}>
      <div className={shared.stack}>
        <dl className={styles.numbers}>
          <div className={styles.number}>
            <dt>Greater</dt>
            <dd>
              {b.greaterUsed} of {b.greaterSlots}
            </dd>
          </div>
          <div className={styles.number}>
            <dt>Lesser</dt>
            <dd>
              {b.lesserUsed} of {b.lesserSlots}
            </dd>
          </div>
        </dl>
        {b.entries.length === 0 ? (
          <p>No boons.</p>
        ) : (
          <ul className={styles.items} aria-label="Boons">
            {b.entries.map((e) => (
              <li key={e.actionId} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.itemName}>{e.name}</span>
                  <span className={styles.meta}>
                    {e.slot === 'greater' ? 'Greater slot' : 'Lesser slot'}
                  </span>
                </div>
                <p className={styles.meta}>Added {dateText(e.addedAt)}.</p>
                {isStaff ? (
                  <div className={styles.actions}>
                    <Button
                      variant="ghost"
                      aria-label={`Remove boon: ${e.name}`}
                      onClick={() => setRemoving(e)}
                    >
                      Remove boon
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {isStaff ? (
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Add a boon
            </Button>
          </div>
        ) : null}
        {!adding && !removing ? (
          <ErrorList messages={command.errors.map((e) => e.message)} />
        ) : null}
      </div>
      {adding ? <AddBoonDialog view={view} command={command} onClose={close} /> : null}
      {removing ? <RemoveBoonDialog boon={removing} command={command} onClose={close} /> : null}
    </Card>
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
  const { ruleset } = view;
  const mutagens = ruleset.recipes.filter((r) => r.boonSlot);
  const [recipeId, setRecipeId] = useState('');
  const [name, setName] = useState('');
  const [slot, setSlot] = useState<'greater' | 'lesser'>('lesser');
  const [error, setError] = useState('');
  const recipe = recipeId ? ruleset.recipesById[recipeId] : undefined;

  async function submit() {
    if (!recipe && !name.trim()) return setError('Choose a boon or type its name.');
    setError('');
    const result = await command.run(
      recipe
        ? { type: 'addBoon', recipeId: recipe.id }
        : { type: 'addBoon', name: name.trim(), slot },
      { success: `Added ${recipe?.name ?? name.trim()}.` },
    );
    if (result.ok) onClose();
  }

  return (
    <FormDialog
      title="Add a boon"
      submitLabel="Add boon"
      command={command}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Boon" hint="A mutagen recipe, or Other to type the name." error={error}>
        {(control) => (
          <select {...control} value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
            <option value="">Other</option>
            {mutagens.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.boonSlot === 'greater' ? 'greater' : 'lesser'})
              </option>
            ))}
          </select>
        )}
      </Field>
      {recipe ? null : (
        <>
          <Field label="Name">
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
          <Field label="Slot">
            {(control) => (
              <select
                {...control}
                value={slot}
                onChange={(e) => setSlot(e.target.value === 'greater' ? 'greater' : 'lesser')}
              >
                <option value="lesser">Lesser</option>
                <option value="greater">Greater</option>
              </select>
            )}
          </Field>
        </>
      )}
    </FormDialog>
  );
}

function RemoveBoonDialog({
  boon,
  command,
  onClose,
}: {
  boon: BoonEntry;
  command: CommandApi;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  async function submit() {
    const r = reason.trim();
    const result = await command.run(
      { type: 'removeBoon', boonActionId: boon.actionId, ...(r ? { reason: r } : {}) },
      { success: `Removed ${boon.name}.` },
    );
    if (result.ok) onClose();
  }
  return (
    <FormDialog
      title={`Remove ${boon.name}?`}
      submitLabel="Remove boon"
      danger
      command={command}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Reason">
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
    </FormDialog>
  );
}

// ---- Familiarized places ----

export function LocationsCard({ view }: { view: CharacterView }) {
  const { sheet, isStaff } = view;
  const command = useCommand(view.id);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<LocationEntry | null>(null);
  const l = sheet.locations;
  const full = l.used >= l.capacity;
  const close = () => {
    command.clear();
    setAdding(false);
    setRemoving(null);
  };
  return (
    <Card title="Familiarized places" className={shared.card ?? ''}>
      <div className={shared.stack}>
        <p className={shared.muted}>{locationsText(sheet)}</p>
        <ul className={styles.items} aria-label="Places">
          <li className={styles.item}>
            <div className={styles.itemHead}>
              <span className={styles.itemName}>{l.fixedLocation}</span>
              <span className={styles.meta}>Fixed</span>
            </div>
          </li>
          {l.entries.map((e) => (
            <li key={e.entryId} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.itemName}>{e.name}</span>
                <span className={styles.meta}>
                  {e.kind === 'tree' ? 'Tree' : 'Portal'}, {dateText(e.date)}
                </span>
              </div>
              {isStaff ? (
                <div className={styles.actions}>
                  <Button
                    variant="ghost"
                    aria-label={`Remove place: ${e.name}`}
                    onClick={() => setRemoving(e)}
                  >
                    Remove place
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {isStaff ? (
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={full}
              disabledReason={`All ${l.capacity} places are used.`}
              onClick={() => setAdding(true)}
            >
              Add a place
            </Button>
          </div>
        ) : null}
        {!adding && !removing ? (
          <ErrorList messages={command.errors.map((e) => e.message)} />
        ) : null}
      </div>
      {adding ? <AddLocationDialog view={view} command={command} onClose={close} /> : null}
      {removing ? (
        <RemoveLocationDialog place={removing} command={command} onClose={close} />
      ) : null}
    </Card>
  );
}

function AddLocationDialog({
  view,
  command,
  onClose,
}: {
  view: CharacterView;
  command: CommandApi;
  onClose: () => void;
}) {
  const l = view.sheet.locations;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'portal' | 'tree'>(l.portalSlots > 0 ? 'portal' : 'tree');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  async function submit() {
    if (!name.trim()) return setError('Name the place.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Enter the date.');
    setError('');
    const result = await command.run(
      { type: 'familiarizeLocation', name: name.trim(), kind, date },
      { success: `${name.trim()} is familiar.` },
    );
    if (result.ok) onClose();
  }
  return (
    <FormDialog
      title="Add a place"
      submitLabel="Add place"
      command={command}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Name" required error={error}>
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
      <Field label="Kind" hint={`Portals: ${l.portalSlots}. Trees: ${l.treeSlots}.`}>
        {(control) => (
          <select
            {...control}
            value={kind}
            onChange={(e) => setKind(e.target.value === 'tree' ? 'tree' : 'portal')}
          >
            <option value="portal">Portal</option>
            <option value="tree">Tree</option>
          </select>
        )}
      </Field>
      <Field label="Date familiarized">
        {(control) => (
          <input {...control} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
      </Field>
    </FormDialog>
  );
}

function RemoveLocationDialog({
  place,
  command,
  onClose,
}: {
  place: LocationEntry;
  command: CommandApi;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function submit() {
    if (!reason.trim()) return setError('Give a reason.');
    setError('');
    const result = await command.run(
      { type: 'removeLocation', entryId: place.entryId, reason: reason.trim() },
      { success: `Removed ${place.name}.` },
    );
    if (result.ok) onClose();
  }
  return (
    <FormDialog
      title={`Remove ${place.name}?`}
      submitLabel="Remove place"
      danger
      command={command}
      onSubmit={submit}
      onClose={onClose}
    >
      <ReasonField value={reason} error={error} onChange={setReason} />
    </FormDialog>
  );
}

// ---- Owed items ----

export function OwedCard({ view }: { view: CharacterView }) {
  const { sheet, isStaff } = view;
  const command = useCommand(view.id);
  const [adding, setAdding] = useState(false);
  const owed = [...sheet.owed].sort((a, b) => Number(a.delivered) - Number(b.delivered));
  return (
    <Card title="Owed items" className={shared.card ?? ''}>
      <div className={shared.stack}>
        {owed.length === 0 ? (
          <p>Nothing owed.</p>
        ) : (
          <ul className={styles.items} aria-label="Owed items">
            {owed.map((item) => {
              const at = eventLabel(sheet, item.eventKey);
              return (
                <li key={item.id} className={styles.item}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemName}>{item.text}</span>
                    {item.delivered ? (
                      <Badge kind="approved">Delivered</Badge>
                    ) : (
                      <Badge kind="pending">Owed</Badge>
                    )}
                  </div>
                  {at || item.deliveredAt ? (
                    <p className={styles.meta}>
                      {at ? `Earned at ${at}.` : ''}
                      {item.delivered && item.deliveredAt
                        ? ` Delivered ${dateText(item.deliveredAt)}.`
                        : ''}
                    </p>
                  ) : null}
                  {isStaff && !item.delivered ? (
                    <div className={styles.actions}>
                      <Button
                        variant="secondary"
                        aria-label={`Mark delivered: ${item.text}`}
                        onClick={() =>
                          void command.run(
                            { type: 'deliverOwed', owedId: item.id },
                            { success: `Delivered: ${item.text}` },
                          )
                        }
                      >
                        Mark delivered
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {isStaff ? (
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Add an owed item
            </Button>
          </div>
        ) : null}
        {!adding ? <ErrorList messages={command.errors.map((e) => e.message)} /> : null}
      </div>
      {adding ? (
        <AddOwedDialog
          view={view}
          command={command}
          onClose={() => {
            command.clear();
            setAdding(false);
          }}
        />
      ) : null}
    </Card>
  );
}

function AddOwedDialog({
  view,
  command,
  onClose,
}: {
  view: CharacterView;
  command: CommandApi;
  onClose: () => void;
}) {
  const events = eventsNewestFirst(view.sheet);
  const [text, setText] = useState('');
  const [eventKey, setEventKey] = useState(events[0]?.key ?? '');
  const [error, setError] = useState('');
  async function submit() {
    const value = text.trim();
    if (!value) return setError('Enter what is owed.');
    setError('');
    const result = await command.run(
      { type: 'addOwed', text: value, ...(eventKey ? { eventKey } : {}) },
      { success: `Owed: ${value}` },
    );
    if (result.ok) onClose();
  }
  return (
    <FormDialog
      title="Add an owed item"
      submitLabel="Add owed item"
      command={command}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="What is owed" required error={error}>
        {(control) => (
          <input
            {...control}
            value={text}
            maxLength={500}
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
      <Field label="Event" hint="The event it was earned at.">
        {(control) => (
          <select {...control} value={eventKey} onChange={(e) => setEventKey(e.target.value)}>
            <option value="">No event</option>
            {events.map((e) => (
              <option key={e.key} value={e.key}>
                {e.name} ({e.date})
              </option>
            ))}
          </select>
        )}
      </Field>
    </FormDialog>
  );
}
