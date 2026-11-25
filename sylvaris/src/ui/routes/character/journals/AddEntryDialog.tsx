// Staff: add a spell, recipe, performance note, or ritual. A searchable picker, how it was gained
// (teacher name, Research Notes, scroll, starting item, other), and the event.
import { useId, useMemo, useState, type FormEvent } from 'react';
import type { JournalSource } from '../../../../engine/index.ts';
import { Button, Dialog, Field } from '../../../components/index.ts';
import type { CommandApi } from '../../../data/engineHooks.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { eventsNewestFirst, levelName } from './events.ts';
import {
  PICKER_LIMIT,
  SOURCES,
  pickerItems,
  type KindInfo,
  type PickerItem,
} from './journalModel.ts';
import shared from '../character.module.css';
import styles from './screens.module.css';
import { LOCAL_MODE } from '../../../../localMode.ts';

export function AddEntryDialog({
  view,
  info,
  command,
  onClose,
}: {
  view: CharacterView;
  info: KindInfo;
  command: CommandApi;
  onClose: () => void;
}) {
  const { ruleset, sheet } = view;
  const formId = useId();
  const events = eventsNewestFirst(sheet);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The no-login builder asks only which entry: no teacher, source, or event.
  const [source, setSource] = useState<JournalSource>(LOCAL_MODE ? 'other' : 'teacher');
  const [teacher, setTeacher] = useState('');
  const [eventKey, setEventKey] = useState(events[0]?.key ?? '');
  const [errors, setErrors] = useState<{ pick?: string; teacher?: string }>({});

  const items = useMemo(
    () => pickerItems(ruleset, sheet, info.kind, query),
    [ruleset, sheet, info.kind, query],
  );
  const shown = items.slice(0, PICKER_LIMIT);
  const selected = items.find((i) => i.refId === selectedId) ?? null;
  // Keep the chosen item listed while the search changes.
  const list = selected && !shown.includes(selected) ? [selected, ...shown] : shown;

  function close() {
    command.clear();
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    const next: typeof errors = {};
    if (!selected) next.pick = `Choose a ${info.noun}.`;
    const name = teacher.trim();
    if (source === 'teacher' && !name) next.teacher = 'Name the teacher.';
    setErrors(next);
    if (!selected || next.teacher) return;
    const result = await command.run(
      {
        type: 'addJournal',
        kind: info.kind,
        refId: selected.refId,
        source,
        ...(source === 'teacher' ? { teacher: name } : {}),
        ...(eventKey && !LOCAL_MODE ? { eventKey } : {}),
      },
      { success: LOCAL_MODE ? `Added ${selected.name}.` : `Added ${selected.name}. Pending tag.` },
    );
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={close}
      title={`Add a ${info.noun}`}
      actions={
        <>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            aria-disabled={command.running || undefined}
          >
            {`Add ${info.noun}`}
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <Field label="Search" hint="Name, school or craft, or level.">
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
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{`Choose a ${info.noun}`}</legend>
          <p className={styles.count} aria-live="polite">
            {items.length === 0
              ? query.trim()
                ? `Nothing matches "${query.trim()}".`
                : 'Everything is recorded already.'
              : items.length > PICKER_LIMIT
                ? `Showing ${PICKER_LIMIT} of ${items.length}. Search to narrow the list.`
                : `${items.length} to choose from.`}
          </p>
          {errors.pick ? <ErrorList messages={[errors.pick]} /> : null}
          <ul className={styles.options}>
            {list.map((item) => (
              <PickerOption
                key={item.refId}
                item={item}
                name={`${formId}-item`}
                checked={item.refId === selectedId}
                onSelect={() => {
                  setSelectedId(item.refId);
                  setErrors({});
                  command.clear();
                }}
              />
            ))}
          </ul>
        </fieldset>
        {LOCAL_MODE ? null : (
          <Field label="How it was gained">
            {(control) => (
              <select
                {...control}
                value={source}
                onChange={(e) => setSource(e.target.value as JournalSource)}
              >
                {SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {source === 'teacher' && !LOCAL_MODE ? (
          <Field label="Teacher" required error={errors.teacher}>
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
        {LOCAL_MODE ? null : (
          <Field label="Event" hint="The event it was gained at.">
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
        )}
        <ErrorList messages={command.errors.map((e) => e.message)} />
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
          {item.groupName}, {levelName(item.level)}.{' '}
          {item.usableNow ? 'Can use now.' : `Cannot use yet. ${item.reason ?? ''}`}
        </span>
      </span>
    </li>
  );
}
