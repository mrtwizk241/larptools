import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../../engine/index.ts';
import { ash, ASH_LATEST_EVENT } from '../../../test/veteran.ts';
import { emberDragonborn } from '../skills/testDragonborn.ts';
import { buildReceipt, receiptEvents } from './receipt.ts';
import {
  callingChoicesText,
  innateLines,
  raceChoicesText,
  journalGroups,
  journalLine,
  languagesText,
  pointsRows,
  skillGroups,
  skillUsesText,
  slotsText,
  startingItemText,
  techniquesText,
  upkeepText,
} from './sheetModel.ts';

const ruleset = loadRuleset();
const sheet = deriveSheet(ruleset, ash().actions);

describe('print sheet model', () => {
  it('has the points table with earned, spent, and left', () => {
    expect(pointsRows(ruleset, sheet)).toEqual([
      { label: 'XP', earned: 510, spent: 130, available: 380 },
      { label: 'CXP', earned: 30, spent: 10, available: 20 },
      { label: 'AXP', earned: 6, spent: 0, available: 6 },
      { label: 'MT', earned: 200, spent: 50, available: 150 },
    ]);
  });

  it('prints race innates in one line each, and the stats lines', () => {
    expect(innateLines(sheet)).toEqual([
      'Passive: One extra Silver at every event check-in.',
      'Active, 1 per encounter: One "Charm - Ignore Me".',
    ]);
    expect(slotsText(sheet)).toBe('Enhancement 4, Attunement 6, Greater Boon 4, Lesser Boon 4');
    expect(languagesText(sheet)).toBe('Common');
    expect(upkeepText(sheet)).toBe('1 Silver per event (first event free)');
  });

  it('groups skills by category with Techniques and compact uses', () => {
    const groups = skillGroups(sheet);
    expect(groups.map((g) => [g.name, g.skills.map((s) => s.name)])).toEqual([
      ['Defensive', ['Deflection', 'Toughness', 'Wear Armor']],
      ['Magic', ['Life Magic']],
      ['Calling', ['Guardianship', 'Protection']],
    ]);
    const toughness = groups[0]?.skills[1];
    if (!toughness) throw new Error('No Toughness');
    expect(techniquesText(toughness.techniques)).toBe('Expert');
    expect(skillUsesText(toughness)).toBe('3/re-pop: B1');
    expect(techniquesText([])).toBe('None');
  });

  it('lists journal entries with status and starting items by name', () => {
    const groups = journalGroups(sheet);
    expect(groups.map((g) => g.title)).toEqual(['Spellbook']);
    expect(groups[0]?.entries.map((e) => journalLine(ruleset, e))).toEqual([
      'Grant Life (Basic, Life), Tagged',
      'Life Dart (Basic, Life), Pending tag',
    ]);
    expect(sheet.startingItems.map((s) => startingItemText(ruleset, s))).toContain(
      'Basic Spell in Spellbook: Grant Life',
    );
  });
});

describe('check-in receipt', () => {
  it('lists events newest first', () => {
    expect(receiptEvents(sheet)[0]?.key).toBe(ASH_LATEST_EVENT);
  });

  it('builds awards after caps, Mist Token purchases, items, and upkeep for one event', () => {
    const receipt = buildReceipt(ruleset, sheet, '2026-08-15-ember-night');
    expect(receipt).not.toBeNull();
    expect(receipt?.event.name).toBeTruthy();
    expect(receipt?.awards.map((a) => [a.currency, a.amount])).toEqual(
      expect.arrayContaining([
        ['xp', 60],
        ['cxp', 5],
        ['axp', 1],
      ]),
    );
    expect(receipt?.purchases).toEqual([
      expect.objectContaining({ name: 'Basic Component', cost: 50 }),
    ]);
    expect(receipt?.mtSpent).toBe(50);
    expect(receipt?.handedOut).toContain('1 Silver (Human innate)');
    expect(receipt?.owed).toEqual([{ text: 'Basic Shield repair kit', delivered: false }]);
    expect(receipt?.upkeep).toEqual({ due: false, text: 'Upkeep: 1 Silver, paid.' });
  });

  it('the first event has no upkeep, and an unknown event gives null', () => {
    expect(buildReceipt(ruleset, sheet, '2026-04-18-spring-thaw')?.upkeep).toEqual({
      due: false,
      text: 'No upkeep due.',
    });
    expect(buildReceipt(ruleset, sheet, '2030-01-01-nope')).toBeNull();
  });
});

describe('race choices on paper (AC-8, AC-13)', () => {
  const ember = deriveSheet(ruleset, emberDragonborn().actions);

  it('prints the element and natural weapon, and the element in skill names and innates', () => {
    expect(raceChoicesText(ruleset, ember)).toBe(
      'Element: Fire. Natural weapon: Bite (Greatclaw), base 3 damage',
    );
    const racial = skillGroups(ember).find((g) => g.id === 'racial');
    expect(racial?.skills.map((s) => s.displayName)).toEqual(['Breath Weapon', "Fire's Gift"]);
    expect(racial?.skills.map((s) => s.skillId)).toEqual(['breath-weapon', 'elements-gift']);
    expect(innateLines(ember).join(' ')).toContain('one Basic Fire spell');
    expect(callingChoicesText(ruleset, ember)).toBe('');
  });

  it('prints the Calling choices', () => {
    const calling = sheet.calling;
    if (!calling) throw new Error('Ash has a Calling');
    const mage = {
      ...sheet,
      calling: { ...calling, callingId: 'elemental-mage', choices: { element: 'fire' } },
    };
    expect(callingChoicesText(ruleset, mage)).toBe('Aligned element: Fire');
  });
});
