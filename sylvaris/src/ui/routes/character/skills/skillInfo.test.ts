import { describe, expect, it } from 'vitest';
import { deriveSheet, loadRuleset } from '../../../../engine/index.ts';
import { mira } from '../../../test/fixtures.ts';
import { ash } from '../../../test/veteran.ts';
import { buildDraft, stepKey } from './requestParts.ts';
import {
  abilityCards,
  filterSkills,
  isLockedSkill,
  nextSteps,
  passiveLines,
  passiveOwned,
  prereqGroups,
  prereqsMissing,
  skillsForCategory,
  type Skill,
} from './skillInfo.ts';

const rs = loadRuleset();
const miraSheet = deriveSheet(rs, mira().actions);
const ashSheet = deriveSheet(rs, ash().actions);

function skill(id: string): Skill {
  const found = rs.skillsById[id];
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe('skill rows', () => {
  it('filters a tab by owned only and a name search', () => {
    const base = { category: 'defensive' as const, query: '', ownedOnly: false };
    expect(filterSkills(rs, miraSheet, base).length).toBe(14);
    expect(filterSkills(rs, miraSheet, { ...base, ownedOnly: true }).map((s) => s.id)).toEqual([
      'toughness',
    ]);
    expect(filterSkills(rs, miraSheet, { ...base, query: 'TOUGH' }).map((s) => s.id)).toEqual([
      'toughness',
    ]);
  });

  it('shows only the character race and Calling skills', () => {
    expect(
      skillsForCategory(rs, miraSheet, 'racial').every((s) => 'raceId' in s && s.raceId === 'elf'),
    ).toBe(true);
    expect(skillsForCategory(rs, miraSheet, 'calling')).toEqual([]);
    expect(skillsForCategory(rs, ashSheet, 'calling').map((s) => s.id)).toEqual([
      'guardianship',
      'protector-protection',
    ]);
    expect(isLockedSkill(ashSheet, skill('guardianship'))).toBe(false);
  });

  it('marks advanced skills with missing prerequisites', () => {
    expect(prereqsMissing(rs, ashSheet, skill('defensive-stance'))).toBe(true);
    expect(prereqsMissing(rs, ashSheet, skill('toughness'))).toBe(false);
    const groups = prereqGroups(rs, ashSheet, skill('defensive-stance'));
    expect(groups.map((g) => [g.lead, g.met, g.items.map((i) => i.name)])).toEqual([
      ['Needs', false, ['Endurance']],
      ['Needs', false, ['Toughness']],
    ]);
  });
});

describe('ability unlock states', () => {
  it('Basic at level 1, the others only with their Technique', () => {
    const fire = abilityCards(rs, miraSheet, skill('fire-magic'));
    expect(fire.map((a) => [a.named, a.unlocked])).toEqual([
      ['basic', true],
      ['expert', true],
      ['master', false],
      ['grandmaster', false],
    ]);
    expect(fire[2]?.lockedReason).toBe('Needs level 6 and the Master Technique.');

    const deflection = abilityCards(rs, ashSheet, skill('deflection'));
    expect(deflection[1]?.unlocked).toBe(false);
    expect(deflection[1]?.lockedReason).toBe('Needs the Expert Technique (level 3 reached).');
    expect(abilityCards(rs, miraSheet, skill('bash'))[0]?.lockedReason).toBe('Needs level 1.');
  });

  it('lists the passives a skill adds', () => {
    expect(passiveLines(skill('toughness'))).toEqual([
      { at: 'expert', atText: 'Expert Technique', text: '+20 Life Points' },
      { at: 'master', atText: 'Master Technique', text: '+20 Life Points' },
      { at: 'grandmaster', atText: 'Grandmaster Technique', text: '+20 Life Points' },
    ]);
  });

  it('marks which passives the character has now (AC-22)', () => {
    const toughness = ashSheet.skills.find((x) => x.skillId === 'toughness');
    expect(passiveOwned(toughness, 'expert')).toBe(true);
    expect(passiveOwned(toughness, 'master')).toBe(false);
    expect(passiveOwned(undefined, 'basic')).toBe(false);
  });
});

describe('request building', () => {
  it('offers the next level and the next Technique when allowed', () => {
    expect(nextSteps(rs, ashSheet, skill('deflection'))).toEqual([
      { level: 4 },
      { technique: 'expert' },
    ]);
    expect(nextSteps(rs, miraSheet, skill('toughness'))).toEqual([{ level: 3 }]);
    expect(nextSteps(rs, miraSheet, skill('bash'))).toEqual([{ level: 1 }]);
  });

  it('builds a draft the engine accepts', () => {
    expect(stepKey({ level: 4 })).toBe('level-4');
    expect(stepKey({ technique: 'expert' })).toBe('technique-expert');
    const draft = buildDraft('mira', 'bash', { level: 1 }, '  Old Tom ');
    expect(draft).toMatchObject({ status: 'draft', teacher: 'Old Tom', skillId: 'bash' });
  });
});
