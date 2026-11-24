// Wizard step "Starting skills": a picker over the skills allowed at creation, grouped by
// category and archetype, with a sticky CXP left chip and the AP each pool earns. The engine
// checks the picks with a dry-run plan of createCharacter.
import { useMemo, useState } from 'react';
import { levelCost, maxLevelOf, type Ruleset, type Sheet } from '../../../engine/index.ts';
import type { SkillPart } from '../../../engine/model.ts';
import { Field, LevelStepper, PointsChip, Tabs } from '../../components/index.ts';
import { ErrorList } from '../character/ErrorList.tsx';
import {
  CATEGORIES,
  allowedAtCreation,
  archetypeName,
  costText,
  partLabel,
  partTitle,
  previewLearn,
  skillParts,
  skillTitle,
  typeLabel,
  creationGroups,
  type CreationGroup,
  type Skill,
  type SkillCategory,
} from '../character/skills/skillInfo.ts';
import {
  dryRunCreate,
  pickArchetype,
  pickLevel,
  pickTotals,
  setPickLevel,
  type WizardDraft,
} from './steps.ts';
import type { StepViewProps } from './StepViews.tsx';
import skillStyles from '../character/skills/skills.module.css';
import styles from './create.module.css';

export function SkillsStep({ draft, update, errors, ruleset }: StepViewProps) {
  const [tab, setTab] = useState<SkillCategory>('standard');
  const [query, setQuery] = useState('');
  const dry = useMemo(() => dryRunCreate(draft, ruleset), [draft, ruleset]);
  const totals = pickTotals(draft, ruleset);
  // Before Next is pressed, engine problems show here; afterwards the wizard's summary shows them.
  const live = !dry.ok && !errors.form ? dry.errors.map((e) => e.message) : [];

  return (
    <div className={skillStyles.picker}>
      <p className={styles.hint}>
        Spend up to {totals.cxpTotal} CXP on basic skill levels. Each basic level earns AP in its
        archetype, which pays for adept, advanced, encounter, and passive levels. Masteries and
        cognitive powers cannot be learned at creation. Starting with no skills is allowed.
      </p>
      <div className={skillStyles.sticky}>
        <ul className={skillStyles.chips} aria-label="Starting points">
          <li>
            <PointsChip
              label="CXP"
              value={totals.cxpLeft}
              suffix={`left of ${totals.cxpTotal}`}
              {...(totals.cxpLeft < 0 ? { warning: 'Overspent' } : {})}
            />
          </li>
          {totals.pools.map((pool) => (
            <li key={pool.archetype}>
              <PointsChip
                label={`${archetypeName(ruleset, pool.archetype)} AP`}
                value={pool.earned}
                suffix={`earned, ${pool.left} left`}
                {...(pool.left < 0 ? { warning: 'Overspent' } : {})}
              />
            </li>
          ))}
        </ul>
      </div>
      <ErrorList title="These picks do not work yet:" messages={live} />
      <Tabs
        label="Skill categories"
        selectedId={tab}
        onSelect={(id) => setTab(id as SkillCategory)}
        tabs={CATEGORIES.map((category) => ({
          id: category.id,
          label: category.label,
          content:
            category.id === tab ? (
              <div className={skillStyles.tabBody}>
                <Field label={`Search ${category.label.toLowerCase()} skills`}>
                  {(control) => (
                    <input
                      {...control}
                      type="search"
                      autoComplete="off"
                      placeholder="Skill name"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  )}
                </Field>
                <CategoryPicker
                  draft={draft}
                  update={update}
                  ruleset={ruleset}
                  sheet={dry.ok ? dry.sheet : null}
                  groups={creationGroups(ruleset, category.id, query)}
                />
              </div>
            ) : null,
        }))}
      />
    </div>
  );
}

