// Skill state rules: levels in order, tiered Techniques with level gates ([SKL-LEVELS],
// [SKL-TECH]), named ability unlocks ([SKL-TECH]: Basic at level 1, Expert, Master, and
// Grandmaster only with their Technique, Rulebook p.88), what can be refunded, and advanced
// skill prerequisites ([SKL-ADV], data `prereqs`).
import type { SyRuleset, SySkill } from '../../data/index.ts';
import {
  NAMED_LEVELS,
  TECHNIQUES,
  type NamedLevelId,
  type SkillStep,
  type TechniqueId,
} from '../model.ts';
import { techniqueRow } from './costs.ts';

/** A skill as owned: its level (0 to 10) and the Techniques bought. */
export interface OwnedSkill {
  readonly level: number;
  readonly techniques: readonly TechniqueId[];
}

export const NOT_OWNED: OwnedSkill = { level: 0, techniques: [] };

/** Looks up what the character owns of a skill (NOT_OWNED when nothing). */
export type OwnedLookup = (skillId: string) => OwnedSkill;

export function hasTechnique(owned: OwnedSkill, t: TechniqueId): boolean {
  return owned.techniques.includes(t);
}

/** Techniques in table order. */
export function sortTechniques(list: Iterable<TechniqueId>): TechniqueId[] {
  const set = new Set(list);
  return TECHNIQUES.filter((t) => set.has(t));
}

/** 0 for Basic only, 1 Expert, 2 Master, 3 Grandmaster: the highest Technique owned. */
export function techniqueTier(owned: OwnedSkill): number {
  let tier = 0;
  TECHNIQUES.forEach((t, i) => {
    if (hasTechnique(owned, t)) tier = Math.max(tier, i + 1);
  });
  return tier;
}

/** The highest Technique owned, or null. */
export function highestTechnique(owned: OwnedSkill): TechniqueId | null {
  const tier = techniqueTier(owned);
  return tier === 0 ? null : (TECHNIQUES[tier - 1] ?? null);
}

/** Tier index of a Technique (expert 1, master 2, grandmaster 3). */
export function tierOf(t: TechniqueId): number {
  return TECHNIQUES.indexOf(t) + 1;
}

/**
 * True when a named ability can be used: Basic needs level 1, the others need their Technique
 * (reaching the level alone does not unlock it, Rulebook p.88).
 */
export function namedLevelUnlocked(owned: OwnedSkill, named: NamedLevelId): boolean {
  if (named === 'basic') return owned.level >= 1;
  return hasTechnique(owned, named);
}

/** True when the skill level has reached a named level (1, 3, 6, 10). */
export function namedLevelReached(
  ruleset: SyRuleset,
  owned: OwnedSkill,
  named: NamedLevelId,
): boolean {
  return owned.level >= ruleset.ruleset.skills.namedLevels[named];
}

/** Why a step cannot be bought next ({code, message}), or null when it can (order only, not cost). */
export function stepOrderProblem(
  ruleset: SyRuleset,
  owned: OwnedSkill,
  step: SkillStep,
): { code: string; message: string } | null {
  const max = ruleset.ruleset.skills.maxLevel;
  if ('level' in step) {
    if (step.level > max)
      return { code: 'MAX_LEVEL', message: `Skills only go up to level ${max}.` };
    if (step.level <= owned.level)
      return { code: 'ALREADY_AT_LEVEL', message: `Already at level ${owned.level}.` };
    if (step.level !== owned.level + 1)
      return {
        code: 'LEVEL_ORDER',
        message: `Levels are bought in order: level ${owned.level + 1} comes next.`,
      };
    return null;
  }
  const t = step.technique;
  if (hasTechnique(owned, t))
    return { code: 'ALREADY_OWNED', message: `The ${label(t)} Technique is already owned.` };
  const row = techniqueRow(ruleset, t);
  if (row.requires && !hasTechnique(owned, row.requires))
    return {
      code: 'TECHNIQUE_ORDER',
      message: `The ${label(row.requires)} Technique comes first.`,
    };
  if (owned.level < row.level)
    return {
      code: 'TECHNIQUE_LEVEL',
      message: `The ${label(t)} Technique needs level ${row.level}.`,
    };
  return null;
}

