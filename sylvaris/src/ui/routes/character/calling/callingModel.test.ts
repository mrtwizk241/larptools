import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../../engine/index.ts';
import { lark } from '../../../test/fixtures.ts';
import { ash } from '../../../test/veteran.ts';
import { ashBeforeCalling } from './testCharacter.ts';
import {
  callingNumbers,
  eligibility,
  eligibilityText,
  statLabel,
  statValue,
  techniqueState,
} from './callingModel.ts';

const ruleset = loadRuleset();

describe('Calling eligibility', () => {
  it('is met with five full events and 10 CXP', () => {
    const sheet = deriveSheet(ruleset, ashBeforeCalling().actions);
    const e = eligibility(ruleset, sheet);
    expect(e.eligible).toBe(true);
    expect(eligibilityText(e)).toBe('Can start a Calling.');
    expect(e.lines.map((l) => l.text)).toEqual([
      'Full events attended: 6. A Calling needs 5 before its start event.',
      'CXP available: 30 (needs 10 for Basic in both skills).',
    ]);
  });

  it('says what is missing for a new character', () => {
    const sheet = deriveSheet(ruleset, lark().actions);
    const e = eligibility(ruleset, sheet);
    expect(e.eligible).toBe(false);
    expect(eligibilityText(e)).toMatch(/^Missing: \d+ more full events? and 10 more CXP\.$/);
  });

  it('the build playground needs only the CXP and shows only the balance rule', () => {
    const fresh = deriveSheet(ruleset, lark().actions);
    const e = eligibility(ruleset, fresh, true);
    expect(eligibilityText(e)).toBe('Missing: 10 more CXP.');
    expect(e.lines.map((l) => l.text)).toEqual([
      'CXP available: 0 (needs 10 for Basic in both skills).',
    ]);
    const sheet = deriveSheet(ruleset, ash().actions);
    const calling = sheet.calling;
    if (!calling) throw new Error('Ash has a Calling');
    expect(techniqueState(ruleset, sheet, calling, true).map((r) => r.label)).toEqual(['Balance']);
  });
});

describe('Calling numbers and Technique rules', () => {
  const sheet = deriveSheet(ruleset, ash().actions);

  it('labels the numbers the Calling sets', () => {
    expect(statLabel('wardInterceptSlots')).toBe('Ward intercept slots');
    expect(statLabel('someNewStat')).toBe('Some new stat');
    // AC-12: chosen ids read as names.
    expect(statValue('water')).toBe('Water');
    expect(statValue(true)).toBe('Yes');
    expect(statValue(3)).toBe('3');
    expect(callingNumbers(sheet)).toEqual(
      expect.arrayContaining([
        { label: 'Wards at once', value: '1' },
        { label: 'Armor refit count', value: '100' },
      ]),
    );
  });

  it('shows the start event, the last Technique, and the balance', () => {
    const calling = sheet.calling;
    if (!calling) throw new Error('no Calling');
    expect(techniqueState(ruleset, sheet, calling)).toEqual([
      { label: 'Started at', value: 'Harvest Moon (2026-09-19)' },
      { label: 'Last Technique', value: 'None yet' },
      {
        label: 'Balance',
        value:
          'Guardianship: Basic only, Protection: Basic only. Within 1 Technique of each other.',
      },
      { label: 'Rules', value: '1 Calling Technique per event, none at the start event.' },
    ]);
  });
});
