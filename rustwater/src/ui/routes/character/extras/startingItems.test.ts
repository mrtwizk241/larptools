import { describe, expect, it } from 'vitest';
import { countPicks, picksFromCounts, setCount, totalCount } from './startingItems.ts';

describe('starting item counts', () => {
  it('counts repeats and rebuilds picks in option order', () => {
    const counts = countPicks([{ optionId: 'bits' }, { optionId: 'armor' }, { optionId: 'bits' }]);
    expect(counts).toEqual({ bits: 2, armor: 1 });
    expect(totalCount(counts)).toBe(3);
    expect(picksFromCounts(counts, ['armor', 'bits'])).toEqual([
      { optionId: 'armor' },
      { optionId: 'bits' },
      { optionId: 'bits' },
    ]);
  });

  it('keeps existing details up to the new count', () => {
    const existing = [
      { optionId: 'melee', detail: 'short', name: 'Melee' },
      { optionId: 'melee', detail: 'great', name: 'Melee' },
    ];
    expect(picksFromCounts({ melee: 1 }, ['melee'], existing)).toEqual([
      { optionId: 'melee', detail: 'short' },
    ]);
    expect(picksFromCounts({ melee: 3 }, ['melee'], existing)).toEqual([
      { optionId: 'melee', detail: 'short' },
      { optionId: 'melee', detail: 'great' },
      { optionId: 'melee' },
    ]);
  });

  it('clamps a count to the total limit and drops zeros', () => {
    expect(setCount({ bits: 9 }, 'armor', 3, 10)).toEqual({ bits: 9, armor: 1 });
    expect(setCount({ bits: 2 }, 'bits', 0, 10)).toEqual({});
    expect(setCount({}, 'bits', -1, 10)).toEqual({});
  });
});
