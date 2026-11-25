import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../../engine/index.ts';
import { ash, ashAfter } from '../../../test/veteran.ts';
import { emberDragonborn } from '../skills/testDragonborn.ts';
import {
  castableSpells,
  castLabel,
  clampSpent,
  resetPeriods,
  RESET_SCOPE,
  restoreFrom,
  restoreUses,
  spendLabel,
  spendUses,
  spentFromTracker,
  trackedUses,
  trackerFromSpent,
  type TrackedUse,
} from './usage.ts';

const ruleset = loadRuleset();
const sheetOf = (character = ash()) => deriveSheet(ruleset, character.actions);

function item(items: readonly TrackedUse[], key: string): TrackedUse {
  const found = items.find((i) => i.key === key);
  if (!found) throw new Error(`No ${key}`);
  return found;
}

describe('trackedUses', () => {
  it('lists every skill with uses (max = level) and the innate active, with stable keys', () => {
    const items = trackedUses(sheetOf());
    expect(items.map((i) => [i.key, i.count, i.period, i.calling])).toEqual([
      ['skill:deflection', 3, 'repop', false],
      ['skill:toughness', 3, 'repop', false],
      ['skill:wear-armor', 3, 'repop', false],
      ['skill:life-magic', 3, 'repop', false],
      ['skill:guardianship', 1, 'repop', true],
      ['skill:protector-protection', 1, 'repop', true],
      ['innate:human-innate-active', 1, 'encounter', false],
    ]);
    expect(item(items, 'innate:human-innate-active')).toMatchObject({
      name: 'Human innate',
      note: 'One "Charm - Ignore Me".',
    });
  });

  it('offers only unlocked named abilities with a use cost', () => {
    const before = item(trackedUses(sheetOf()), 'skill:toughness');
    // Expert Toughness is passive: nothing more to spend.
    expect(before.abilities).toEqual([{ named: 'basic', name: 'Toughness Basic', cost: 1 }]);
    const after = trackedUses(
      sheetOf(
        ashAfter([
          {
            type: 'learnSkill',
            skillId: 'deflection',
            step: { technique: 'expert' },
            teacher: 'Old Jory',
          },
        ]),
      ),
    );
    const deflection = item(after, 'skill:deflection');
    expect(deflection.abilities.map((a) => [a.name, a.cost])).toEqual([
      ['Deflection Basic', 1],
      ['Deflection Expert', 2],
    ]);
    expect(spendLabel(deflection.abilities[1]!)).toBe('Spend 2 uses: Deflection Expert');
  });

  it('lists castable spells with the use cost of their magic skill', () => {
    const sheet = sheetOf();
    const spells = castableSpells(sheet, ruleset, trackedUses(sheet));
    expect(spells.map((s) => [s.name, s.poolKey, s.cost, s.pending])).toEqual([
      ['Grant Life', 'skill:life-magic', 1, false],
      ['Life Dart', 'skill:life-magic', 1, true],
    ]);
    expect(castLabel(spells[0]!)).toBe('Cast Grant Life: 1 use of Life Magic');
  });
});

describe('spend and reset', () => {
  const items = trackedUses(sheetOf());
  const deflection = item(items, 'skill:deflection');
  const innate = item(items, 'innate:human-innate-active');

  it('spends all or nothing and restores', () => {
    let spent = spendUses({}, deflection, 2);
    expect(spent).toEqual({ 'skill:deflection': 2 });
    const refused = spendUses(spent, deflection, 2);
    expect(refused).toBe(spent);
    spent = spendUses(spent, deflection, 1);
    expect(spent['skill:deflection']).toBe(3);
    expect(spendUses(spent, deflection, 1)).toBe(spent);
    expect(restoreUses(spent, deflection, 2)).toEqual({ 'skill:deflection': 1 });
    expect(restoreUses(spent, deflection, 5)).toEqual({});
  });

  it('a new encounter renews innates only; a new re-pop renews everything, Calling included', () => {
    const calling = item(items, 'skill:guardianship');
    const spent = { [deflection.key]: 2, [innate.key]: 1, [calling.key]: 1 };
    expect(resetPeriods(spent, items, RESET_SCOPE.encounter)).toEqual({
      [deflection.key]: 2,
      [calling.key]: 1,
    });
    const repop = resetPeriods(spent, items, RESET_SCOPE.repop);
    expect(repop).toEqual({});
    expect(restoreFrom(repop, spent, items, RESET_SCOPE.repop)).toEqual(spent);
  });

  it('round trips through the tracker record and clamps to current counts', () => {
    const record = trackerFromSpent(
      'c1',
      { [deflection.key]: 2, [innate.key]: 1, 'skill:gone': 4 },
      items,
      '2026-09-19T21:00:00.000Z',
    );
    expect(record).toEqual({
      characterId: 'c1',
      perEncounter: { [innate.key]: 1 },
      perRepop: { [deflection.key]: 2 },
      updatedAt: '2026-09-19T21:00:00.000Z',
    });
    expect(spentFromTracker(record)).toEqual({ [deflection.key]: 2, [innate.key]: 1 });
    expect(clampSpent({ [deflection.key]: 9, 'skill:gone': 1 }, items)).toEqual({
      [deflection.key]: 3,
    });
  });
});

describe('race choices in Play names (AC-8)', () => {
  it("tracks the Dragonborn's Gift by its element name", () => {
    const sheet = deriveSheet(ruleset, emberDragonborn().actions);
    const names = trackedUses(sheet).map((t) => t.name);
    expect(names).toContain("Fire's Gift");
    expect(names.join(' ')).not.toContain('<Element>');
    const innate = trackedUses(sheet).find((t) => t.kind === 'innate');
    expect(innate?.note).toContain('Basic Fire spell');
  });
});
