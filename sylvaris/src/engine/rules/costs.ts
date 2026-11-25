// Skill cost math, read from ruleset.json ([SKL-COST], [SKL-TECH], Q-CALL-1).
// Level n costs costPerLevel x n; Techniques cost the table's price. Calling skills use the same
// table paid in CXP; every other skill pays XP.
import type { SyRuleset, SySkill } from '../../data/index.ts';
import { TECHNIQUES, type SkillStep, type TechniqueId } from '../model.ts';

export type SkillCurrency = 'xp' | 'cxp';

/** Triangular number T(n) = n(n+1)/2. */
export function triangular(n: number): number {
  return n <= 0 ? 0 : (n * (n + 1)) / 2;
}

/** XP (or CXP) for buying level n of a skill. */
export function levelCost(ruleset: SyRuleset, n: number): number {
  return n <= 0 ? 0 : ruleset.ruleset.skills.costPerLevel * n;
}

/** Total for levels 1..level. Level 3 is 30, level 6 is 105, level 10 is 275. */
export function cumulativeLevelCost(ruleset: SyRuleset, level: number): number {
  return ruleset.ruleset.skills.costPerLevel * triangular(level);
}

/** The Technique table row (level needed, price, Technique needed first). */
export function techniqueRow(ruleset: SyRuleset, technique: TechniqueId) {
  const row = ruleset.techniquesById[technique];
  if (!row) throw new Error(`ruleset has no ${technique} Technique`);
  return row;
}

export function techniqueCost(ruleset: SyRuleset, technique: TechniqueId): number {
  return techniqueRow(ruleset, technique).cost;
}

/** Price of one purchase step. */
export function stepCost(ruleset: SyRuleset, step: SkillStep): number {
  return 'level' in step ? levelCost(ruleset, step.level) : techniqueCost(ruleset, step.technique);
}

/** Everything paid for a skill owned at `level` with `techniques`. */
export function skillCost(
  ruleset: SyRuleset,
  level: number,
  techniques: Iterable<TechniqueId>,
): number {
  let total = cumulativeLevelCost(ruleset, level);
  for (const t of techniques) total += techniqueCost(ruleset, t);
  return total;
}

/** A full skill: every level plus every Technique (305 XP in 1.3.1). */
export function fullSkillCost(ruleset: SyRuleset): number {
  return skillCost(ruleset, ruleset.ruleset.skills.maxLevel, TECHNIQUES);
}

/** Calling skills are paid in CXP (Q-CALL-1), every other skill in XP. */
export function skillCurrency(skill: Pick<SySkill, 'category'>): SkillCurrency {
  return skill.category === 'calling' ? 'cxp' : 'xp';
}

/** Price of the next level, or null at the maximum level. */
export function nextLevelCost(ruleset: SyRuleset, level: number): number | null {
  return level >= ruleset.ruleset.skills.maxLevel ? null : levelCost(ruleset, level + 1);
}
