import { describe, expect, it } from 'vitest';
import { loadRuleset } from '../../../engine/index.ts';
import { EMPTY_DRAFT, WIZARD_STEPS, toStartingItemsCommand } from './steps.ts';

const ruleset = loadRuleset();
const step = WIZARD_STEPS.find((s) => s.id === 'items');

describe('starting items step', () => {
  it('comes right after the starting skills step', () => {
    const ids = WIZARD_STEPS.map((s) => s.id);
    expect(ids.indexOf('items')).toBe(ids.indexOf('skills') + 1);
  });

  it('allows fewer than 10 and refuses more than 10', () => {
    expect(step?.validate(EMPTY_DRAFT, ruleset)).toEqual({});
    expect(step?.validate({ ...EMPTY_DRAFT, startingItems: { bits: 11 } }, ruleset)).toEqual({
      startingItems: 'Choose at most 10 starting items; 11 chosen.',
    });
  });

  it('builds the setStartingItems command in option order, or nothing', () => {
    expect(toStartingItemsCommand(EMPTY_DRAFT, ruleset)).toBeNull();
    expect(
      toStartingItemsCommand(
        { ...EMPTY_DRAFT, startingItems: { bits: 2, 'basic-armor': 1 } },
        ruleset,
      ),
    ).toEqual({
      type: 'setStartingItems',
      picks: [{ optionId: 'basic-armor' }, { optionId: 'bits' }, { optionId: 'bits' }],
    });
  });
});
