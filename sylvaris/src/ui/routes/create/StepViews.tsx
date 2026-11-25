// One view per simple wizard step. Each gets the draft, an update function, and the errors to show.
import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, CircleAlert } from 'lucide-react';
import type { SyRace } from '../../../data/index.ts';
import { LOCAL_MODE } from '../../../localMode.ts';
import type { Ruleset } from '../../../engine/index.ts';
import { Field } from '../../components/index.ts';
import { ChoiceCard } from './ChoiceCard.tsx';
import { raceFactsText, usesText } from './raceText.ts';
import {
  LIFESPAN_TEXT,
  choiceOptionLabel,
  detailText,
  dryRun,
  itemCount,
  languageName,
  literacyLanguageId,
  pickTechniques,
  raceOf,
  reviewHints,
  retirementCoinText,
  selectRace,
  setChoice,
  xpTotals,
  type DraftErrors,
  type Player,
  type WizardDraft,
} from './steps.ts';
import styles from './create.module.css';

export interface StepViewProps {
  draft: WizardDraft;
  update: (next: WizardDraft) => void;
  /** Errors to show; empty until Next was pressed on a blocked step. */
  errors: DraftErrors;
  ruleset: Ruleset;
  /** A player sending a new character: the player name and email come from their account. */
  player: Player | null;
}

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className={styles.fieldError}>
      <CircleAlert aria-hidden="true" className={styles.fieldErrorIcon} />
      <span>{message}</span>
    </p>
  );
}

/** A fieldset with a legend, optional hint, and error; children get the describedby ids. */
function Group({
  legend,
  hint,
  error,
  children,
  className,
}: {
  legend: string;
  hint?: ReactNode;
  error: string | undefined;
  children: (describedBy: string | undefined) => ReactNode;
  className?: string | undefined;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
      <div className={className ?? styles.choices}>{children(describedBy || undefined)}</div>
    </fieldset>
  );
}

export function ProfileStep({ draft, update, errors, player, ruleset }: StepViewProps) {
  const set =
    (key: 'characterName' | 'playerName' | 'playerEmail' | 'concept') => (value: string) =>
      update({ ...draft, [key]: value });
  return (
    <div className={styles.fields}>
      {draft.retirement ? (
        <p className={styles.account}>
          Built from the retirement of {draft.retirement.fromName}: {xpTotals(draft, ruleset).total}{' '}
          XP to start with, {draft.retirement.cxp} CXP, {draft.retirement.axp} AXP, and{' '}
          {draft.retirement.coinCopper} Copper. The creation limits do not apply.
        </p>
      ) : null}
      <Field label="Character name" required error={errors.fields.characterName}>
        {(control) => (
          <input
            {...control}
            autoComplete="off"
            value={draft.characterName}
            onChange={(e) => set('characterName')(e.target.value)}
          />
        )}
      </Field>
      {player ? (
        <p className={styles.account}>
          Player: {player.name} ({player.email}), from your account.
        </p>
      ) : (
        <>
          <Field label="Player name" required error={errors.fields.playerName}>
            {(control) => (
              <input
                {...control}
                autoComplete="off"
                value={draft.playerName}
                onChange={(e) => set('playerName')(e.target.value)}
              />
            )}
          </Field>
          {LOCAL_MODE ? null : (
            <Field label="Player email" hint="Optional." error={errors.fields.playerEmail}>
              {(control) => (
                <input
                  {...control}
                  type="email"
                  autoComplete="off"
                  value={draft.playerEmail}
                  onChange={(e) => set('playerEmail')(e.target.value)}
                />
              )}
            </Field>
          )}
        </>
      )}
      <Field
        label="Concept"
        hint="Optional. An archetype or role in a few words, for example a wandering healer."
        error={errors.fields.concept}
      >
        {(control) => (
          <input
            {...control}
            autoComplete="off"
            value={draft.concept}
            onChange={(e) => set('concept')(e.target.value)}
          />
        )}
      </Field>
    </div>
  );
}

function Rule({ name, children }: { name: string; children: ReactNode }) {
  return (
    <p className={styles.rule}>
      <span className={styles.ruleName}>{name}:</span> {children}
    </p>
  );
}

