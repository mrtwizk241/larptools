// Wizard step "Starting items": up to 10 picks, repeats allowed. A Basic spell, recipe, or
// performance pick asks which one and becomes a starting journal entry.
import { useMemo } from 'react';
import type { SyStartingOption } from '../../../data/index.ts';
import type { Ruleset } from '../../../engine/index.ts';
import { Field, LevelStepper, PointsChip } from '../../components/index.ts';
import {
  detailKind,
  detailNoun,
  itemCount,
  setItemCount,
  setItemDetail,
  type WizardDraft,
} from './steps.ts';
import type { StepViewProps } from './StepViews.tsx';
import styles from './create.module.css';

function basicOptions(ruleset: Ruleset, kind: 'spell' | 'recipe' | 'performance') {
  if (kind === 'spell') {
    return ruleset.ruleset.magicSchools.map((school) => ({
      group: `${school.name} Magic`,
      items: ruleset.spells.filter((s) => s.school === school.id && s.level === 'basic'),
    }));
  }
  if (kind === 'recipe') {
    const crafts = [
      ...new Set(ruleset.recipes.filter((r) => r.level === 'basic').map((r) => r.craft)),
    ];
    return crafts.map((craft) => ({
      group: ruleset.skillsById[craft]?.name ?? craft,
      items: ruleset.recipes.filter((r) => r.craft === craft && r.level === 'basic'),
    }));
  }
  return [
    { group: 'Performances', items: ruleset.performances.filter((p) => p.level === 'basic') },
  ];
}

export function ItemsStep({ draft, update, errors, ruleset }: StepViewProps) {
  const max = ruleset.startingEquipment.picks;
  const count = itemCount(draft);
  return (
    <div className={styles.fields}>
      <p className={styles.hint}>
        Choose up to {max} items. An item can be picked more than once. A spell, recipe, or
        performance pick goes into the matching journal.
      </p>
      <div className={styles.sticky}>
        <ul className={styles.chips} aria-label="Starting items">
          <li>
            <PointsChip
              label="Items"
              value={count}
              suffix={`of ${max}`}
              {...(count > max ? { warning: 'Too many' } : {})}
            />
          </li>
        </ul>
      </div>
      <ul className={styles.itemList}>
        {ruleset.startingEquipment.options.map((option) => (
          <li key={option.id} className={styles.item}>
            <ItemRow
              option={option}
              draft={draft}
              update={update}
              ruleset={ruleset}
              left={max - count}
              errors={errors.fields}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemRow({
  option,
  draft,
  update,
  ruleset,
  left,
  errors,
}: {
  option: SyStartingOption;
  draft: WizardDraft;
  update: (next: WizardDraft) => void;
  ruleset: Ruleset;
  left: number;
  errors: Record<string, string>;
}) {
  const list = draft.items[option.id] ?? [];
  const kind = detailKind(option.choice);
  const groups = useMemo(
    () =>
      kind === 'spell' || kind === 'recipe' || kind === 'performance'
        ? basicOptions(ruleset, kind)
        : [],
    [kind, ruleset],
  );
  return (
    <>
      <div className={styles.itemHead}>
        <span className={styles.itemName}>{option.name}</span>
        <LevelStepper
          label={option.name}
          value={list.length}
          min={0}
          max={list.length + Math.max(0, left)}
          onChange={(next) => update(setItemCount(draft, option.id, next))}
          {...(left <= 0 && list.length === 0 ? { blockedReason: 'All picks used' } : {})}
        />
      </div>
      {option.gmApproval ? (
        <p className={styles.meta}>Needs GM approval before it comes into play.</p>
      ) : null}
      {kind && list.length > 0 ? (
        <div className={styles.details}>
          {list.map((detail, index) => {
            const label = `${option.name} ${list.length > 1 ? `${index + 1}, ` : ''}${detailNoun(option.choice ?? '')}`;
            const error = errors[`item:${option.id}:${index}`];
            const set = (value: string) => update(setItemDetail(draft, option.id, index, value));
            if (kind === 'text')
              return (
                <Field key={index} label={label} required error={error}>
                  {(control) => (
                    <input
                      {...control}
                      autoComplete="off"
                      value={detail}
                      onChange={(e) => set(e.target.value)}
                    />
                  )}
                </Field>
              );
            return (
              <Field key={index} label={label} required error={error}>
                {(control) => (
                  <select {...control} value={detail} onChange={(e) => set(e.target.value)}>
                    <option value="">Choose one</option>
                    {kind === 'element'
                      ? ruleset.ruleset.magicSchools.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))
                      : groups.map((g) => (
                          <optgroup key={g.group} label={g.group}>
                            {g.items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                  </select>
                )}
              </Field>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
