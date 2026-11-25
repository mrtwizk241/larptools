import { describe, expect, it } from 'vitest';
import { grant, rs, withCharacter } from '../testkit.ts';

function ready() {
  const h = withCharacter();
  grant(h, 'xp', 350);
  grant(h, 'axp', 50);
  return h;
}

describe('Artifact [ART-RULES]', () => {
  it('awakens at 500 XP earned for 5 AXP, one per character', () => {
    const h = withCharacter();
    grant(h, 'axp', 5);
    // hand-derived: 150 earned < 500
    expect(h.fail({ type: 'awakenArtifact', name: 'Grandfather Sword' })).toEqual([
      'XP_EARNED_TOO_LOW',
    ]);
    grant(h, 'xp', 350);
    h.run({ type: 'awakenArtifact', name: 'Grandfather Sword' });
    expect(h.sheet().artifact).toMatchObject({ slotsUnlocked: 1, slotsFree: 1, nextSlotCost: 5 });
    expect(h.sheet().points.axp).toMatchObject({ spent: 5, available: 0 });
    expect(h.fail({ type: 'awakenArtifact', name: 'Another' })).toEqual([
      'ARTIFACT_EXISTS',
      'NOT_ENOUGH_AXP',
    ]);
    expect(h.fail({ type: 'unlockArtifactSlot' })).toEqual(['NOT_ENOUGH_AXP']);
  });

  it('slots cost 5 AXP up to 10; powers fill slots equal to their tier', () => {
    const h = ready();
    expect(h.fail({ type: 'unlockArtifactSlot' })).toEqual(['NO_ARTIFACT']);
    h.run({ type: 'awakenArtifact', name: 'Lantern' });
    for (let i = 0; i < 9; i++) h.run({ type: 'unlockArtifactSlot' });
    // hand-derived: 5 + 9 x 5 = 50 AXP
    expect(h.sheet().points.axp).toMatchObject({ spent: 50, available: 0 });
    expect(h.sheet().artifact).toMatchObject({ slotsUnlocked: 10, nextSlotCost: null });
    expect(h.fail({ type: 'unlockArtifactSlot' })).toEqual([
      'ARTIFACT_SLOTS_MAX',
      'NOT_ENOUGH_AXP',
    ]);

    h.run({ type: 'setArtifactPower', powerId: 'art-passive-weapon-damage' });
    h.run({ type: 'setArtifactPower', powerId: 'art-language', choice: 'orcish' });
    const s = h.sheet();
    // hand-derived: Tier 3 + Tier 1 = 4 slots used, 6 free
    expect(s.artifact).toMatchObject({ slotsUsed: 4, slotsFree: 6 });
    expect(s.stats.passiveDamage.allWeapons.value).toBe(1);
    expect(s.stats.languages.known.map((l) => l.id)).toEqual(['common', 'orcish']);
    expect(h.fail({ type: 'setArtifactPower', powerId: 'art-language' })).toEqual([
      'CHOICE_REQUIRED',
    ]);
    expect(h.fail({ type: 'setArtifactPower', powerId: 'art-language', choice: 'orcish' })).toEqual(
      ['POWER_DUPLICATE'],
    );
    expect(h.fail({ type: 'setArtifactPower', powerId: 'art-nope' })).toEqual(['UNKNOWN_POWER']);
  });

  it('only one Tier 4+ power; powers fit the free slots', () => {
    const h = ready();
    h.run({ type: 'awakenArtifact', name: 'Crown' });
    expect(h.fail({ type: 'setArtifactPower', powerId: 'art-passive-weapon-damage' })).toEqual([
      'ARTIFACT_SLOTS_FULL',
    ]);
    for (let i = 0; i < 9; i++) h.run({ type: 'unlockArtifactSlot' });
    const big = rs.artifacts.powers.filter((p) => p.tier >= 4 && !p.choice);
    const [first, second] = big;
    h.run({ type: 'setArtifactPower', powerId: first?.id ?? '' });
    expect(h.fail({ type: 'setArtifactPower', powerId: second?.id ?? '' })).toEqual([
      'ARTIFACT_TIER4_LIMIT',
    ]);
  });

  it('powers are removed once per calendar year, any number at once (Q-PLAY-4)', () => {
    const h = ready();
    h.run({ type: 'awakenArtifact', name: 'Ring' });
    h.run({ type: 'unlockArtifactSlot' });
    const [a] = h.run({ type: 'setArtifactPower', powerId: 'art-language', choice: 'elven' });
    const [b] = h.run({ type: 'setArtifactPower', powerId: 'art-language', choice: 'dwarven' });
    expect(h.fail({ type: 'removeArtifactPowers', entryIds: [a?.id ?? ''] })).toEqual([
      'REASON_REQUIRED',
    ]);
    h.run({
      type: 'removeArtifactPowers',
      entryIds: [a?.id ?? '', b?.id ?? ''],
      reason: 'Reforged',
    });
    expect(h.sheet().artifact?.powers).toEqual([]);
    const [c] = h.run({ type: 'setArtifactPower', powerId: 'art-language', choice: 'gnomish' });
    expect(
      h.fail({ type: 'removeArtifactPowers', entryIds: [c?.id ?? ''], reason: 'again' }),
    ).toEqual(['ARTIFACT_REMOVAL_YEAR']);
    h.at('2027-02-01T12:00:00.000Z');
    h.run({ type: 'removeArtifactPowers', entryIds: [c?.id ?? ''], reason: 'New year' });
    expect(h.fail({ type: 'removeArtifactPowers', entryIds: ['nope'], reason: 'x' })).toContain(
      'POWER_NOT_FOUND',
    );
  });
});
