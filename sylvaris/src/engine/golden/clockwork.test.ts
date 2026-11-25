// Golden character 4: Unit Seven, a Clockwork defender who reaches Armor Plating Grandmaster
// after 4 events. Every number is hand-derived.
import { describe, expect, it } from 'vitest';
import { attend, harness, learn } from '../testkit.ts';

function build() {
  const h = harness();
  h.run({
    type: 'createCharacter',
    characterName: 'Unit Seven',
    playerName: 'Sample Player',
    raceId: 'clockwork',
    startingSkills: [
      { skillId: 'armor-plating', level: 5, techniques: ['expert'] },
      { skillId: 'toughness', level: 3, techniques: ['expert'] },
    ],
  });
  attend(h, 4);
  learn(h, 'armor-plating', 10, ['expert', 'master', 'grandmaster']);
  return h;
}

describe('golden: Unit Seven (Clockwork)', () => {
  const h = build();
  const sheet = h.sheet();

  it('replays without warnings', () => {
    expect(sheet.warnings).toEqual([]);
  });

  it('XP', () => {
    // hand-derived: creation Armor Plating 75 + 5 = 80, Toughness 30 + 5 = 35, spent 115
    //   events: 150 + 4 x 60 = 390 earned
    //   Armor Plating levels 6..10 = 5 x (6+7+8+9+10) = 200, Master 10, Grandmaster 15 = 225
    //   spent 115 + 225 = 340; available 50
    expect(sheet.points.xp).toMatchObject({ earned: 390, spent: 340, available: 50 });
  });

  it('Armor Plating Grandmaster gives 70 Armor Points (Q-RACE-2)', () => {
    // hand-derived: innate 10 + Expert 20 + Master 20 + Grandmaster 20 = 70 (cap 100)
    expect(sheet.stats.armorPoints).toMatchObject({ total: 70, value: 70, cap: 100 });
    expect(sheet.stats.armorPoints.sources.map((s) => s.amount).sort()).toEqual([10, 20, 20, 20]);
    // hand-derived Life Points: 10 + Toughness Expert 20 = 30
    expect(sheet.stats.lifePoints.value).toBe(30);
  });

  it('race rules: Gnomish, refit flags, Wear Armor replaced', () => {
    expect(sheet.race?.language).toEqual({ id: 'gnomish', name: 'Gnomish' });
    expect(sheet.race?.sheetFlags).toEqual({
      healingImmune: true,
      lifeRestoredByRefit: true,
      separateArmorAndLifeRefit: true,
    });
    expect(
      h.fail({ type: 'learnSkill', skillId: 'wear-armor', step: { level: 1 }, teacher: 'A' }),
    ).toEqual(['SKILL_REPLACED']);
  });
});
