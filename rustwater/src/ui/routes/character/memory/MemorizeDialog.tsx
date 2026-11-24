import { useId, useMemo, useState, type FormEvent } from 'react';
import { preview, type MemorizeCommand } from '../../../../engine/index.ts';
import { Button, Dialog, Field } from '../../../components/index.ts';
import { useCommand } from '../../../data/engineHooks.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { memorizationSkillName, pickerItems, type PickerItem, type SlotKind } from './model.ts';
import characterStyles from '../character.module.css';
import styles from './memory.module.css';

const ARTICLE: Record<SlotKind, string> = {
  spell: 'a spell',
  recipe: 'a recipe',
  performance: 'a performance',
  ritual: 'a ritual',
};

/** "Uses a free Life slot" or "Needs a new Universal slot". */
function poolText(item: PickerItem): string {
  if (!item.pool) return 'No free slot, and none can be bought';
  return item.needsSlot
    ? `Needs a new ${item.pool.name} slot`
    : `Uses a free ${item.pool.name} slot`;
}

export interface MemorizeDialogProps {
  view: CharacterView;
  kind: SlotKind;
  /** Preselects an item (opened from its row). */
  initialRefId?: string;
  onClose: () => void;
}

/**
 * Staff picker: eligible items with search, the pool each would use, and with no free slot an
 * option to buy one memorization level (1 AP) in the same step, plus the teacher when needed.
 */
export function MemorizeDialog({ view, kind, initialRefId, onClose }: MemorizeDialogProps) {
  const { ruleset, sheet } = view;
  const formId = useId();
  const command = useCommand(view.id);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialRefId ?? null);
  const [buySlot, setBuySlot] = useState(false);
  const [teacher, setTeacher] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const items = useMemo(
    () => pickerItems(ruleset, sheet, kind, query),
    [ruleset, sheet, kind, query],
  );
  const selected = items.find((item) => item.refId === selectedId) ?? null;
  const needsSlot = selected?.needsSlot === true && selected.pool !== null;

  const base: MemorizeCommand | null = selected
    ? { type: 'memorize', kind, refId: selected.refId }
    : null;
  const costPreview = base && needsSlot ? preview(ruleset, sheet, base) : null;
  const buyPreview =
    base && needsSlot && buySlot ? preview(ruleset, sheet, { ...base, buySlot: true }) : null;
  const teacherRequired = buyPreview?.teacherRequired === true;
  const cost = costPreview?.cost;
  const archetypeName = cost?.archetype
    ? (ruleset.archetypesById[cost.archetype]?.name ?? cost.archetype)
    : null;
  const apLeft = cost?.archetype ? sheet.points.ap[cost.archetype]?.available : undefined;
  const memName = memorizationSkillName(ruleset, selected?.pool ?? null);

  const teacherError = command.errors.find((e) => e.code === 'TEACHER_REQUIRED')?.message;
  const otherErrors = command.errors.filter((e) => e.code !== 'TEACHER_REQUIRED');
  const messages = [...(localError ? [localError] : []), ...otherErrors.map((e) => e.message)];

  async function submit(event: FormEvent) {
    event.preventDefault();
    // aria-disabled, not disabled, while running: a disabled button would drop focus (a11y A-04).
    if (command.running) return;
    command.clear();
    if (!selected) {
      setLocalError(`Choose ${ARTICLE[kind]} to memorize.`);
      return;
    }
    setLocalError(null);
    const typed = teacher.trim();
    const result = await command.run(
      {
        type: 'memorize',
        kind,
        refId: selected.refId,
        ...(needsSlot && buySlot ? { buySlot: true } : {}),
        ...(typed ? { teacher: typed } : {}),
      },
      { success: `Memorized ${selected.name}.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Memorize ${ARTICLE[kind]}`}
      actions={
        <>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            aria-disabled={command.running || undefined}
          >
            Memorize
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
        className={characterStyles.form}
        onSubmit={(e) => void submit(e)}
      >
        <Field label="Search" hint="Only what this character can memorize now is listed.">
          {(control) => (
            <input
              {...control}
              type="search"
              value={query}
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
        </Field>
        <fieldset className={styles.pickerFieldset}>
          <legend className={styles.pickerLegend}>{`Choose ${ARTICLE[kind]}`}</legend>
          <p className={styles.count} aria-live="polite">
            {items.length === 0
              ? query.trim()
                ? `Nothing matches "${query.trim()}".`
                : 'Nothing left to memorize.'
              : `${items.length} to choose from.`}
          </p>
          <ul className={styles.options}>
            {items.map((item) => (
              <PickerOption
                key={item.refId}
                item={item}
                name={`${formId}-item`}
                checked={item.refId === selectedId}
                onSelect={() => {
                  setSelectedId(item.refId);
                  setBuySlot(false);
                  setLocalError(null);
                  command.clear();
                }}
              />
            ))}
          </ul>
        </fieldset>
        {needsSlot && selected ? (
          <div className={styles.check}>
            <input
              id={`${formId}-buy`}
              type="checkbox"
              checked={buySlot}
              aria-describedby={`${formId}-buy-detail`}
              onChange={(e) => {
                setBuySlot(e.target.checked);
                command.clear();
              }}
            />
            <span className={styles.checkText}>
              <label htmlFor={`${formId}-buy`} className={styles.checkLabel}>
                Also buy a memorization level ({cost?.amount ?? 1} AP)
              </label>
              <span id={`${formId}-buy-detail`} className={styles.optionDetail}>
                {`No ${selected.pool?.name ?? ''} slot is free. One more ${memName} level adds one.`}
                {archetypeName && apLeft !== undefined
                  ? ` ${archetypeName} AP left: ${apLeft}.`
                  : ''}
              </span>
            </span>
          </div>
        ) : null}
        {needsSlot && buySlot && (teacherRequired || teacherError) ? (
          <Field
            label="Teacher"
            required
            hint={`The first ${memName} level needs a teacher.`}
            error={teacherError}
          >
            {(control) => (
              <input
                {...control}
                value={teacher}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => setTeacher(e.target.value)}
              />
            )}
          </Field>
        ) : null}
        <ErrorList messages={messages} />
      </form>
    </Dialog>
  );
}

function PickerOption({
  item,
  name,
  checked,
  onSelect,
}: {
  item: PickerItem;
  name: string;
  checked: boolean;
  onSelect: () => void;
}) {
  const id = useId();
  return (
    <li className={styles.option}>
      <input
        id={id}
        type="radio"
        name={name}
        value={item.refId}
        checked={checked}
        onChange={onSelect}
        className={styles.radio}
        aria-describedby={`${id}-detail`}
      />
      <span className={styles.optionText}>
        <label htmlFor={id} className={styles.optionLabel}>
          {item.name}
        </label>
        <span id={`${id}-detail`} className={styles.optionDetail}>
          {item.detail}. {poolText(item)}.
        </span>
      </span>
    </li>
  );
}
