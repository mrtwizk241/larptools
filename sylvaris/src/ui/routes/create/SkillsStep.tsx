// Wizard step "Skills": spend the starting XP on skills by category, the chosen race's racial
// skills included. Levels up to 5, the Expert Technique from level 3. Advanced skills are listed
// as not available at creation. A retirement rebuild has no creation limits: levels up to 10,
// every Technique, and advanced skills ([RET-REBUILD]). The engine checks the picks with a
// dry-run plan.
import { useMemo, useState } from 'react';
import type { SySkill } from '../../../data/index.ts';
import { LOCAL_MODE } from '../../../localMode.ts';
import {
  displayContext,
  displayRuleText,
  levelCost,
  skillDisplayNameFor,
  techniqueCost,
  type Ruleset,
  type TechniqueId,
} from '../../../engine/index.ts';
import { LevelStepper, PointsChip, Tabs } from '../../components/index.ts';
import { ErrorList } from '../character/ErrorList.tsx';
import {
  advancedReason,
  dryRun,
  expertLevel,
  isRebuild,
  pickOf,
  raceOf,
  setSkillLevel,
  setTechnique,
  skillLimits,
  techniqueGivesText,
  techniqueLevel,
  xpTotals,
  type WizardDraft,
} from './steps.ts';
import type { StepViewProps } from './StepViews.tsx';
import styles from './create.module.css';

const ALL_CATEGORIES = [
  { id: 'offensive', label: 'Offensive' },
  { id: 'defensive', label: 'Defensive' },
  { id: 'utility', label: 'Utility' },
  { id: 'magic', label: 'Magic' },
  { id: 'crafting', label: 'Crafting' },
  { id: 'racial', label: 'Racial' },
] as const;
type CategoryId = (typeof ALL_CATEGORIES)[number]['id'];
/** The Character Playground puts the racial skills first. */
const CATEGORIES = LOCAL_MODE
  ? [
      ...ALL_CATEGORIES.filter((c) => c.id === 'racial'),
      ...ALL_CATEGORIES.filter((c) => c.id !== 'racial'),
    ]
  : ALL_CATEGORIES;

function skillsIn(ruleset: Ruleset, category: CategoryId, raceId: string): SySkill[] {
  if (category === 'racial') return [...(ruleset.racesById[raceId]?.skills ?? [])];
  return ruleset.skills.filter((s) => s.category === category);
}

export function SkillsStep({ draft, update, errors, ruleset }: StepViewProps) {
  const [tab, setTab] = useState<CategoryId>(CATEGORIES[0]?.id ?? 'offensive');
  const dry = useMemo(() => dryRun(draft, ruleset, 'skills'), [draft, ruleset]);
  const totals = xpTotals(draft, ruleset);
  const race = raceOf(draft, ruleset);
  // Before Next is pressed, engine problems show here; afterwards the wizard's summary shows them.
  const live = !dry.ok && errors.form.length === 0 ? dry.errors.map((e) => e.message) : [];
  const { maxSkillLevel } = ruleset.ruleset.creation;
  const rebuild = isRebuild(draft, ruleset);

  return (
    <div className={styles.fields}>
      {rebuild && draft.retirement ? (
        <p className={styles.hint}>
          Spend up to {totals.total} XP, the carry-over from {draft.retirement.fromName}. Level n of
          a skill costs {ruleset.ruleset.skills.costPerLevel}n XP, and levels are bought in order. A
          character built from a retirement is not bound by the creation limits: skills go up to
          level {ruleset.ruleset.skills.maxLevel} with every Technique. Teaching for the Master and
          Grandmaster Techniques is paid in coin from the carry-over. Unspent XP carries over.
        </p>
      ) : (
        <p className={styles.hint}>
          Spend up to {totals.total} XP. Level n of a skill costs{' '}
          {ruleset.ruleset.skills.costPerLevel}n XP, and levels are bought in order. At creation a
          skill goes up to level {maxSkillLevel} and the Expert Technique (level{' '}
          {expertLevel(ruleset)}, {techniqueCost(ruleset, 'expert')} XP). Unspent XP carries over.
        </p>
      )}
      <div className={styles.sticky}>
        <ul className={styles.chips} aria-label="Starting XP">
          <li>
            <PointsChip
              label="XP"
              value={totals.left}
              suffix={`left of ${totals.total}`}
              {...(totals.left < 0 ? { warning: 'Overspent' } : {})}
            />
          </li>
          <li>
            <PointsChip label="Spent" value={totals.spent} suffix="XP" />
          </li>
        </ul>
      </div>
      <ErrorList title="These picks do not work yet:" messages={live} />
      <Tabs
        label="Skill categories"
        selectedId={tab}
        onSelect={(id) => setTab(id as CategoryId)}
        tabs={CATEGORIES.map((category) => ({
          id: category.id,
          label: category.label,
          content:
            category.id === tab ? (
              <div className={styles.tabBody}>
                {category.id === 'racial' && !race ? (
                  <p>Choose a race first to see its racial skills.</p>
                ) : (
                  <CategoryList
                    draft={draft}
                    update={update}
                    ruleset={ruleset}
                    left={totals.left}
                    skills={skillsIn(ruleset, category.id, draft.raceId)}
                    racial={category.id === 'racial' ? (race?.name ?? '') : null}
                  />
                )}
              </div>
            ) : null,
        }))}
      />
    </div>
  );
}

