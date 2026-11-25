// The rulebook's worked examples, built through plan() from commands. Hand-derived.
import { describe, expect, it } from 'vitest';
import { grant, harness, learn, withCharacter } from '../testkit.ts';

describe('rulebook worked examples', () => {
  it('Expert plus the Expert Technique costs 35 XP (p.17, Dwarf racial skill)', () => {
    const h = harness();
    h.run({
      type: 'createCharacter',
      characterName: 'Durra Stonebrow',
      playerName: 'Sample Player',
      raceId: 'dwarf',
      startingSkills: [{ skillId: 'dwarven-persistence', level: 3, techniques: ['expert'] }],
    });
    // hand-derived: 5 + 10 + 15 + 5 = 35; 150 - 35 = 115 left
    expect(h.sheet().points.xp).toMatchObject({ spent: 35, available: 115 });
    expect(h.sheet().learningLog.map((l) => l.cost)).toEqual([5, 10, 15, 5]);
  });

  it('a level 8 Aggression with no Techniques has 8 uses and only Basic unlocked (p.88)', () => {
    const h = withCharacter();
    grant(h, 'xp', 100);
    learn(h, 'aggression', 8);
    const agg = h.sheet().skills.find((s) => s.skillId === 'aggression');
    // hand-derived: one use per level = 8; levels 1..8 cost 5 x 36 = 180
    expect(agg?.maxUses).toBe(8);
    expect(agg?.spent).toBe(180);
    expect(agg?.abilities.map((a) => a.unlocked)).toEqual([true, false, false, false]);
  });

  it('a full skill costs 305 XP, and Toughness Grandmaster gives 70 Life Points', () => {
    const h = withCharacter();
    grant(h, 'xp', 200);
    learn(h, 'toughness', 10, ['expert', 'master', 'grandmaster']);
    const sheet = h.sheet();
    // hand-derived: 275 + 5 + 10 + 15 = 305; 350 - 305 = 45 left
    expect(sheet.points.xp).toMatchObject({ spent: 305, available: 45 });
    // hand-derived: base 10 + 20 + 20 + 20 = 70
    expect(sheet.stats.lifePoints).toMatchObject({ total: 70, value: 70 });
  });

  it('Clockwork Armor Plating Grandmaster gives 70 Armor Points', () => {
    const h = withCharacter({ raceId: 'clockwork' });
    grant(h, 'xp', 200);
    learn(h, 'armor-plating', 10, ['expert', 'master', 'grandmaster']);
    // hand-derived: innate 10 + 20 + 20 + 20 = 70
    expect(h.sheet().stats.armorPoints.value).toBe(70);
  });

  it('Weapon Proficiency and Strength both Grandmaster give +10 two-handed before the cap', () => {
    const h = withCharacter();
    grant(h, 'xp', 500);
    learn(h, 'weapon-proficiency', 10, ['expert', 'master', 'grandmaster']);
    learn(h, 'strength', 10, ['expert', 'master', 'grandmaster']);
    // hand-derived: (2 + 1 + 2) per skill x 2 = 10 (Human adds nothing)
    expect(h.sheet().stats.passiveDamage.twoHanded).toMatchObject({
      total: 10,
      value: 10,
      cap: 20,
    });
  });

  it('Precision adds from behind (cap 30), ranged, and relic damage', () => {
    const h = withCharacter({ raceId: 'orc' });
    grant(h, 'xp', 1300);
    for (const id of ['weapon-proficiency', 'strength', 'precision'])
      learn(h, id, 10, ['expert', 'master', 'grandmaster']);
    const d = h.sheet().stats.passiveDamage;
    // hand-derived two-handed: WP 5 + Strength 5 + Orc 1 = 11; from behind + Precision 2+2+2 = 17
    expect(d.twoHanded.value).toBe(11);
    expect(d.fromBehindTwoHanded).toMatchObject({ total: 17, value: 17, cap: 30 });
    // hand-derived ranged: all weapons 2 + Precision ranged 3 = 5; relic: Precision 3
    expect(d.ranged.value).toBe(5);
    expect(d.relic.value).toBe(3);
  });
});
