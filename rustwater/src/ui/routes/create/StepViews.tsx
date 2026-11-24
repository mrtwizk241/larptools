// One view per wizard step. Each gets the draft, an update function, and the errors to show.
import { useId, type ReactNode } from 'react';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { deriveSheet, preview, type Ruleset } from '../../../engine/index.ts';
import { Field } from '../../components/index.ts';
import { ancestryLine, frequencyText } from '../character/format.ts';
import { partLabel } from '../character/skills/skillInfo.ts';
import skillStyles from '../character/skills/skills.module.css';
import { ChoiceCard } from './ChoiceCard.tsx';
import {
  ancestryInfo,
  selectAncestry,
  selectSubtype,
  toCreateCommand,
  type DraftErrors,
  type WizardDraft,
} from './steps.ts';
import styles from './create.module.css';
import { AGE_HELP, MAX_AGE, MIN_AGE } from './validation.ts';
import { PUBLIC_MODE } from '../../../publicMode.ts';

export interface StepViewProps {
  /** A player sending a new character: the player name and email come from their account. */
  playerLocked?: boolean;
  draft: WizardDraft;
  update: (next: WizardDraft) => void;
  /** Errors to show; empty until Next was pressed on a blocked step. */
  errors: DraftErrors;
  ruleset: Ruleset;
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className={styles.fieldError}>
      <CircleAlert aria-hidden="true" className={styles.fieldErrorIcon} />
      <span>{message}</span>
    </p>
  );
}

/** A fieldset of choice cards with a legend, optional hint, and error. */
function ChoiceGroup({
  legend,
  hint,
  error,
  children,
}: {
  legend: string;
  hint?: ReactNode;
  error: string | undefined;
  children: (describedBy: string | undefined) => ReactNode;
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
      <div className={styles.choices}>{children(describedBy || undefined)}</div>
    </fieldset>
  );
}