export function RaceStep({ draft, update, errors, ruleset }: StepViewProps) {
  const race = raceOf(draft, ruleset);
  return (
    <div className={styles.fields}>
      <Group legend="Race" error={errors.fields.raceId}>
        {(describedBy) =>
          ruleset.races.map((r) => (
            <Fragment key={r.id}>
              <ChoiceCard
                name="race"
                value={r.id}
                title={r.name}
                checked={draft.raceId === r.id}
                onSelect={(value) => update(selectRace(draft, value, ruleset))}
                describedBy={describedBy}
              >
                <p className={styles.rule}>{r.summary}</p>
                <Rule name="Makeup">{r.makeup}</Rule>
                {r.innate.map((innate) => (
                  <Rule
                    key={innate.id}
                    name={
                      innate.kind === 'passive'
                        ? 'Innate passive'
                        : `Innate active, ${usesText(innate.uses, innate.frequency)}`
                    }
                  >
                    {innate.summary}
                  </Rule>
                ))}
                <Rule name="Racial skills">{r.skills.map((s) => s.name).join(', ')}</Rule>
                <p className={styles.meta}>{raceFactsText(ruleset, r)}</p>
              </ChoiceCard>
              {race && race.id === r.id ? (
                // The chosen race's choices sit right under its card (acceptance AC-3).
                <>
                  <RaceAbilities race={race} />
                  <div
                    role="group"
                    aria-label={`${race.name} choices`}
                    className={styles.raceChoices}
                  >
                    <RaceChoices draft={draft} update={update} errors={errors} ruleset={ruleset} />
                  </div>
                </>
              ) : null}
            </Fragment>
          ))
        }
      </Group>
    </div>
  );
}

const LEVEL_NAMES = {
  basic: 'Basic',
  expert: 'Expert',
  master: 'Master',
  grandmaster: 'Grandmaster',
} as const;

