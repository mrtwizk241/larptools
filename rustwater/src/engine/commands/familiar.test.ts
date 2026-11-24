import { describe, expect, it } from 'vitest';
import { withCharacter, type Harness } from '../testkit.ts';
import type { PlanResult } from './define.ts';
import { preview } from './plan.ts';
import { rs } from '../testkit.ts';

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

function withFp(fp: number): Harness {
  const h = withCharacter();
  if (fp > 0) h.run({ type: 'adjustPoints', currency: 'fp', amount: fp, reason: 'test setup' });
  return h;
}

function awakened(fp = 40): Harness {
  const h = withFp(fp);
  h.run({ type: 'bondFamiliar', name: 'Murk', creature: 'Mud toad' });
  h.run({ type: 'awakenFamiliar', awakenedSkillId: 'gather' });
  return h;
}

describe('familiar: bond, awaken, level', () => {
  it('bonding is free and makes a level 1 familiar', () => {
    const h = withFp(0);
    h.run({ type: 'bondFamiliar', name: 'Sprig' });
    const fam = h.sheet().familiar;
    expect(fam).toMatchObject({
      name: 'Sprig',
      creature: null,
      level: 1,
      awakened: false,
      awakenedSkill: null,
      essence: { total: 1, spent: 0, available: 1 },
      slots: { base: 4, extra: 0, total: 4, used: 0, free: 4 },
      nextLevelFp: 5,
    });
    expect(codes(h.plan({ type: 'bondFamiliar', name: 'Other' }))).toEqual([
      'FAMILIAR_ALREADY_BONDED',
    ]);
  });

  it('FP and Essence from awakening through level 10', () => {
    const h = withFp(29);
    h.run({ type: 'bondFamiliar', name: 'Murk' });
    expect(codes(h.plan({ type: 'levelFamiliar' }))).toEqual(['FAMILIAR_NOT_AWAKENED']);
    h.run({ type: 'awakenFamiliar', awakenedSkillId: 'gather' });
    const rows: number[][] = [];
    const record = () => {
      const s = h.sheet();
      rows.push([s.familiar?.level ?? 0, s.points.fp.spent, s.familiar?.essence.total ?? 0]);
    };
    record();
    for (let level = 3; level <= 10; level++) {
      h.run({ type: 'levelFamiliar' });
      record();
    }
    expect(rows).toEqual([
      [2, 5, 3],
      [3, 8, 6],
      [4, 11, 10],
      [5, 14, 15],
      [6, 17, 21],
      [7, 20, 28],
      [8, 23, 36],
      [9, 26, 45],
      [10, 29, 55],
    ]);
    const sheet = h.sheet();
    expect(sheet.points.fp).toEqual({ total: 29, spent: 29, available: 0 });
    expect(sheet.familiar?.awakenedSkill?.id).toBe('gather');
    expect(sheet.familiar?.nextLevelFp).toBeNull();
    expect(codes(h.plan({ type: 'levelFamiliar' }))).toEqual(['MAX_LEVEL']);
  });

  it('several levels at once, and FP checks', () => {
    const h = awakened(10);
    expect(h.sheet().points.fp.available).toBe(5);
    const r = h.plan({ type: 'levelFamiliar', toLevel: 4 });
    expect(codes(r)).toEqual(['NOT_ENOUGH_FP']);
    expect(preview(rs, h.sheet(), { type: 'levelFamiliar', toLevel: 4 }).cost).toEqual({
      currency: 'fp',
      amount: 6,
    });
    const actions = h.run({ type: 'levelFamiliar', toLevel: 3 });
    expect(actions[0]?.payload).toEqual({ toLevel: 3, fpCost: 3 });
    expect(codes(h.plan({ type: 'levelFamiliar', toLevel: 3 }))).toEqual(['ALREADY_AT_LEVEL']);
  });

  it('awakening needs a bonded familiar, 5 FP, and a known awakened skill', () => {
    expect(codes(withFp(10).plan({ type: 'awakenFamiliar', awakenedSkillId: 'gather' }))).toEqual([
      'NO_FAMILIAR',
    ]);
    const poor = withFp(4);
    poor.run({ type: 'bondFamiliar', name: 'Murk' });
    expect(codes(poor.plan({ type: 'awakenFamiliar', awakenedSkillId: 'gather' }))).toEqual([
      'NOT_ENOUGH_FP',
    ]);
    expect(codes(poor.plan({ type: 'awakenFamiliar', awakenedSkillId: 'fly' }))).toEqual([
      'UNKNOWN_AWAKENED_SKILL',
      'NOT_ENOUGH_FP',
    ]);
    const h = awakened();
    expect(codes(h.plan({ type: 'awakenFamiliar', awakenedSkillId: 'push' }))).toEqual([
      'FAMILIAR_ALREADY_AWAKENED',
    ]);
  });
});