export function NamesStep({ draft, update, errors, playerLocked = false }: StepViewProps) {
  const set = (key: 'characterName' | 'playerName' | 'playerEmail' | 'age') => (value: string) =>
    update({ ...draft, [key]: value });
  return (
    <div className={styles.fields}>
      <Field label="Character name" required error={errors.characterName}>
        {(control) => (
          <input
            {...control}
            autoComplete="off"
            value={draft.characterName}
            onChange={(e) => set('characterName')(e.target.value)}
          />
        )}
      </Field>
      {playerLocked ? (
        <p>
          Player: {draft.playerName} ({draft.playerEmail}), from your account.
        </p>
      ) : null}
      {playerLocked ? null : (
        <Field label="Player name" required error={errors.playerName}>
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              value={draft.playerName}
              onChange={(e) => set('playerName')(e.target.value)}
            />
          )}
        </Field>
      )}
      {/* The public site asks for no email: nothing there is sent anywhere. */}
      {playerLocked || PUBLIC_MODE ? null : (
        <Field label="Player email" hint="Optional." error={errors.playerEmail}>
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
      <Field label="Age" hint={AGE_HELP} error={errors.age}>
        {(control) => (
          <input
            {...control}
            type="number"
            min={MIN_AGE}
            max={MAX_AGE}
            step={1}
            inputMode="numeric"
            autoComplete="off"
            value={draft.age}
            onChange={(e) => set('age')(e.target.value)}
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

export function AncestryStep({ draft, update, errors, ruleset }: StepViewProps) {
  const { ancestry, allowsExtraInfection, fromLegends } = ancestryInfo(draft, ruleset);
  const extra = ruleset.ruleset.extraInfection;
  const trackName = (id: string) => ruleset.infection.tracks.find((t) => t.id === id)?.name ?? id;
  return (
    <div className={styles.fields}>
      <ChoiceGroup legend="Ancestry" error={errors.ancestryId}>
        {(describedBy) =>
          ruleset.ancestries.ancestries.map((a) => (
            <ChoiceCard
              key={a.id}
              name="ancestry"
              value={a.id}
              title={a.name}
              checked={draft.ancestryId === a.id}
              onSelect={(value) => update(selectAncestry(draft, value))}
              {...(describedBy ? { describedBy } : {})}
            >
              {a.passive ? (
                <Rule name={`Passive, ${a.passive.sheetName}`}>{a.passive.text}</Rule>
              ) : null}
              <Rule
                name={`${a.sharedAbility.name} (${frequencyText(a.sharedAbility.frequency).toLowerCase()})`}
              >
                {a.sharedAbility.text}
              </Rule>
              <p className={styles.meta}>
                {trackName(a.infectionTrack)} starts at {a.baseInfection}.
              </p>
            </ChoiceCard>
          ))
        }
      </ChoiceGroup>

      {ancestry ? (
        <ChoiceGroup legend={`${ancestry.name} subtype`} error={errors.subtypeId}>
          {(describedBy) =>
            ancestry.subtypes.map((s) => (
              <ChoiceCard
                key={s.id}
                name="subtype"
                value={s.id}
                title={s.name}
                checked={draft.subtypeId === s.id}
                onSelect={(value) => update(selectSubtype(draft, value, ruleset))}
                {...(describedBy ? { describedBy } : {})}
              >
                {s.passive ? (
                  <Rule name={`Passive, ${s.passive.sheetName}`}>{s.passive.text}</Rule>
                ) : null}
                <Rule
                  name={`${s.ability.name} (${frequencyText(s.ability.frequency).toLowerCase()})`}
                >
                  {s.ability.text}
                </Rule>
              </ChoiceCard>
            ))
          }
        </ChoiceGroup>
      ) : null}

      {ancestry && allowsExtraInfection ? (
        <ChoiceGroup
          legend="Extra infection"
          hint={`+${extra.cxpPerLevel} CXP each, up to ${extra.maxLevels} levels.`}
          error={errors.extraInfection}
        >
          {(describedBy) =>
            Array.from({ length: extra.maxLevels + 1 }, (_, n) => (
              <ChoiceCard
                key={n}
                name="extra-infection"
                value={String(n)}
                title={
                  n === 0
                    ? 'None'
                    : `${n} ${n === 1 ? 'level' : 'levels'}, +${n * extra.cxpPerLevel} CXP`
                }
                checked={draft.extraInfection === n}
                onSelect={(value) => update({ ...draft, extraInfection: Number(value) })}
                {...(describedBy ? { describedBy } : {})}
              />
            ))
          }
        </ChoiceGroup>
      ) : null}
      {ancestry && !allowsExtraInfection ? (
        <p className={styles.meta}>{ancestry.name} cannot take extra infection levels.</p>
      ) : null}

      {ancestry && fromLegends ? (
        <Field
          label={`${ancestry.sharedAbility.name} copies`}
          hint={fromLegends.text}
          required
          error={errors.fromLegendsChoice}
        >
          {(control) => (
            <select
              {...control}
              value={draft.fromLegendsChoice}
              onChange={(e) => update({ ...draft, fromLegendsChoice: e.target.value })}
            >
              <option value="">Choose an ability</option>
              {fromLegends.allowedAbilityIds.map((abilityId) => {
                const entry = ruleset.ancestryAbilitiesById[abilityId];
                if (!entry) return null;
                const owner = ancestryLine(entry.ancestry.name, entry.subtype?.name ?? '');
                return (
                  <option key={abilityId} value={abilityId}>
                    {entry.ability.name} ({owner},{' '}
                    {frequencyText(entry.ability.frequency).toLowerCase()})
                  </option>
                );
              })}
            </select>
          )}
        </Field>
      ) : null}
    </div>
  );
}

export function LxpStep({ draft, update, errors, ruleset }: StepViewProps) {
  const { ancestry, subtype } = ancestryInfo(draft, ruleset);
  if (!ancestry || !subtype) return <p>Choose an ancestry and subtype first.</p>;
  const start = ruleset.ancestries.rules.startingAbilityLevel;
  const copied = draft.fromLegendsChoice
    ? ruleset.ancestryAbilitiesById[draft.fromLegendsChoice]?.ability
    : undefined;
  const abilities = [
    {
      ability: ancestry.sharedAbility,
      title: copied
        ? `${ancestry.sharedAbility.name}: ${copied.name}`
        : ancestry.sharedAbility.name,
      frequency: copied?.frequency ?? ancestry.sharedAbility.frequency,
      text: copied?.text ?? ancestry.sharedAbility.text,
    },
    {
      ability: subtype.ability,
      title: subtype.ability.name,
      frequency: subtype.ability.frequency,
      text: subtype.ability.text,
    },
  ];
  return (
    <ChoiceGroup
      legend={`Which ability starts at level ${start + 1}?`}
      hint={`Both ancestry abilities start at level ${start}. The starting LXP raises one of them to level ${start + 1}.`}
      error={errors.startingLxpAbilityId}
    >
      {(describedBy) =>
        abilities.map(({ ability, title, frequency, text }) => (
          <ChoiceCard
            key={ability.id}
            name="starting-lxp"
            value={ability.id}
            title={title}
            checked={draft.startingLxpAbilityId === ability.id}
            onSelect={(value) => update({ ...draft, startingLxpAbilityId: value })}
            {...(describedBy ? { describedBy } : {})}
          >
            <p className={styles.meta}>{frequencyText(frequency)}</p>
            <p className={styles.rule}>{text}</p>
          </ChoiceCard>
        ))
      }
    </ChoiceGroup>
  );
}

export function ReviewStep({ draft, ruleset }: StepViewProps) {
  const { ancestry, subtype } = ancestryInfo(draft, ruleset);
  const extra = ruleset.ruleset.extraInfection;
  const lxpAbility = draft.startingLxpAbilityId
    ? ruleset.ancestryAbilitiesById[draft.startingLxpAbilityId]?.ability
    : undefined;
  const copied = draft.fromLegendsChoice
    ? ruleset.ancestryAbilitiesById[draft.fromLegendsChoice]?.ability
    : undefined;
  const result = preview(ruleset, deriveSheet(ruleset, []), toCreateCommand(draft, ruleset));
  const bonus = draft.extraInfection * extra.cxpPerLevel;
  const picks = draft.startingSkills
    .map((pick) => {
      const skill = ruleset.skillsById[pick.skillId];
      return skill ? `${partLabel(ruleset, skill, pick.part)} ${pick.level}` : null;
    })
    .filter((text): text is string => text !== null);
  const rows: [string, string][] = [
    ['Character', draft.characterName.trim()],
    ['Player', draft.playerName.trim()],
    ...(draft.playerEmail.trim() ? [['Email', draft.playerEmail.trim()] as [string, string]] : []),
    ...(draft.age.trim() ? [['Age', draft.age.trim()] as [string, string]] : []),
    ['Ancestry', ancestry && subtype ? ancestryLine(ancestry.name, subtype.name) : 'Not chosen'],
    ...(ancestry?.infectionTrack === 'infection'
      ? [
          [
            'Extra infection',
            draft.extraInfection === 0
              ? 'None'
              : `${draft.extraInfection} ${draft.extraInfection === 1 ? 'level' : 'levels'}, +${bonus} CXP`,
          ] as [string, string],
        ]
      : []),
    ...(copied && ancestry
      ? [[`${ancestry.sharedAbility.name} copies`, copied.name] as [string, string]]
      : []),
    ['Level 2 ability', lxpAbility?.name ?? 'Not chosen'],
    [
      'Starting CXP',
      bonus > 0
        ? `${ruleset.ruleset.startingCxp + bonus} (${ruleset.ruleset.startingCxp} plus ${bonus} for infection)`
        : String(ruleset.ruleset.startingCxp),
    ],
    ['Starting skills', picks.length > 0 ? picks.join(', ') : 'None'],
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
      {picks.length === 0 ? (
        <p className={skillStyles.warning}>
          <TriangleAlert aria-hidden="true" className={skillStyles.warningIcon} />
          <span>
            No starting skills picked. The character can still be created and learn skills later
            with a teacher.
          </span>
        </p>
      ) : null}
      {result.allowed && result.notices.length > 0 ? (
        <div className={styles.notes}>
          <p className={styles.notesTitle}>Good to know</p>
          <ul>
            {result.notices.map((n) => (
              <li key={n.code}>{n.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