/** The chosen race's abilities: each opens (arrow) to its full text, every level of a skill. */
function RaceAbilities({ race }: { race: SyRace }) {
  return (
    <section aria-label={`${race.name} racial abilities`} className={styles.raceAbilities}>
      <p className={styles.ruleName}>{race.name} racial abilities</p>
      <ul className={styles.abilityList}>
        {race.innate.map((innate) => (
          <li key={innate.id}>
            <Expandable
              title={`${race.name} innate ${innate.kind === 'passive' ? 'passive' : 'active'}`}
            >
              <p>
                {innate.kind === 'passive'
                  ? 'Always on. '
                  : `${usesText(innate.uses, innate.frequency)}. `}
                {innate.summary}
              </p>
            </Expandable>
          </li>
        ))}
        {race.skills.map((skill) => (
          <li key={skill.id}>
            <Expandable title={skill.name}>
              {skill.requirement ? <p>Requirement: {skill.requirement}</p> : null}
              <dl className={styles.abilityLevels}>
                {(Object.keys(LEVEL_NAMES) as (keyof typeof LEVEL_NAMES)[]).map((named) => {
                  const level = skill.levels[named];
                  const cost =
                    level.kind === 'passive'
                      ? 'passive'
                      : `${level.uses} ${level.uses === 1 ? 'use' : 'uses'}${level.kind === 'both' ? ', plus a passive' : ''}`;
                  return (
                    <div key={named}>
                      <dt>{`${LEVEL_NAMES[named]} (${cost})`}</dt>
                      <dd>{level.summary}</dd>
                    </div>
                  );
                })}
              </dl>
            </Expandable>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A title with an arrow that opens the text under it. */
function Expandable({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        className={styles.expandToggle}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown aria-hidden="true" className={styles.expandIcon} />
        <span>{title}</span>
      </button>
      <div id={id} hidden={!open} className={styles.expandBody}>
        {children}
      </div>
    </div>
  );
}

/** The chosen race's choices, literacy, and age category. */
function RaceChoices({ draft, update, errors, ruleset }: Omit<StepViewProps, 'player'>) {
  const race = raceOf(draft, ruleset);
  const { minAgeCategory, maxAgeCategory } = ruleset.ruleset.creation;
  if (!race) return null;
  return (
    <>
      {race.choices.map((def) => {
        const key = `choice:${def.id}`;
        const value = draft.choices[def.id] ?? '';
        if (def.kind === 'pick')
          return (
            <Group
              key={def.id}
              legend={def.label}
              hint={def.summary}
              error={errors.fields[key]}
              className={styles.group}
            >
              {(describedBy) =>
                (def.options ?? []).map((option) => (
                  <label key={option} className={styles.radioRow}>
                    <input
                      type="radio"
                      name={`choice-${def.id}`}
                      value={option}
                      checked={value === option}
                      onChange={() => update(setChoice(draft, def.id, option))}
                      {...(describedBy ? { 'aria-describedby': describedBy } : {})}
                    />
                    <span>{choiceOptionLabel(ruleset, race, def.id, option)}</span>
                  </label>
                ))
              }
            </Group>
          );
        if (def.kind === 'language') {
          const literacy = literacyLanguageId(draft, race);
          return (
            <Field
              key={def.id}
              label={def.label}
              hint={`${race.name} learn one more language to read and write.`}
              required
              error={errors.fields[key]}
            >
              {(control) => (
                <select
                  {...control}
                  value={value}
                  onChange={(e) => update(setChoice(draft, def.id, e.target.value))}
                >
                  <option value="">Choose a language</option>
                  {ruleset.ruleset.languages
                    .filter((l) => l.id !== literacy)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
              )}
            </Field>
          );
        }
        return (
          <Field
            key={def.id}
            label={def.label}
            hint={def.summary ? `Optional. ${def.summary}` : 'Optional.'}
            error={errors.fields[key]}
          >
            {(control) => (
              <input
                {...control}
                autoComplete="off"
                value={value}
                onChange={(e) => update(setChoice(draft, def.id, e.target.value))}
              />
            )}
          </Field>
        );
      })}

      {race.language === 'common' ? (
        <p>
          {race.name} characters start able to read and write {languageName(ruleset, 'common')}.
        </p>
      ) : (
        <Group
          legend="Reads and writes"
          hint="A new character starts literate in its race's language or in Common."
          error={errors.fields.literacy}
          className={styles.group}
        >
          {(describedBy) =>
            (['race-language', 'common'] as const).map((choice) => (
              <label key={choice} className={styles.radioRow}>
                <input
                  type="radio"
                  name="literacy"
                  value={choice}
                  checked={draft.literacy === choice}
                  onChange={() => {
                    const next = { ...draft, literacy: choice };
                    // An extra language equal to the new literacy language is cleared.
                    const extra = race.choices.find((c) => c.kind === 'language');
                    update(
                      extra && next.choices[extra.id] === literacyLanguageId(next, race)
                        ? setChoice(next, extra.id, '')
                        : next,
                    );
                  }}
                  {...(describedBy ? { 'aria-describedby': describedBy } : {})}
                />
                <span>
                  {choice === 'common'
                    ? languageName(ruleset, 'common')
                    : `${languageName(ruleset, race.language)}, the ${race.name} language`}
                </span>
              </label>
            ))
          }
        </Group>
      )}

      <Field
        label="Age category"
        hint={`${minAgeCategory} to ${maxAgeCategory}. Each step is a tenth of the ${race.name} lifespan (${LIFESPAN_TEXT[race.lifespan]}). New characters start at ${minAgeCategory} or higher.`}
        error={errors.fields.ageCategory}
      >
        {(control) => (
          <select
            {...control}
            value={draft.ageCategory}
            onChange={(e) => update({ ...draft, ageCategory: Number(e.target.value) })}
          >
            {Array.from({ length: maxAgeCategory - minAgeCategory + 1 }, (_, i) => {
              const n = minAgeCategory + i;
              return (
                <option key={n} value={n}>
                  {n}
                </option>
              );
            })}
          </select>
        )}
      </Field>
    </>
  );
}

export function BackstoryStep({ draft, update, errors }: StepViewProps) {
  return (
    <div className={styles.fields}>
      <Field
        label="Backstory"
        hint="Optional, and it can be added later. Personality, key events, fears, motivation, family. Avoid royalty, chosen ones, and last-of-a-race stories."
        error={errors.fields.backstory}
      >
        {(control) => (
          <textarea
            {...control}
            className={`${control.className} ${styles.backstory ?? ''}`}
            value={draft.backstory}
            onChange={(e) => update({ ...draft, backstory: e.target.value })}
          />
        )}
      </Field>
    </div>
  );
}

export function ReviewStep({ draft, ruleset, player }: StepViewProps) {
  const race = raceOf(draft, ruleset);
  const result = useMemo(() => dryRun(draft, ruleset), [draft, ruleset]);
  const totals = xpTotals(draft, ruleset);
  const hints = reviewHints(draft, ruleset);
  // The unspent XP shows in the hints above; the engine's own line would repeat it.
  const notices = result.ok ? result.notices.filter((n) => n.code !== 'XP_UNSPENT') : [];
  const skills = draft.skills
    .map((pick) => {
      const name = ruleset.skillsById[pick.skillId]?.name ?? pick.skillId;
      const techniques = pickTechniques(pick).map(
        (t) => `${t[0]?.toUpperCase() ?? ''}${t.slice(1)}`,
      );
      return `${name} ${pick.level}${
        techniques.length === 0
          ? ''
          : techniques.length === 1
            ? ` with the ${techniques[0] ?? ''} Technique`
            : ` with the ${techniques.join(' and ')} Techniques`
      }`;
    })
    .join(', ');
  const items = ruleset.startingEquipment.options
    .flatMap((option) =>
      (draft.items[option.id] ?? []).map((detail) =>
        detail.trim()
          ? `${option.name}: ${detailText(ruleset, option.choice, detail.trim())}`
          : option.name,
      ),
    )
    .join(', ');
  const choices = race
    ? race.choices
        .filter((def) => draft.choices[def.id]?.trim())
        .map((def) => {
          const value = draft.choices[def.id]?.trim() ?? '';
          const text =
            def.kind === 'pick'
              ? choiceOptionLabel(ruleset, race, def.id, value)
              : def.kind === 'language'
                ? languageName(ruleset, value)
                : value;
          return `${def.label}: ${text}`;
        })
        .join('. ')
    : '';
  const rows: [string, string][] = [
    ['Character', draft.characterName.trim()],
    ['Player', player ? `${player.name} (${player.email})` : draft.playerName.trim()],
    ...(!player && draft.playerEmail.trim()
      ? [['Email', draft.playerEmail.trim()] as [string, string]]
      : []),
    ['Concept', draft.concept.trim() || 'None'],
    ...(draft.retirement
      ? [
          [
            'Built from',
            `The retirement of ${draft.retirement.fromName}: ${draft.retirement.xp} XP, ${draft.retirement.cxp} CXP, ${draft.retirement.axp} AXP, and ${retirementCoinText(draft.retirement)} (owed)`,
          ] as [string, string],
        ]
      : []),
    ['Race', race?.name ?? 'Not chosen'],
    ...(choices ? [['Race choices', choices] as [string, string]] : []),
    ...(race
      ? [
          ['Reads and writes', languageName(ruleset, literacyLanguageId(draft, race))] as [
            string,
            string,
          ],
        ]
      : []),
    ['Age category', String(draft.ageCategory)],
    ['Skills', skills || 'None'],
    ['XP', `${totals.spent} spent, ${totals.left} left of ${totals.total}`],
    ...(LOCAL_MODE
      ? []
      : ([
          ['Starting items', items ? `${itemCount(draft)}: ${items}` : 'None'],
          ['Backstory', draft.backstory.trim() || 'None'],
        ] as [string, string][])),
  ];
  return (
    <div className={styles.fields}>
      <dl className={styles.summary}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {result.ok ? (
        <dl className={styles.summary}>
          <div>
            <dt>Life Points</dt>
            <dd className="num">{result.sheet.stats.lifePoints.value}</dd>
          </div>
          <div>
            <dt>Armor Points</dt>
            <dd className="num">{result.sheet.stats.armorPoints.value}</dd>
          </div>
        </dl>
      ) : null}
      {hints.length > 0 ? (
        <div className={styles.notes} role="note" aria-label="Check before you finish">
          <p className={styles.notesTitle}>Check before you finish</p>
          <ul>
            {hints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {notices.length > 0 ? (
        <div className={styles.notes}>
          <p className={styles.notesTitle}>Good to know</p>
          <ul>
            {notices.map((n, i) => (
              <li key={`${n.code}-${i}`}>{n.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
