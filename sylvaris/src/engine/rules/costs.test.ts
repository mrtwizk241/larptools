import { describe, expect, it } from 'vitest';
import { rs } from '../testkit.ts';
import {
  cumulativeLevelCost,
  fullSkillCost,
  levelCost,
  nextLevelCost,
  skillCost,
  skillCurrency,
  stepCost,
  techniqueCost,
  triangular,
} from './costs.ts';

describe('skill costs [SKL-COST]', () => {
  it('level n costs 5n', () => {
    expect([1, 2, 3, 10].map((n) => levelCost(rs, n))).toEqual([5, 10, 15, 50]);
    expect(levelCost(rs, 0)).toBe(0);
  });

  it('cumulative cost to Expert, Master, Grandmaster levels is 30, 105, 275', () => {
    expect(triangular(4)).toBe(10);
    expect(cumulativeLevelCost(rs, 3)).toBe(30);
    expect(cumulativeLevelCost(rs, 6)).toBe(105);
    expect(cumulativeLevelCost(rs, 10)).toBe(275);
  });

  it('Techniques cost 5, 10, 15', () => {
    expect(techniqueCost(rs, 'expert')).toBe(5);
    expect(techniqueCost(rs, 'master')).toBe(10);
    expect(techniqueCost(rs, 'grandmaster')).toBe(15);
    expect(stepCost(rs, { technique: 'master' })).toBe(10);
    expect(stepCost(rs, { level: 4 })).toBe(20);
  });

  it('Expert plus the Expert Technique costs 35 XP (p.17)', () => {
    // hand-derived: 5 + 10 + 15 + 5 = 35
    expect(skillCost(rs, 3, ['expert'])).toBe(35);
  });

  it('a full skill costs 305 XP', () => {
    // hand-derived: 275 levels + 5 + 10 + 15 = 305
    expect(fullSkillCost(rs)).toBe(305);
  });

  it('the CXP earned cap is two full Calling skills (Q-CALL-1)', () => {
    expect(rs.ruleset.cxp.earnedCap).toBe(2 * fullSkillCost(rs));
  });

  it('Calling skills cost CXP, the rest XP', () => {
    expect(skillCurrency({ category: 'calling' })).toBe('cxp');
    expect(skillCurrency({ category: 'racial' })).toBe('xp');
    expect(skillCurrency({ category: 'offensive' })).toBe('xp');
  });

  it('next level cost stops at the maximum', () => {
    expect(nextLevelCost(rs, 0)).toBe(5);
    expect(nextLevelCost(rs, 9)).toBe(50);
    expect(nextLevelCost(rs, 10)).toBeNull();
  });

  it('the Calling start (Basic in both skills) matches ruleset.calling.startCostCxp', () => {
    expect(2 * levelCost(rs, rs.ruleset.calling.startLevelInBothSkills)).toBe(
      rs.ruleset.calling.startCostCxp,
    );
  });
});