describe('familiar: skills and slots', () => {
  it('learning spends Essence by tier and fills slots', () => {
    const h = awakened();
    h.run({ type: 'levelFamiliar', toLevel: 8 });
    expect(h.sheet().familiar?.essence.total).toBe(36);
    for (const id of ['fam-feint', 'fam-tracking', 'fam-store-basic', 'fam-extra-buff-slot'])
      h.run({ type: 'learnFamiliarSkill', skillId: id });
    expect(codes(h.plan({ type: 'learnFamiliarSkill', skillId: 'fam-deliver-message' }))).toEqual([
      'FAMILIAR_SLOTS_FULL',
    ]);
    h.run({ type: 'unlockFamiliarSlot' });
    h.run({ type: 'learnFamiliarSkill', skillId: 'fam-deliver-message' });
    const fam = h.sheet().familiar;
    expect(fam?.essence).toEqual({ total: 36, spent: 35, available: 1 });
    expect(fam?.slots).toMatchObject({ extra: 1, total: 5, used: 5, free: 0 });
    expect(fam?.skills).toEqual([
      'fam-feint',
      'fam-tracking',
      'fam-store-basic',
      'fam-extra-buff-slot',
      'fam-deliver-message',
    ]);
    expect(fam?.learned[4]).toMatchObject({ tier: 10, essence: 10 });
    expect(codes(h.plan({ type: 'unlockFamiliarSlot' }))).toEqual(['NOT_ENOUGH_ESSENCE']);
  });

  it('at most 2 extra slots', () => {
    const h = awakened();
    h.run({ type: 'levelFamiliar', toLevel: 6 });
    h.run({ type: 'unlockFamiliarSlot' });
    h.run({ type: 'unlockFamiliarSlot' });
    expect(codes(h.plan({ type: 'unlockFamiliarSlot' }))).toEqual(['FAMILIAR_SLOTS_MAX']);
    expect(h.sheet().familiar?.slots).toMatchObject({ extra: 2, total: 6 });
  });

  it('repeat limits, choices, Essence, and level 1 familiars', () => {
    const bonded = withFp(10);
    bonded.run({ type: 'bondFamiliar', name: 'Sprig' });
    expect(codes(bonded.plan({ type: 'learnFamiliarSkill', skillId: 'fam-feint' }))).toEqual([
      'FAMILIAR_NOT_AWAKENED',
    ]);
    const h = awakened();
    h.run({ type: 'levelFamiliar', toLevel: 8 });
    h.run({ type: 'learnFamiliarSkill', skillId: 'fam-feint' });
    expect(codes(h.plan({ type: 'learnFamiliarSkill', skillId: 'fam-feint' }))).toEqual([
      'FAMILIAR_SKILL_LIMIT',
    ]);
    h.run({ type: 'learnFamiliarSkill', skillId: 'fam-deliver-message' });
    h.run({ type: 'learnFamiliarSkill', skillId: 'fam-deliver-message' });
    expect(
      codes(h.plan({ type: 'learnFamiliarSkill', skillId: 'fam-craft-unstable-basic' })),
    ).toEqual(['CHOICE_REQUIRED']);
    expect(
      preview(rs, h.sheet(), { type: 'learnFamiliarSkill', skillId: 'fam-craft-unstable-basic' })
        .allowed,
    ).toBe(true);
    // 36 Essence at level 8; 25 spent.
    expect(codes(h.plan({ type: 'learnFamiliarSkill', skillId: 'fam-max-health' }))).toEqual([
      'NOT_ENOUGH_ESSENCE',
    ]);
    expect(codes(h.plan({ type: 'learnFamiliarSkill', skillId: 'nope' }))).toEqual([
      'UNKNOWN_FAMILIAR_SKILL',
    ]);
  });

  it('forgetting costs 1 FP and refunds no Essence', () => {
    const h = awakened(12);
    h.run({ type: 'levelFamiliar', toLevel: 3 });
    h.run({ type: 'learnFamiliarSkill', skillId: 'fam-feint' });
    const learned = h.sheet().familiar?.learned[0];
    h.run({ type: 'forgetFamiliarSkill', learnedActionId: learned?.actionId ?? '' });
    const sheet = h.sheet();
    expect(sheet.familiar?.skills).toEqual([]);
    expect(sheet.familiar?.essence).toEqual({ total: 6, spent: 5, available: 1 });
    expect(sheet.points.fp).toEqual({ total: 12, spent: 9, available: 3 });
    expect(codes(h.plan({ type: 'forgetFamiliarSkill', learnedActionId: 'nope' }))).toEqual([
      'FAMILIAR_SKILL_NOT_FOUND',
    ]);
  });

  it('breaking the bond costs 1 FP and resets everything; spent FP stays spent', () => {
    const h = awakened(12);
    h.run({ type: 'levelFamiliar', toLevel: 3 });
    h.run({ type: 'learnFamiliarSkill', skillId: 'fam-feint' });
    h.run({ type: 'breakFamiliarBond', reason: 'Released into the marsh' });
    let sheet = h.sheet();
    expect(sheet.familiar).toBeNull();
    expect(sheet.points.fp).toEqual({ total: 12, spent: 9, available: 3 });
    expect(codes(h.plan({ type: 'breakFamiliarBond' }))).toEqual(['NO_FAMILIAR']);
    h.run({ type: 'bondFamiliar', name: 'Pip' });
    sheet = h.sheet();
    expect(sheet.familiar).toMatchObject({ name: 'Pip', level: 1, skills: [] });
    expect(sheet.familiar?.essence.spent).toBe(0);
  });

  it('breaking needs the FP', () => {
    const h = withFp(0);
    h.run({ type: 'bondFamiliar', name: 'Pip' });
    expect(codes(h.plan({ type: 'breakFamiliarBond' }))).toEqual(['NOT_ENOUGH_FP']);
  });
});