/** Applies a step to an owned skill (no checks). */
export function applyStep(owned: OwnedSkill, step: SkillStep): OwnedSkill {
  if ('level' in step) return { level: step.level, techniques: owned.techniques };
  return { level: owned.level, techniques: sortTechniques([...owned.techniques, step.technique]) };
}

/**
 * Steps that may be refunded: the top level (when every owned Technique still has its level
 * gate below it) and the top Technique. Unlearn removes the top of a skill (Rulebook p.126).
 */
export function refundableSteps(ruleset: SyRuleset, owned: OwnedSkill): SkillStep[] {
  const out: SkillStep[] = [];
  if (owned.level > 0) {
    const below = owned.level - 1;
    const blocked = owned.techniques.some((t) => techniqueRow(ruleset, t).level > below);
    if (!blocked) out.push({ level: owned.level });
  }
  const top = highestTechnique(owned);
  if (top) out.push({ technique: top });
  return out;
}

/** Removes a step from an owned skill (no checks). */
export function removeStep(owned: OwnedSkill, step: SkillStep): OwnedSkill {
  if ('level' in step) return { level: step.level - 1, techniques: owned.techniques };
  return { level: owned.level, techniques: owned.techniques.filter((t) => t !== step.technique) };
}

export function label(t: NamedLevelId): string {
  return `${t[0]?.toUpperCase() ?? ''}${t.slice(1)}`;
}

/** The canonical purchase order to reach `level` with `techniques`: levels with each Technique
 * right after its level gate. */
export function stepsTo(
  ruleset: SyRuleset,
  from: OwnedSkill,
  level: number,
  techniques: readonly TechniqueId[],
): SkillStep[] {
  const steps: SkillStep[] = [];
  let state = from;
  const wanted = sortTechniques(techniques).filter((t) => !hasTechnique(from, t));
  const flush = () => {
    for (const t of wanted) {
      if (hasTechnique(state, t)) continue;
      const step: SkillStep = { technique: t };
      if (stepOrderProblem(ruleset, state, step) !== null) continue;
      steps.push(step);
      state = applyStep(state, step);
    }
  };
  flush();
  for (let n = from.level + 1; n <= level; n++) {
    const step: SkillStep = { level: n };
    steps.push(step);
    state = applyStep(state, step);
    flush();
  }
  // Techniques whose gate was never reached still get listed, so the caller reports the problem.
  for (const t of wanted) if (!hasTechnique(state, t)) steps.push({ technique: t });
  return steps;
}

/** Named abilities of a skill with whether each is unlocked. */
export interface AbilityState {
  readonly named: NamedLevelId;
  readonly uses: number;
  readonly kind: 'active' | 'passive' | 'both';
  readonly summary: string;
  readonly unlocked: boolean;
}

export function abilityStates(skill: SySkill, owned: OwnedSkill): AbilityState[] {
  return NAMED_LEVELS.map((named) => {
    const a = skill.levels[named];
    return {
      named,
      uses: a.uses,
      kind: a.kind,
      summary: a.summary,
      unlocked: namedLevelUnlocked(owned, named),
    };
  });
}

/** Result of a prerequisite check: every group met, else readable descriptions of what is not. */
export interface PrereqResult {
  readonly ok: boolean;
  readonly unmet: readonly string[];
}

function orList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1] ?? ''}`;
}

/**
 * Advanced skill prerequisites: each group needs `need` of its skills at the named Technique
 * (Master Technique in 1.3.1, Q-MAG-1 and Q-CRF-1).
 */
export function checkPrereqs(ruleset: SyRuleset, skill: SySkill, owned: OwnedLookup): PrereqResult {
  const unmet: string[] = [];
  for (const group of skill.prereqs) {
    const met = group.of.filter((r) => hasTechnique(owned(r.skill), r.technique)).length;
    if (met >= group.need) continue;
    const names = group.of.map(
      (r) => `${ruleset.skillsById[r.skill]?.name ?? r.skill} (${label(r.technique)} Technique)`,
    );
    unmet.push(
      group.need === group.of.length
        ? names.join(' and ')
        : group.need === 1
          ? orList(names)
          : `${group.need} of ${names.join(', ')}`,
    );
  }
  return { ok: unmet.length === 0, unmet };
}
