// Check-in income choices (Harvesting, Merchanting, Human silver, Totemic components, familiar
// tricks): what each source gives, and a radio group where the player or staff choose. Shared by
// the staff check-in and pre-registration screens.
import { useId } from 'react';
import type { CheckInChoices, CheckInSource } from '../../../../engine/index.ts';
import { Field } from '../../../components/index.ts';
import styles from './checkin.module.css';

function techniqueName(id: string): string {
  return `${id.charAt(0).toUpperCase()}${id.slice(1)} Technique`;
}

export function IncomeChoices({
  sources,
  choices,
  onChange,
  upkeepBy,
  disabled = false,
}: {
  sources: readonly CheckInSource[];
  choices: CheckInChoices;
  onChange: (next: CheckInChoices) => void;
  /** The upkeep cover in use; a source that covers upkeep has its choice made for it. */
  upkeepBy: string | null;
  disabled?: boolean;
}) {
  if (sources.length === 0)
    return <p>This character has nothing to collect at check-in from skills or the familiar.</p>;
  return (
    <ul className={styles.sources} aria-label="Check-in income">
      {sources.map((s) => (
        <SourceItem
          key={s.id}
          source={s}
          choices={choices}
          onChange={onChange}
          coversUpkeep={upkeepBy !== null && s.id === `skill:${upkeepBy}`}
          disabled={disabled}
        />
      ))}
    </ul>
  );
}

function SourceItem({
  source,
  choices,
  onChange,
  coversUpkeep,
  disabled,
}: {
  source: CheckInSource;
  choices: CheckInChoices;
  onChange: (next: CheckInChoices) => void;
  coversUpkeep: boolean;
  disabled: boolean;
}) {
  const id = useId();
  const title = `${source.name}${source.level ? ` (level ${source.level})` : ''}`;
  const perLevel = choices.perLevel?.[source.id] ?? 0;
  const t = source.technique;
  // Technique options to choose from: its choice list, or its fixed part against the alternative.
  const techOptions =
    t?.choice && t.choice.length > 0 ? t.choice : t?.alternative && t.fixed ? [t.fixed] : [];
  const fixedInOptions = Boolean(t?.fixed) && techOptions[0] === t?.fixed;
  const techChoice = choices.technique?.[source.id] ?? 0;
  const setPerLevel = (index: number) =>
    onChange({ ...choices, perLevel: { ...(choices.perLevel ?? {}), [source.id]: index } });
  const setTechnique = (value: number | 'alternative') =>
    onChange({ ...choices, technique: { ...(choices.technique ?? {}), [source.id]: value } });
  return (
    <li className={styles.source}>
      <p className={styles.subhead} id={`${id}-title`}>
        {title}
      </p>
      {source.fixed ? <p>Receives {source.fixed.text}.</p> : null}
      {source.choice && source.choice.length === 1 ? (
        <p>Receives {source.choice[0]?.text}.</p>
      ) : null}
      {source.choice && source.choice.length > 1 ? (
        coversUpkeep ? (
          <p>Takes the upkeep option: it covers this event&apos;s upkeep.</p>
        ) : (
          <fieldset className={styles.group}>
            <legend className={styles.legend}>{source.name}: take</legend>
            {source.choice.map((o, i) => (
              <label key={o.text} className={styles.check}>
                <input
                  type="radio"
                  name={`${id}-per-level`}
                  checked={perLevel === i}
                  disabled={disabled}
                  onChange={() => setPerLevel(i)}
                />
                <span>{o.text}</span>
              </label>
            ))}
          </fieldset>
        )
      ) : null}
      {t ? (
        <>
          {t.fixed && !fixedInOptions && techChoice !== 'alternative' ? (
            <p>
              {techniqueName(t.technique)}: also {t.fixed.text}.
            </p>
          ) : null}
          {techOptions.length > 1 || t.alternative ? (
            <fieldset className={styles.group}>
              <legend className={styles.legend}>
                {source.name}, {techniqueName(t.technique)}: take
              </legend>
              {techOptions.map((o, i) => (
                <label key={o.text} className={styles.check}>
                  <input
                    type="radio"
                    name={`${id}-technique`}
                    checked={techChoice === i}
                    disabled={disabled}
                    onChange={() => setTechnique(i)}
                  />
                  <span>{o.text}</span>
                </label>
              ))}
              {t.alternative ? (
                <label className={styles.check}>
                  <input
                    type="radio"
                    name={`${id}-technique`}
                    checked={techChoice === 'alternative'}
                    disabled={disabled}
                    onChange={() => setTechnique('alternative')}
                  />
                  <span>Instead: {t.alternative.text}</span>
                </label>
              ) : null}
            </fieldset>
          ) : t.choice && t.choice.length === 1 ? (
            <p>
              {techniqueName(t.technique)}: also {t.choice[0]?.text}.
            </p>
          ) : null}
          {t.trade ? (
            <Field
              label={`${source.name}: Exotic Components by trade`}
              hint={`${t.trade.basicPerExotic} Basic Components for each, at most ${t.trade.maxExoticTotal} Exotic in all.`}
            >
              {(control) => (
                <input
                  {...control}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={disabled}
                  value={String(choices.tradeExotics?.[source.id] ?? 0)}
                  onChange={(e) => {
                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    onChange({
                      ...choices,
                      tradeExotics: { ...(choices.tradeExotics ?? {}), [source.id]: n },
                    });
                  }}
                />
              )}
            </Field>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
