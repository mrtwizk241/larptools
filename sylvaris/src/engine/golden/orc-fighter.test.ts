// Golden character 1: Brakka Ironhide, an Orc fighter after 9 events. Every number below is
// hand-derived from the rulebook rules (comments show the arithmetic), not read from the engine.
import { describe, expect, it } from 'vitest';
import { attend, harness, learn } from '../testkit.ts';

function build() {
  const h = harness();
  h.run({
    type: 'createCharacter',
    characterName: 'Brakka Ironhide',
    playerName: 'Sample Player',
    raceId: 'orc',
    concept: 'Front line brawler',
    startingSkills: [
      { skillId: 'weapon-proficiency', level: 3, techniques: ['expert'] },
      { skillId: 'strength', level: 3, techniques: ['expert'] },
      { skillId: 'toughness', level: 3, techniques: ['expert'] },
      { skillId: 'aggression', level: 3 },
    ],
  });
  attend(h, 9);
  learn(h, 'weapon-proficiency', 10, ['expert', 'master', 'grandmaster']);
  learn(h, 'strength', 10, ['expert', 'master', 'grandmaster']);
  return h;
}

describe('golden: Brakka Ironhide (Orc fighter, 9 events)', () => {
  const h = build();
  const sheet = h.sheet();

  it('replays without warnings', () => {
    expect(sheet.warnings).toEqual([]);
  });

  it('XP: earned, spent, available', () => {
    // hand-derived: earned = 150 start + 9 events x 60 = 690
    // spent at creation: WP 35 + Strength 35 + Toughness 35 + Aggression (5+10+15) 30 = 135
    // WP from level 3 + Expert to full: levels 4..10 = 5 x (4+5+6+7+8+9+10) = 245, + Master 10
    //   + Grandmaster 15 = 270; Strength the same 270
    // spent = 135 + 270 + 270 = 675; available = 690 - 675 = 15
    expect(sheet.points.xp).toMatchObject({ earned: 690, spent: 675, available: 15 });
    // hand-derived: cap room = 2000 - 690 = 1310
    expect(sheet.points.xp.capRemaining).toBe(1310);
  });

  it('CXP, AXP, events', () => {
    // hand-derived: 9 events x 5 CXP = 45; 9 x 1 AXP = 9
    expect(sheet.points.cxp.earned).toBe(45);
    expect(sheet.points.axp.earned).toBe(9);
    expect(sheet.fullEvents).toBe(9);
    expect(sheet.callingEligibility.eligible).toBe(true);
  });

  it('passive damage with the caps', () => {
    const d = sheet.stats.passiveDamage;
    // hand-derived two-handed: WP (Expert +2, Master all weapons +1, Grandmaster +2) = 5,
    //   Strength the same 5, Orc melee +1 = 11 (cap 20, not reached)
    expect(d.twoHanded.total).toBe(11);
    expect(d.twoHanded.value).toBe(11);
    // hand-derived one-handed: WP 1 + 1 + 1 = 3, Strength 3, Orc +1 = 7
    expect(d.oneHanded.value).toBe(7);
    // hand-derived all weapons: WP Master 1 + Strength Master 1 = 2
    expect(d.allWeapons.value).toBe(2);
    // hand-derived ranged: the all-weapons bonus only = 2
    expect(d.ranged.value).toBe(2);
    expect(d.relic.value).toBe(0);
    // From behind (no Precision): the same as the melee totals, cap 30
    expect(d.fromBehindTwoHanded).toMatchObject({ value: 11, cap: 30 });
  });

  it('WP and Strength both Grandmaster give +10 two-handed before the cap', () => {
    // hand-derived: (2 + 1 + 2) x 2 skills = 10, before the Orc bonus
    const fromSkills = sheet.stats.passiveDamage.twoHanded.sources
      .filter((s) => s.source.kind === 'skill')
      .reduce((n, s) => n + s.amount, 0);
    expect(fromSkills).toBe(10);
  });

  it('Life Points and grants', () => {
    // hand-derived: base 10 + Toughness Expert 20 = 30
    expect(sheet.stats.lifePoints.value).toBe(30);
    expect(sheet.stats.armorPoints.value).toBe(0);
    const grants = sheet.stats.grants.map((g) => g.grant);
    expect(grants).toContain('dual-wield-long-short');
    expect(grants).toContain('dual-wield-long-long');
  });

  it('Aggression level 3 without its Technique: 3 uses, Basic only', () => {
    const agg = sheet.skills.find((s) => s.skillId === 'aggression');
    expect(agg?.maxUses).toBe(3);
    expect(agg?.abilities.filter((a) => a.unlocked).map((a) => a.named)).toEqual(['basic']);
    // hand-derived: next Technique Expert costs 5 XP, level 3 reached
    expect(agg?.nextTechnique).toEqual({
      technique: 'expert',
      cost: 5,
      needsLevel: 3,
      levelReached: true,
    });
  });

  it('upkeep: the first event is free, then 1 Silver paid', () => {
    expect(sheet.events[0]?.upkeep).toEqual({ dueSilver: 0, coveredBy: null });
    expect(sheet.events[1]?.upkeep).toEqual({ dueSilver: 1, coveredBy: 'paid' });
  });

  it('summary row', () => {
    expect(sheet.race?.name).toBe('Orc');
    expect(sheet.calling).toBeNull();
  });
});
