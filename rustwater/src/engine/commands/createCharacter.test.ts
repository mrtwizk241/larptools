import { describe, expect, it } from 'vitest';
import { BASE_CHARACTER, harness, withCharacter } from '../testkit.ts';
import type { CreateCharacterCommand } from './createCharacter.ts';

function create(overrides: Partial<CreateCharacterCommand>) {
  return harness().plan({ ...BASE_CHARACTER, ...overrides });
}

function codes(result: ReturnType<typeof create>): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('createCharacter', () => {
  it('produces character.created, the LXP pick, and one skill.learned per level', () => {
    const result = create({
      extraInfection: 2,
      age: 3,
      playerEmail: 'player@example.com',
      startingLxpAbilityId: 'human-resilience',
      startingSkills: [
        { skillId: 'assault', part: 'adept', level: 1 }, // listed first, bought after the basic
        { skillId: 'assault', part: 'basic', level: 3 },
        { skillId: 'toughness-warrior', part: 'main', level: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.actions.map((a) => a.type)).toEqual([
      'character.created',
      'ancestry.leveled',
      'skill.learned',
      'skill.learned',
      'skill.learned',
      'skill.learned',
      'skill.learned',
    ]);
    expect(result.actions.map((a) => a.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.actions.map((a) => (a.payload as { part?: string }).part)).toEqual([
      undefined,
      undefined,
      'basic',
      'basic',
      'basic',
      'adept',
      'main',
    ]);
    const created = result.actions[0];
    expect(created?.payload).toMatchObject({
      characterName: 'Mara Quill',
      extraInfection: 2,
      startingCxp: 250,
      infectionBonusCxp: 20,
    });
    expect(result.actions[2]?.payload).toEqual({
      skillId: 'assault',
      part: 'basic',
      toLevel: 1,
      cost: { currency: 'cxp', amount: 10 },
      atCreation: true,
    });
    expect(result.actions.slice(1).every((a) => a.causedBy === created?.id)).toBe(true);
    expect(result.notices.map((n) => n.code)).toEqual(['CXP_UNSPENT']);
  });

  it('a created character replays to the expected sheet', () => {
    const h = withCharacter({
      extraInfection: 2,
      startingLxpAbilityId: 'make-it-work',
      startingSkills: [
        { skillId: 'assault', part: 'basic', level: 6 },
        { skillId: 'bash', part: 'basic', level: 3 },
      ],
    });
    const sheet = h.sheet();
    expect(sheet.points.cxp).toMatchObject({ total: 270, spent: 270, available: 0 });
    expect(sheet.points.ap['warrior']).toEqual({ earned: 27, spent: 0, available: 27 });
    expect(sheet.infection).toMatchObject({ base: 3, extra: 2, current: 5 });
    expect(sheet.ancestry?.abilities[1]?.level).toBe(2);
    expect(sheet.points.lxp.available).toBe(0);
  });

  it('allows CXP within 250 plus the infection bonus only', () => {
    const skills = [
      { skillId: 'assault', part: 'basic' as const, level: 6 },
      { skillId: 'bash', part: 'basic' as const, level: 3 },
    ];
    expect(create({ extraInfection: 2, startingSkills: skills }).ok).toBe(true);
    const tooMuch = create({ extraInfection: 0, startingSkills: skills });
    expect(codes(tooMuch)).toEqual(['NOT_ENOUGH_CXP']);
    expect(tooMuch.ok ? '' : tooMuch.errors[0]?.message).toBe('Not enough CXP: needs 60, 40 left.');
  });

  it('notes an unspent starting LXP', () => {
    const result = create({});
    expect(result.ok && result.notices.map((n) => n.code)).toEqual(['LXP_UNSPENT', 'CXP_UNSPENT']);
  });

  it('rejects an unknown ancestry or a subtype of another ancestry', () => {
    expect(codes(create({ ancestryId: 'dragon' }))).toEqual(['UNKNOWN_ANCESTRY']);
    expect(codes(create({ subtypeId: 'elf-windwalker' }))).toEqual(['UNKNOWN_SUBTYPE']);
  });

  it('allows 0-2 extra infection, and none for Aware (Q-ANC-1)', () => {
    expect(codes(create({ extraInfection: 3 }))).toEqual(['EXTRA_INFECTION_RANGE']);
    expect(
      codes(create({ ancestryId: 'aware', subtypeId: 'aware-death-memory', extraInfection: 1 })),
    ).toEqual(['EXTRA_INFECTION_AWARE']);
    const aware = withCharacter({ ancestryId: 'aware', subtypeId: 'aware-death-memory' });
    expect(aware.sheet().infection).toMatchObject({
      track: 'connection',
      label: 'Connection Damage',
      base: 0,
      current: 0,
    });
  });

  it('requires a valid From Legends choice for Cryptids only', () => {
    const cryptid = { ancestryId: 'cryptid', subtypeId: 'cryptid-winged' };
    expect(codes(create(cryptid))).toEqual(['FROM_LEGENDS_REQUIRED']);
    expect(codes(create({ ...cryptid, fromLegendsChoice: 'deep-pockets' }))).toEqual([
      'FROM_LEGENDS_INVALID',
    ]);
    expect(codes(create({ fromLegendsChoice: 'accuracy' }))).toEqual(['FROM_LEGENDS_INVALID']);
    expect(create({ ...cryptid, fromLegendsChoice: 'accuracy' }).ok).toBe(true);
  });

  it('the starting LXP can only raise one of the two abilities', () => {
    expect(codes(create({ startingLxpAbilityId: 'quick-reflexes' }))).toEqual(['UNKNOWN_ABILITY']);
  });

  it('rejects mastery and cognitive powers at creation', () => {
    const rich = { retirement: { fromName: 'Old Hal', cxp: 600, fp: 0, shinies: 0 } };
    const mastery = create({
      ...rich,
      startingSkills: [
        { skillId: 'assault', part: 'basic', level: 9 },
        { skillId: 'assault', part: 'mastery', level: 1 },
      ],
    });
    expect(codes(mastery)).toEqual(['NOT_AT_CREATION']);
    expect(mastery.ok ? '' : mastery.errors[0]?.ruleId).toBe('SKL-MASTERY');
    const magic = create({
      ...rich,
      startingSkills: [
        { skillId: 'life-magic', part: 'basic', level: 6 },
        { skillId: 'death-magic', part: 'basic', level: 6 },
        { skillId: 'blood-magic', part: 'main', level: 1 },
      ],
    });
    expect(codes(magic)).toEqual(['NOT_AT_CREATION']);
  });

  it('reports every bad starting skill, not just the first', () => {
    const result = create({
      startingSkills: [
        { skillId: 'assault', part: 'basic', level: 11 },
        { skillId: 'no-such-skill', part: 'basic', level: 1 },
        { skillId: 'bardic-performance', part: 'basic', level: 1 },
      ],
    });
    // Basic parts are checked first, then the rest in the order given.
    expect(codes(result)).toEqual(['MAX_LEVEL', 'ARCHETYPE_REQUIRED', 'UNKNOWN_SKILL']);
  });

  it('starts a retirement character with the carry-over (worked example: 350 carry, LXP 2)', () => {
    const h = withCharacter({ retirement: { fromName: 'Old Hal', cxp: 350, fp: 4, shinies: 120 } });
    const sheet = h.sheet();
    expect(sheet.points.cxp.total).toBe(600);
    expect(sheet.points.cxp.earned).toBe(0);
    expect(sheet.points.lxp.total).toBe(2);
    expect(sheet.points.fp.total).toBe(4);
    expect(sheet.points.shinies.balance).toBe(120);
    expect(sheet.profile.retirementFrom?.fromName).toBe('Old Hal');
  });

  it('cannot create a character twice', () => {
    const h = withCharacter();
    const again = h.plan({ ...BASE_CHARACTER });
    expect(again.ok ? [] : again.errors.map((e) => e.code)).toEqual(['ALREADY_CREATED']);
  });

  it('rejects blank names as an invalid command', () => {
    const result = create({ characterName: '   ' });
    expect(codes(result)).toEqual(['INVALID_COMMAND']);
  });
});