function CategoryList({
  draft,
  update,
  ruleset,
  left,
  skills,
  racial,
}: {
  draft: WizardDraft;
  update: (next: WizardDraft) => void;
  ruleset: Ruleset;
  left: number;
  skills: SySkill[];
  /** The race name on the Racial tab. */
  racial: string | null;
}) {
  // A retirement rebuild may buy advanced skills too (their prerequisites still apply).
  const rebuild = isRebuild(draft, ruleset);
  const regular = skills.filter((s) => rebuild || !s.advanced);
  const advanced = rebuild ? [] : skills.filter((s) => s.advanced);
  return (
    <>
      {racial ? <p className={styles.hint}>Only {racial} characters can learn these.</p> : null}
      <ul className={styles.skillList}>
        {regular.map((skill) => (
          <li key={skill.id}>
            <SkillPickRow
              draft={draft}
              update={update}
              ruleset={ruleset}
              left={left}
              skill={skill}
            />
          </li>
        ))}
      </ul>
      {advanced.length > 0 ? (
        <details className={styles.advanced}>
          <summary>Advanced skills ({advanced.length}), not available at creation</summary>
          <ul className={styles.skillList}>
            {advanced.map((skill) => (
              <li key={skill.id} className={styles.skill}>
                <h3 className={styles.skillName}>{skill.name}</h3>
                <p className={styles.skillSummary}>{skill.levels.basic.summary}</p>
                <p className={styles.unavailable}>{advancedReason(ruleset, skill.id)}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function SkillPickRow({
  draft,
  update,
  ruleset,
  left,
  skill,
}: {
  draft: WizardDraft;
  update: (next: WizardDraft) => void;
  ruleset: Ruleset;
  left: number;
  skill: SySkill;
}) {
  const pick = pickOf(draft, skill.id);
  const level = pick?.level ?? 0;
  // The chosen Dragonborn element fills in the racial skill's name and texts (AC-8).
  const race = { raceId: draft.raceId, choices: draft.choices };
  const shown = displayContext(ruleset, race);
  const skillName = skillDisplayNameFor(ruleset, skill.id, race);
  const text = (summary: string) => displayRuleText(summary, shown);
  const { maxLevel: max, techniques } = skillLimits(draft, ruleset);
  const nextCost = level < max ? levelCost(ruleset, level + 1) : null;
  const blocked =
    nextCost !== null && nextCost > left
      ? `Next level costs ${nextCost} XP, ${Math.max(0, left)} left`
      : undefined;
  const requirement = 'requirement' in skill ? skill.requirement : undefined;
  // A racial skill that replaces this one (Clockwork Armor Plating for Wear Armor, AC-18).
  const raceRow = ruleset.racesById[draft.raceId];
  const replacer = raceRow?.skills.find((r) => r.replacesSkill === skill.id);
  const replaced = replacer
    ? `${raceRow?.name ?? 'This race'} uses ${replacer.name} instead of ${skill.name}.`
    : undefined;
  // Each Technique once its level is reached and the one before it is taken.
  const offered = techniques.filter(
    (t, i) =>
      level >= techniqueLevel(ruleset, t) &&
      (i === 0 || pick?.[techniques[i - 1] as TechniqueId] === true),
  );
  return (
    <div className={`${styles.skill} ${level > 0 ? (styles.skillPicked ?? '') : ''}`}>
      <h3 className={styles.skillName}>{skillName}</h3>
      <p className={styles.skillSummary}>Basic: {text(skill.levels.basic.summary)}</p>
      {requirement ? <p className={styles.meta}>Requirement: {requirement}</p> : null}
      <div className={styles.skillControls}>
        <LevelStepper
          label={skillName}
          value={level}
          min={0}
          max={replaced ? level : max}
          onChange={(next) => update(setSkillLevel(draft, skill.id, next, ruleset))}
          {...(nextCost !== null ? { nextCostLabel: `Next level: ${nextCost} XP` } : {})}
          {...(replaced ? { blockedReason: replaced } : blocked ? { blockedReason: blocked } : {})}
        />
        {offered.map((t) => {
          const cost = techniqueCost(ruleset, t);
          const owned = pick?.[t] === true;
          const short = !owned && cost > left;
          const name = `${t[0]?.toUpperCase() ?? ''}${t.slice(1)}`;
          return (
            <label key={t} className={styles.check}>
              <input
                type="checkbox"
                checked={owned}
                aria-disabled={short ? true : undefined}
                onChange={(e) => {
                  if (e.target.checked && short) return;
                  update(setTechnique(draft, skill.id, t, e.target.checked));
                }}
              />
              <span>
                {skillName} {name} Technique, {cost} XP: {techniqueGivesText(skill, t)}
                {short ? ` (needs ${cost} XP, ${Math.max(0, left)} left)` : ''}
              </span>
            </label>
          );
        })}
      </div>
      {pick?.expert ? (
        <p className={styles.skillSummary}>Expert: {text(skill.levels.expert.summary)}</p>
      ) : null}
      {pick?.master ? (
        <p className={styles.skillSummary}>Master: {text(skill.levels.master.summary)}</p>
      ) : null}
      {pick?.grandmaster ? (
        <p className={styles.skillSummary}>Grandmaster: {text(skill.levels.grandmaster.summary)}</p>
      ) : null}
    </div>
  );
}
