// Starting items ([ITEM-START]): the picks with their details. Staff edit them with the
// 10-pick picker; repeats are allowed, and each save replaces the whole set.
import { useId, useState, type FormEvent } from 'react';
import type { Ruleset } from '../../../../engine/index.ts';
import { Button, Card, Dialog, Field } from '../../../components/index.ts';
import { useCommand, type CommandApi } from '../../../data/engineHooks.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { levelName } from '../journals/events.ts';
import { pickDetailOptions, pickDetailText, type PickRow } from './startingItems.ts';
import shared from '../character.module.css';
import styles from '../journals/screens.module.css';

export function StartingItemsCard({ view }: { view: CharacterView }) {
  const { ruleset, sheet, isStaff } = view;
  const command = useCommand(view.id);
  const [editing, setEditing] = useState(false);
  const max = ruleset.startingEquipment.picks;
  const picks = sheet.startingItems;
  return (
    <Card title="Starting items" className={shared.card ?? ''}>
      <div className={shared.stack}>
        {picks.length === 0 ? (
          <p>No starting items recorded.</p>
        ) : (
          <ol className={styles.bullets} aria-label="Starting items">
            {picks.map((p, i) => (
              <li key={`${p.optionId}-${i}`}>
                {p.name}
                {p.detail ? `: ${pickDetailText(ruleset, p.optionId, p.detail)}` : ''}
              </li>
            ))}
          </ol>
        )}
        <p className={shared.muted}>
          {picks.length} of {max} picks chosen.
        </p>
        {isStaff ? (
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit starting items
            </Button>
          </div>
        ) : null}
        {!editing ? <ErrorList messages={command.errors.map((e) => e.message)} /> : null}
      </div>
      {editing ? (
        <EditDialog
          view={view}
          command={command}
          onClose={() => {
            command.clear();
            setEditing(false);
          }}
        />
      ) : null}
    </Card>
  );
}

function EditDialog({
  view,
  command,
  onClose,
}: {
  view: CharacterView;
  command: CommandApi;
  onClose: () => void;
}) {
  const { ruleset, sheet } = view;
  const formId = useId();
  const max = ruleset.startingEquipment.picks;
  const [rows, setRows] = useState<PickRow[]>(
    sheet.startingItems.map((p, i) => ({ key: i, optionId: p.optionId, detail: p.detail ?? '' })),
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const [adding, setAdding] = useState(ruleset.startingEquipment.options[0]?.id ?? '');
  const full = rows.length >= max;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    const result = await command.run(
      {
        type: 'setStartingItems',
        picks: rows.map((r) => ({
          optionId: r.optionId,
          ...(r.detail.trim() ? { detail: r.detail.trim() } : {}),
        })),
      },
      { success: `Saved ${rows.length} starting items.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit starting items"
      actions={
        <>
          <Button variant="primary" type="submit" form={formId}>
            Save starting items
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p className={styles.count} aria-live="polite">
          {rows.length} of {max} picks chosen. An item can be picked more than once.
        </p>
        {rows.map((row, index) => (
          <PickEditor
            key={row.key}
            ruleset={ruleset}
            row={row}
            index={index}
            onDetail={(detail) =>
              setRows((list) => list.map((r) => (r.key === row.key ? { ...r, detail } : r)))
            }
            onRemove={() => setRows((list) => list.filter((r) => r.key !== row.key))}
          />
        ))}
        <div className={styles.editRow}>
          <Field label="Item to add">
            {(control) => (
              <select {...control} value={adding} onChange={(e) => setAdding(e.target.value)}>
                {ruleset.startingEquipment.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.gmApproval ? ' (needs GM approval)' : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Button
            variant="secondary"
            disabled={full}
            disabledReason={`${max} picks is the most.`}
            onClick={() => {
              setRows((list) => [...list, { key: nextKey, optionId: adding, detail: '' }]);
              setNextKey((n) => n + 1);
            }}
          >
            Add item
          </Button>
        </div>
        <ErrorList messages={command.errors.map((e) => e.message)} />
      </form>
    </Dialog>
  );
}

function PickEditor({
  ruleset,
  row,
  index,
  onDetail,
  onRemove,
}: {
  ruleset: Ruleset;
  row: PickRow;
  index: number;
  onDetail: (detail: string) => void;
  onRemove: () => void;
}) {
  const option = ruleset.startingOptionsById[row.optionId];
  const name = option?.name ?? row.optionId;
  const options = pickDetailOptions(ruleset, row.optionId);
  return (
    <div className={styles.editRow}>
      <div>
        <p className={styles.itemName}>
          {index + 1}. {name}
        </p>
        {option?.quality ? <p className={styles.meta}>{levelName(option.quality)}</p> : null}
      </div>
      {option?.choice ? (
        options ? (
          <Field label={`${name}: ${option.choice}`}>
            {(control) => (
              <select {...control} value={row.detail} onChange={(e) => onDetail(e.target.value)}>
                <option value="">Choose</option>
                {options.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : (
          <Field label={`${name}: ${option.choice.replace('-', ' ')}`}>
            {(control) => (
              <input
                {...control}
                value={row.detail}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => onDetail(e.target.value)}
              />
            )}
          </Field>
        )
      ) : null}
      <Button variant="ghost" aria-label={`Remove pick ${index + 1}: ${name}`} onClick={onRemove}>
        Remove pick {index + 1}
      </Button>
    </div>
  );
}
