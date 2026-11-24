// Skill cost tables, read from ruleset.json ([SKL-COST], [PTS-CXP-SPEND], [PTS-AP-SPEND], [PTS-AP-EARN]).
import type { Ruleset, Skill } from '../../data/index.ts';
import type { SkillPart } from '../model.ts';

export type CostKind =
  'basic' | 'adept' | 'advanced' | 'encounter' | 'passive' | 'memorization' | 'mastery';

export type PartDef = NonNullable<Skill['parts']['basic']>;

/** Triangular number T(n) = n(n+1)/2. */
export function triangular(n: number): number {
  return n <= 0 ? 0 : (n * (n + 1)) / 2;
}

export function partDef(skill: Skill, part: SkillPart): PartDef | undefined {
  return skill.parts[part];
}

/** Basic parts cost CXP; every other part costs AP from the skill's archetype. */
export function currencyOf(costKind: CostKind): 'cxp' | 'ap' {
  return costKind === 'basic' ? 'cxp' : 'ap';
}

/** Cost of buying level n (from n - 1). */
export function levelCost(ruleset: Ruleset, costKind: CostKind, n: number): number {
  if (n <= 0) return 0;
  if (costKind === 'basic') return ruleset.ruleset.basicSkill.costPerLevel * n;
  const line = ruleset.ruleset.archetypeSkill.costs[costKind];
  return line.scaling === 'escalating' ? line.costPerLevel * n : line.costPerLevel;
}

/** Total cost of levels 1..L. Basic L = 10 costs 550. */
export function cumulativeCost(ruleset: Ruleset, costKind: CostKind, level: number): number {
  if (level <= 0) return 0;
  if (costKind === 'basic') return ruleset.ruleset.basicSkill.costPerLevel * triangular(level);
  const line = ruleset.ruleset.archetypeSkill.costs[costKind];
  return line.scaling === 'escalating'
    ? line.costPerLevel * triangular(level)
    : line.costPerLevel * level;
}

/** Highest level a part can reach, or null when there is no limit (memorization). */
export function maxLevelOf(ruleset: Ruleset, costKind: CostKind): number | null {
  if (costKind === 'basic') return ruleset.ruleset.basicSkill.maxLevel;
  return ruleset.ruleset.archetypeSkill.costs[costKind].maxLevel;
}

/** AP earned in the skill's archetype by owning basic levels 1..L: T(L) at 1 AP per level. */
export function apEarnedByBasic(ruleset: Ruleset, level: number): number {
  return ruleset.ruleset.apPerBasicLevel * triangular(level);
}

/** Cost of the next level, or null when the part is at its maximum. */
export function nextLevelCost(ruleset: Ruleset, costKind: CostKind, level: number): number | null {
  const max = maxLevelOf(ruleset, costKind);
  if (max !== null && level >= max) return null;
  return levelCost(ruleset, costKind, level + 1);
}
