import { describe, expect, it } from 'vitest';
import { rs } from '../testkit.ts';
import {
  apEarnedByBasic,
  cumulativeCost,
  levelCost,
  maxLevelOf,
  nextLevelCost,
  triangular,
} from './costs.ts';

describe('cost tables [SKL-COST]', () => {
  it('basic levels cost 10 x level CXP, cumulative 10..550', () => {
    const perLevel = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const cumulative = [10, 30, 60, 100, 150, 210, 280, 360, 450, 550];
    for (let n = 1; n <= 10; n++) {
      expect(levelCost(rs, 'basic', n)).toBe(perLevel[n - 1]);
      expect(cumulativeCost(rs, 'basic', n)).toBe(cumulative[n - 1]);
    }
    expect(cumulativeCost(rs, 'basic', 0)).toBe(0);
    expect(maxLevelOf(rs, 'basic')).toBe(10);
    expect(nextLevelCost(rs, 'basic', 9)).toBe(100);
    expect(nextLevelCost(rs, 'basic', 10)).toBeNull();
  });

  it('basic levels earn T(L) AP: 1, 3, 6 ... 55', () => {
    const expected = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55];
    for (let level = 1; level <= 10; level++) {
      expect(apEarnedByBasic(rs, level)).toBe(expected[level - 1]);
      expect(apEarnedByBasic(rs, level)).toBe(triangular(level));
    }
  });

  it.each([
    ['adept', 3],
    ['advanced', 5],
    ['encounter', 2],
    ['passive', 3],
  ] as const)('%s levels cost base x level AP, max 5', (kind, base) => {
    let total = 0;
    for (let n = 1; n <= 5; n++) {
      expect(levelCost(rs, kind, n)).toBe(base * n);
      total += base * n;
      expect(cumulativeCost(rs, kind, n)).toBe(total);
    }
    expect(maxLevelOf(rs, kind)).toBe(5);
    expect(nextLevelCost(rs, kind, 5)).toBeNull();
  });

  it('two levels of Adept cost 3 + 6 = 9 AP (Skill Cost Chart example)', () => {
    expect(cumulativeCost(rs, 'adept', 2)).toBe(9);
  });

  it('memorization is a flat 1 AP per level with no limit', () => {
    for (const n of [1, 2, 5, 6, 20]) {
      expect(levelCost(rs, 'memorization', n)).toBe(1);
      expect(cumulativeCost(rs, 'memorization', n)).toBe(n);
    }
    expect(maxLevelOf(rs, 'memorization')).toBeNull();
    expect(nextLevelCost(rs, 'memorization', 50)).toBe(1);
  });

  it('mastery is 10 AP once', () => {
    expect(levelCost(rs, 'mastery', 1)).toBe(10);
    expect(cumulativeCost(rs, 'mastery', 1)).toBe(10);
    expect(maxLevelOf(rs, 'mastery')).toBe(1);
    expect(nextLevelCost(rs, 'mastery', 1)).toBeNull();
  });
});
