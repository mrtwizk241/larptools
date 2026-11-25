import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../../engine/index.ts';
import { ash } from '../../../test/veteran.ts';
import {
  canUseText,
  filterEntries,
  groupItems,
  metaText,
  pickerItems,
  refDetails,
  sourceText,
  statusText,
  summaryText,
} from './journalModel.ts';

const ruleset = loadRuleset();
const sheet = deriveSheet(ruleset, ash().actions);
const [grantLife, lifeDart] = sheet.journals.spellbook;

describe('journal entries', () => {
  it('names the status: pending tag or tagged', () => {
    expect(statusText('pending')).toBe('Pending tag');
    expect(statusText('tagged')).toBe('Tagged');
    expect(grantLife?.status).toBe('tagged');
    expect(lifeDart?.status).toBe('pending');
  });

  it('says how an entry was gained, with the event', () => {
    expect(grantLife && sourceText(sheet, grantLife)).toBe('Starting item');
    expect(lifeDart && sourceText(sheet, lifeDart)).toBe(
      'Taught by Sister Wren at Midsummer Fair (2026-06-20)',
    );
  });

  it('says whether it can be used now, or why not', () => {
    expect(canUseText({ usableNow: true, reason: null })).toBe('Can use now');
    expect(canUseText({ usableNow: false, reason: 'Needs Fire Magic.' })).toBe(
      'Cannot use yet. Needs Fire Magic.',
    );
  });

  it('shows level, use cost, and page reference from the data', () => {
    const details = refDetails(ruleset, 'spell', 'chain-lightning');
    expect(details && metaText(details)).toBe('Basic. Costs 1 use. Rulebook p.118-119.');
  });

  it('groups by school and searches', () => {
    const groups = groupItems(ruleset, 'spell', sheet.journals.spellbook);
    expect(groups.map((g) => [g.name, g.items.map((i) => i.name)])).toEqual([
      ['Life Magic', ['Grant Life', 'Life Dart']],
    ]);
    expect(filterEntries(ruleset, 'spell', sheet.journals.spellbook, 'dart')).toHaveLength(1);
    expect(filterEntries(ruleset, 'spell', sheet.journals.spellbook, 'pending')).toHaveLength(1);
    expect(summaryText(sheet.journals.spellbook)).toBe('1 tagged, 1 pending tag, 2 usable now.');
  });

  it('lists what can be added, without what is recorded, with the reason it is not usable', () => {
    const items = pickerItems(ruleset, sheet, 'spell', 'life');
    expect(items.some((i) => i.refId === 'life-dart')).toBe(false);
    const fire = pickerItems(ruleset, sheet, 'spell', 'chain lightning')[0];
    expect(fire?.usableNow).toBe(false);
    expect(fire?.reason).toBe('Needs Air Magic.');
  });
});