function CategoryPicker({
  draft,
  update,
  ruleset,
  sheet,
  groups,
}: {
  draft: WizardDraft;
  update: (next: WizardDraft) => void;
  ruleset: Ruleset;
  /** Sheet after the current picks, or null while the picks do not pass. */
  sheet: Sheet | null;
  groups: CreationGroup[];
}) {
  if (groups.length === 0) return <p>No skills match.</p>;
  return (
    <>
      {groups.map((group) => (
        <section
          key={group.id}
          aria-labelledby={`pick-group-${group.id}`}
          className={skillStyles.group}
        >
          <h3 id={`pick-group-${group.id}`} className={skillStyles.groupTitle}>
            {group.title}
          </h3>
          <ul className={skillStyles.pickList}>
            {group.skills.map((skill) => (
              <li key={skill.id} className={skillStyles.pickSkill}>
                <SkillPick
                  draft={draft}
                  update={update}
                  ruleset={ruleset}
                  sheet={sheet}
                  skill={skill}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function SkillPick({
  draft,
  update,
  ruleset,
  sheet,
  skill,
}: {
  draft: WizardDraft;
  update: (next: WizardDraft) => void;
  ruleset: Ruleset;
  sheet: Sheet | null;
  skill: Skill;
}) {
  const choice = draft.skillArchetypes[skill.id] ?? '';
  const offersChoice =
    skill.archetype === undefined && skill.archetypeRule?.kind === 'locked-on-first-purchase';
  return (
    <>
      <div className={skillStyles.pickHead}>
        <h4 className={skillStyles.pickName}>{skillTitle(ruleset, skill)}</h4>
        <span className={skillStyles.typeBadge}>{typeLabel(skill)}</span>
      </div>
      {offersChoice ? (
        <Field label={`${skill.name} archetype`} hint="Its AP is earned and spent here.">
          {(control) => (
            <select
              {...control}
              value={choice}
              onChange={(e) =>
                update({
                  ...draft,
                  skillArchetypes: { ...draft.skillArchetypes, [skill.id]: e.target.value },
                })
              }
            >
              <option value="">Choose an archetype</option>
              {(skill.archetypeOptions ?? []).map((id) => (
                <option key={id} value={id}>
                  {archetypeName(ruleset, id)}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      <div className={skillStyles.pickParts}>
        {skillParts(skill)
          .filter((part) => allowedAtCreation(skill, part))
          .map((part) => (
            <PartPick
              key={part}
              draft={draft}
              update={update}
              ruleset={ruleset}
              sheet={sheet}
              skill={skill}
              part={part}
              blockedByChoice={
                offersChoice && choice === ''
                  ? `Choose the archetype for ${skill.name} first.`
                  : undefined
              }
            />
          ))}
      </div>
    </>
  );
}

function PartPick({
  draft,
  update,
  ruleset,
  sheet,
  skill,
  part,
  blockedByChoice,
}: {
  draft: WizardDraft;
  update: (next: WizardDraft) => void;
  ruleset: Ruleset;
  sheet: Sheet | null;
  skill: Skill;
  part: SkillPart;
  blockedByChoice: string | undefined;
}) {
  const def = skill.parts[part];
  if (!def) return null;
  const level = pickLevel(draft, skill.id, part);
  const max = maxLevelOf(ruleset, def.costKind) ?? Number.POSITIVE_INFINITY;
  let nextCostLabel: string | undefined;
  let blockedReason: string | undefined;
  if (blockedByChoice) {
    blockedReason = blockedByChoice;
  } else if (sheet === null) {
    // The picks do not pass yet, so there is no sheet to preview against: label the cost from
    // the cost table and leave + open so the user can fix the picks.
    if (level < max) {
      const amount = levelCost(ruleset, def.costKind, level + 1);
      const archetype = pickArchetype(draft, ruleset, skill.id);
      nextCostLabel = `Next level: ${costText(ruleset, {
        currency: def.costKind === 'basic' ? 'cxp' : 'ap',
        amount,
        ...(archetype ? { archetype } : {}),
      })}`;
    }
  } else if (level < max) {
    const choice = draft.skillArchetypes[skill.id];
    const result = previewLearn(ruleset, sheet, skill, part, choice || undefined);
    if (result.cost) nextCostLabel = `Next level: ${costText(ruleset, result.cost)}`;
    if (!result.allowed) blockedReason = result.reasons.join(' ');
  }
  return (
    <div className={skillStyles.pickPart}>
      <span className={skillStyles.pickPartName}>{partTitle(skill, part)}</span>
      <LevelStepper
        label={partLabel(ruleset, skill, part)}
        value={level}
        min={0}
        max={max}
        onChange={(next) => update(setPickLevel(draft, skill.id, part, next))}
        {...(nextCostLabel ? { nextCostLabel } : {})}
        {...(blockedReason ? { blockedReason } : {})}
      />
    </div>
  );
}
