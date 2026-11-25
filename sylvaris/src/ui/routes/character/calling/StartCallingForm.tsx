// Staff: start a Calling (or return to a former one, Q-CALL-14). Pick one of the 13 with its
// innate, detriment, and two skills, make its choices, and pick the attended event it starts at.
import { useId, useState, type FormEvent } from 'react';
import {
  namedLevelUnlocked,
  type ChoiceValue,
  type Ruleset,
  type Sheet,
} from '../../../../engine/index.ts';
import type { SyCalling } from '../../../../data/index.ts';
import { Button, Card, Field } from '../../../components/index.ts';
import { previewCommand, useCommand } from '../../../data/engineHooks.ts';
import { LOCAL_MODE } from '../../../../localMode.ts';
import { ErrorList } from '../ErrorList.tsx';
import type { CharacterView } from '../view.ts';
import { eventsNewestFirst, levelName } from '../journals/events.ts';
import { racialPassiveLabel } from './callingModel.ts';
import shared from '../character.module.css';
import styles from '../journals/screens.module.css';

type ChoiceDef = NonNullable<SyCalling['choices']>[number];
type Draft = Record<string, string | string[]>;

export function StartCallingForm({ view }: { view: CharacterView }) {
  const { ruleset, sheet } = view;
  const formId = useId();
  const command = useCommand(view.id);
  const events = eventsNewestFirst(sheet);
  const [callingId, setCallingId] = useState('');
  const [choices, setChoices] = useState<Draft>({});
  const [eventKey, setEventKey] = useState(events[0]?.key ?? '');
  const [teacher, setTeacher] = useState('Calling book');
  const [formError, setFormError] = useState('');
  const calling = callingId ? ruleset.callingsById[callingId] : undefined;
  const former = new Set(sheet.formerCallings.map((c) => c.callingId));
  const cost = ruleset.ruleset.calling.startCostCxp;

  function choose(id: string) {
    setCallingId(id);
    setChoices({});
    setFormError('');
    command.clear();
  }

  function setChoice(id: string, value: ChoiceValue | null) {
    setChoices((current) => {
      const next = { ...current };
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0))
        delete next[id];
      else next[id] = typeof value === 'string' ? value : [...value];
      return next;
    });
    command.clear();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (command.running) return;
    if (!calling) return setFormError('Choose a Calling.');
    // The no-login builder starts a Calling with no event or teacher.
    if (!eventKey && !LOCAL_MODE) return setFormError('Choose the event the Calling starts at.');
    setFormError('');
    const name = teacher.trim();
    await command.run(
      {
        type: 'startCalling',
        callingId: calling.id,
        choices,
        ...(eventKey && !LOCAL_MODE ? { eventKey } : {}),
        ...(name && !LOCAL_MODE ? { teacher: name } : {}),
      },
      { success: `${sheet.profile.characterName} started ${calling.name}.` },
    );
  }

  const check = calling
    ? previewCommand(ruleset, sheet, {
        type: 'startCalling',
        callingId: calling.id,
        choices,
        ...(eventKey && !LOCAL_MODE ? { eventKey } : {}),
      })
    : null;

  return (
    <Card title="Start a Calling" className={`${shared.card} ${styles.wide}`}>
      <form id={formId} noValidate className={shared.form} onSubmit={(e) => void submit(e)}>
        <p className={shared.muted}>
          Starting buys Basic in both Calling skills for {cost} CXP. CXP available:{' '}
          <span className="num">{sheet.points.cxp.available}</span>.
        </p>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Calling</legend>
          <ul className={styles.options}>
            {ruleset.callings.map((c) => (
              <CallingOption
                key={c.id}
                calling={c}
                ruleset={ruleset}
                name={`${formId}-calling`}
                checked={c.id === callingId}
                returning={former.has(c.id)}
                onSelect={() => choose(c.id)}
              />
            ))}
          </ul>
        </fieldset>
        {calling && (calling.choices ?? []).length > 0 ? (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{calling.name} choices</legend>
            {(calling.choices ?? []).map((def) => (
              <ChoiceInput
                key={def.id}
                def={def}
                ruleset={ruleset}
                sheet={sheet}
                value={choices[def.id]}
                onChange={(v) => setChoice(def.id, v)}
              />
            ))}
          </fieldset>
        ) : null}
        {LOCAL_MODE ? null : events.length === 0 ? (
          <p>No events attended yet. A Calling starts at an event the character attended.</p>
        ) : (
          <Field label="Start event" hint="An event the character attended.">
            {(control) => (
              <select
                {...control}
                value={eventKey}
                onChange={(e) => {
                  setEventKey(e.target.value);
                  command.clear();
                }}
              >
                {events.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.name} ({e.date})
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {LOCAL_MODE ? null : (
          <Field label="Teacher" hint="Who taught the Calling, or the Calling book.">
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
        )}
        {check && !check.allowed && command.errors.length === 0 ? (
          <ErrorList title="Not yet" messages={check.reasons} />
        ) : null}
        <ErrorList
          messages={[...(formError ? [formError] : []), ...command.errors.map((e) => e.message)]}
        />
        <div className={styles.actions}>
          <Button variant="primary" type="submit" aria-disabled={command.running || undefined}>
            {calling && former.has(calling.id)
              ? `Return to ${calling.name} (${cost} CXP)`
              : `Start the Calling (${cost} CXP)`}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CallingOption({
  calling,
  ruleset,
  name,
  checked,
  returning,
  onSelect,
}: {
  calling: SyCalling;
  ruleset: Ruleset;
  name: string;
  checked: boolean;
  returning: boolean;
  onSelect: () => void;
}) {
  const id = useId();
  return (
    <li className={styles.option}>
      <input
        id={id}
        type="radio"
        name={name}
        value={calling.id}
        checked={checked}
        onChange={onSelect}
        className={styles.radio}
        aria-describedby={`${id}-detail`}
      />
      <span className={styles.optionText}>
        <label htmlFor={id} className={styles.optionLabel}>
          {calling.name}
          {returning ? ' (former Calling, return)' : ''}
        </label>
        <span id={`${id}-detail`} className={styles.optionDetail}>
          {calling.summary} Innate, {calling.innate.name}: {calling.innate.summary} Detriment:{' '}
          {calling.detriment?.summary ?? 'none.'} Skills:{' '}
          {calling.skills.map((s) => ruleset.skillsById[s.id]?.name ?? s.name).join(' and ')}.
        </span>
      </span>
    </li>
  );
}

/** Options for a choice: [value, label] pairs, or null for free text. */
function choiceOptions(ruleset: Ruleset, sheet: Sheet, def: ChoiceDef): [string, string][] | null {
  const ownRace = sheet.race?.raceId;
  const owned = (id: string) => {
    const s = sheet.skills.find((k) => k.skillId === id && !k.locked);
    return { level: s?.level ?? 0, techniques: s?.techniques ?? [] };
  };
  switch (def.kind) {
    case 'pick':
      return (def.options ?? []).map((o) => [o, levelName(o)]);
    case 'racial-passive':
      return ruleset.races
        .filter((r) => !(def.excludeOwned && r.id === ownRace))
        .flatMap((r) => r.innate.filter((i) => i.kind === 'passive'))
        .map((i) => [i.id, racialPassiveLabel(ruleset, i.id) ?? i.id]);
    case 'racial-skill':
      return ruleset.races
        .filter((r) => !(def.excludeOwned && r.id === ownRace))
        .flatMap((r) => r.skills.map((s) => [s.id, `${s.name} (${r.name})`] as [string, string]));
    case 'spell-list':
      return ruleset.spells
        .filter((sp) => {
          const school = ruleset.ruleset.magicSchools.find((m) => m.id === sp.school);
          return school ? namedLevelUnlocked(owned(school.skill), sp.level) : false;
        })
        .map((sp) => [sp.id, `${sp.name} (${sp.school}, ${levelName(sp.level)})`]);
    default:
      return null;
  }
}

function ChoiceInput({
  def,
  ruleset,
  sheet,
  value,
  onChange,
}: {
  def: ChoiceDef;
  ruleset: Ruleset;
  sheet: Sheet;
  value: ChoiceValue | undefined;
  onChange: (value: ChoiceValue | null) => void;
}) {
  const options = choiceOptions(ruleset, sheet, def);
  const multi = def.multi === true || def.kind === 'spell-list';
  if (options === null)
    return (
      <Field label={def.label} hint={def.summary}>
        {(control) => (
          <input
            {...control}
            value={typeof value === 'string' ? value : ''}
            maxLength={500}
            autoComplete="off"
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
    );
  if (multi) {
    const list = Array.isArray(value) ? value : [];
    return (
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{def.label}</legend>
        {options.length === 0 ? (
          <p className={shared.muted}>Nothing to choose from yet.</p>
        ) : (
          options.map(([id, label]) => (
            <label key={id} className={styles.checkRow}>
              <input
                type="checkbox"
                checked={list.includes(id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...list, id] : list.filter((v) => v !== id))
                }
              />
              <span>{label}</span>
            </label>
          ))
        )}
      </fieldset>
    );
  }
  return (
    <Field label={def.label} hint={def.summary}>
      {(control) => (
        <select
          {...control}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose</option>
          {options.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
