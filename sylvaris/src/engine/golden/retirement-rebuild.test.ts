// Golden character 6: Old Bear, a Totemic who retires after 20 events, and Young Bear, the
// Beast-Kin rebuilt from the retirement share without the creation limits. Hand-derived.
import { describe, expect, it } from 'vitest';
import { attend, harness } from '../testkit.ts';

function oldBear() {
  const h = harness();
  h.run({
    type: 'createCharacter',
    characterName: 'Old Bear',
    playerName: 'Sample Player',
    raceId: 'totemic',
    choices: { totem: 'Bear' },
    startingSkills: [
      { skillId: 'live-off-the-land', level: 3, techniques: ['expert'] },
      { skillId: 'toughness', level: 3, techniques: ['expert'] },
    ],
  });
  attend(h, 20, 2024);
  return h;
}

describe('golden: Old Bear (Totemic, retires after 20 events)', () => {
  const h = oldBear();

  it('before retiring', () => {
    const sheet = h.sheet();
    expect(sheet.warnings).toEqual([]);
    // hand-derived: XP 150 + 20 x 60 = 1350; CXP 20 x 5 = 100; AXP 20
    expect(sheet.points.xp.earned).toBe(1350);
    expect(sheet.points.cxp.earned).toBe(100);
    expect(sheet.points.axp.earned).toBe(20);
    // hand-derived Life: 10 + Totemic innate 10 + Toughness Expert 20 = 40
    expect(sheet.stats.lifePoints.value).toBe(40);
    // Live off the Land Expert covers upkeep and gives 3 Basic Components at check-in.
    expect(sheet.stats.upkeep.covers).toEqual([
      expect.objectContaining({ id: 'live-off-the-land', automatic: true, coversAll: true }),
    ]);
    expect(sheet.stats.checkInIncome.map((s) => s.fixed?.text)).toEqual(['3 Basic Components']);
  });

  it('retires with the carry-over', () => {
    h.run({ type: 'retireCharacter', reason: 'Settles in the hills', goodsValueCopper: 600 });
    const sheet = h.sheet();
    // hand-derived: XP floor((1350 - 150) x 0.25) = 300; CXP floor(100 x 0.5) = 50;
    //   AXP floor(20 x 0.25) = 5; coin floor(600 x 0.25) - 50 = 100 Copper
    expect(sheet.retired?.carry).toEqual({ xp: 300, cxp: 50, axp: 5, coinCopper: 100 });
    expect(h.fail({ type: 'awardPoints', currency: 'xp', amount: 5, kind: 'gm-award' })).toEqual([
      'CHARACTER_RETIRED',
    ]);
  });
});

describe('golden: Young Bear (Beast-Kin retirement rebuild)', () => {
  const h = harness();
  const plan = h.plan({
    type: 'createCharacter',
    characterName: 'Young Bear',
    playerName: 'Sample Player',
    raceId: 'beast-kin',
    choices: { animal: 'Bear', 'natural-weapon': 'bite', size: 'large' },
    retirement: { fromName: 'Old Bear', xp: 300, cxp: 50, axp: 5, coinCopper: 100 },
    startingSkills: [
      { skillId: 'toughness', level: 6, techniques: ['expert', 'master'] },
      { skillId: 'weapon-proficiency', level: 7, techniques: ['expert', 'master'] },
    ],
  });
  if (plan.ok) h.actions.push(...plan.actions);

  it('is allowed above the creation limits, with coin-paid teaching notices', () => {
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.notices.filter((n) => n.code === 'COIN_PAID_TEACHING')).toHaveLength(2);
  });

  it('points from the retirement', () => {
    const sheet = h.sheet();
    expect(sheet.warnings).toEqual([]);
    // hand-derived: starting XP is the share alone, 300 (Q-RET-2)
    //   Toughness levels 1..6 = 105, + Expert 5 + Master 10 = 120
    //   Weapon Proficiency levels 1..7 = 140, + 15 = 155; spent 275; 25 left
    expect(sheet.points.xp).toMatchObject({ earned: 300, spent: 275, available: 25 });
    expect(sheet.points.cxp.earned).toBe(50);
    expect(sheet.points.axp.earned).toBe(5);
    expect(sheet.profile.startingXp).toBe(300);
    expect(sheet.profile.retirementFrom).toEqual({
      fromName: 'Old Bear',
      xp: 300,
      cxp: 50,
      axp: 5,
      coinCopper: 100,
    });
    expect(
      sheet.ledger.filter((r) => r.kind === 'retirement').map((r) => [r.currency, r.amount]),
    ).toEqual([
      ['xp', 300],
      ['cxp', 50],
      ['axp', 5],
    ]);
  });

  it('stats', () => {
    const sheet = h.sheet();
    // hand-derived: Life 10 + Toughness Expert 20 + Master 20 = 50
    expect(sheet.stats.lifePoints.value).toBe(50);
    // hand-derived two-handed: WP Expert 2 + Master (all weapons) 1 = 3
    expect(sheet.stats.passiveDamage.twoHanded.value).toBe(3);
    expect(sheet.race?.naturalWeapon).toEqual({
      id: 'bite',
      baseDamage: 3,
      greatclaw: true,
      source: 'Beast-Kin innate',
    });
    expect(sheet.race?.size).toBe('large');
  });

  it('a regular new character could not do this', () => {
    const fresh = harness();
    const r = fresh.plan({
      type: 'createCharacter',
      characterName: 'Cub',
      playerName: 'Sample Player',
      raceId: 'beast-kin',
      choices: { 'natural-weapon': 'short-claws', size: 'small' },
      startingSkills: [{ skillId: 'toughness', level: 6, techniques: ['expert', 'master'] }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.code)).toEqual([
      'CREATION_LEVEL_LIMIT',
      'CREATION_TECHNIQUE_LIMIT',
    ]);
  });
});
