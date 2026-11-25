// Golden character 5: Seren Holt, a Human who starts The Protector at her 6th event.
// Every number is hand-derived.
import { describe, expect, it } from 'vitest';
import { preview } from '../commands/plan.ts';
import { attend, harness, rs } from '../testkit.ts';

function build() {
  const h = harness();
  h.run({
    type: 'createCharacter',
    characterName: 'Seren Holt',
    playerName: 'Sample Player',
    raceId: 'human',
    startingSkills: [
      { skillId: 'toughness', level: 3, techniques: ['expert'] },
      { skillId: 'wear-armor', level: 3, techniques: ['expert'] },
      { skillId: 'deflection', level: 2 },
    ],
  });
  const keys = attend(h, 6);
  const sixth = keys[5] ?? '';
  h.run({ type: 'startCalling', callingId: 'protector', eventKey: sixth, teacher: 'Calling book' });
  h.run({ type: 'learnSkill', skillId: 'guardianship', step: { level: 2 }, eventKey: sixth });
  h.run({
    type: 'learnSkill',
    skillId: 'protector-protection',
    step: { level: 2 },
    eventKey: sixth,
  });
  return { h, sixth };
}

describe('golden: Seren Holt (The Protector after 6 events)', () => {
  const { h, sixth } = build();
  const sheet = h.sheet();

  it('replays without warnings', () => {
    expect(sheet.warnings).toEqual([]);
  });

  it('points', () => {
    // hand-derived XP: 150 + 6 x 60 = 510 earned; creation 35 + 35 + 15 = 85 spent; 425 left
    expect(sheet.points.xp).toMatchObject({ earned: 510, spent: 85, available: 425 });
    // hand-derived CXP: 6 x 5 = 30 earned; start 5 + 5 = 10, level 2 in both 10 + 10 = 20;
    //   spent 30, 0 left; cap room 610 - 30 = 580
    expect(sheet.points.cxp).toMatchObject({
      earned: 30,
      spent: 30,
      available: 0,
      capRemaining: 580,
    });
  });

  it('the Calling', () => {
    expect(sheet.calling).toMatchObject({
      callingId: 'protector',
      name: 'The Protector',
      status: 'active',
      startedEventKey: sixth,
      balance: { tiers: { guardianship: 0, 'protector-protection': 0 }, gap: 0, ok: true },
    });
    const g = sheet.skills.find((s) => s.skillId === 'guardianship');
    expect(g).toMatchObject({ level: 2, currency: 'cxp', spent: 15, locked: false });
    // hand-derived: Wards 1; Ward intercept slots 1 (Guardianship Basic passive);
    //   Protection stack 1 + 0 Techniques = 1; armor refit count 100
    const other = Object.fromEntries(sheet.stats.other.map((o) => [o.stat, o.value]));
    expect(other).toMatchObject({
      wardsMax: 1,
      wardInterceptSlots: 1,
      protectionStackMax: 1,
      armorRefitCount: 100,
    });
    // hand-derived armor: Wear Armor Expert 20; Life: 10 + Toughness Expert 20 = 30
    expect(sheet.stats.armorPoints.value).toBe(20);
    expect(sheet.stats.lifePoints.value).toBe(30);
  });

  it('the next level needs more CXP than is left', () => {
    const p = preview(rs, sheet, {
      type: 'learnSkill',
      skillId: 'guardianship',
      step: { level: 3 },
      eventKey: sixth,
    });
    // hand-derived: level 3 costs 15 CXP, 0 left
    expect(p.errors.map((e) => e.code)).toEqual(['NOT_ENOUGH_CXP']);
  });

  it('Human silver at every check-in', () => {
    expect(sheet.events.every((e) => e.handedOut.includes('1 Silver (Human innate)'))).toBe(true);
    expect(sheet.events.map((e) => e.upkeep.dueSilver)).toEqual([0, 1, 1, 1, 1, 1]);
  });
});
