import { describe, expect, it } from 'vitest';
import { loadSylvarisRuleset } from '../../data/index.ts';
import {
  displayContext,
  displayRuleText,
  displaySkillName,
  naturalWeaponText,
  NO_DISPLAY_CONTEXT,
  skillDisplayNameFor,
} from './displayName.ts';

const rs = loadSylvarisRuleset();
const fire = displayContext(rs, { raceId: 'dragonborn', choices: { element: 'fire' } });
const water = displayContext(rs, { raceId: 'dragonborn', choices: { element: 'water' } });
const breath = (named: 'basic' | 'expert' | 'master' | 'grandmaster') =>
  rs.skillsById['breath-weapon']?.levels[named].summary ?? '';

describe('display names filled from race choices [RACE-DRAGONBORN]', () => {
  it("names the Dragonborn's Gift after the chosen element and keeps the id", () => {
    expect(displaySkillName("<Element>'s Gift", fire)).toBe("Fire's Gift");
    expect(
      skillDisplayNameFor(rs, 'elements-gift', {
        raceId: 'dragonborn',
        choices: { element: 'water' },
      }),
    ).toBe("Water's Gift");
    expect(skillDisplayNameFor(rs, 'elements-gift', null)).toBe("<Element>'s Gift");
    expect(rs.skillsById['elements-gift']?.id).toBe('elements-gift');
  });

  it('keeps generic text without an element', () => {
    expect(displayContext(rs, { raceId: 'dragonborn', choices: {} })).toEqual(NO_DISPLAY_CONTEXT);
    expect(displayContext(rs, { raceId: 'elf', choices: { element: 'fire' } })).toEqual(
      NO_DISPLAY_CONTEXT,
    );
    expect(displayRuleText(breath('basic'), NO_DISPLAY_CONTEXT)).toBe(breath('basic'));
    expect(displaySkillName('Toughness', fire)).toBe('Toughness');
  });

  it('fills the element into Breath Weapon, using the second number for Fire', () => {
    expect(displayRuleText(breath('basic'), fire)).toBe('Throw one breath packet for 10 Fire.');
    expect(displayRuleText(breath('basic'), water)).toBe(
      'Throw one breath packet for 25 Ice (Water).',
    );
    expect(displayRuleText(breath('expert'), fire)).toBe('Frontal Cone for 25 Fire.');
    expect(displayRuleText(breath('master'), water)).toBe(
      'Frontal Cone for 100 Magic (Water advanced effect).',
    );
    expect(displayRuleText(breath('grandmaster'), fire)).toContain(
      'packets for 10 Fire or Destruction (Fire). Ends',
    );
  });

  it('names the element in spell texts', () => {
    expect(displayRuleText('Innate cast a Basic spell of your element.', fire)).toBe(
      'Innate cast a Basic Fire spell.',
    );
    expect(displayRuleText('Something of your element.', water)).toBe(
      'Something of your element (Water).',
    );
  });
});

describe('chosen natural weapon in the innate text', () => {
  const innate = rs.raceInnatesById['dragonborn-innate-passive'];
  it('names the chosen weapon, else keeps the generic text', () => {
    if (!innate) throw new Error('innate');
    expect(naturalWeaponText(innate, { 'natural-weapon': 'bite' })).toBe(
      'Natural weapon: Bite (Greatclaw), base 3 damage.',
    );
    expect(naturalWeaponText(innate, { 'natural-weapon': 'short-claws' })).toBe(
      'Natural weapon: Short Claws, base 2 damage.',
    );
    expect(naturalWeaponText(innate, {})).toBe(innate.summary);
  });
});
