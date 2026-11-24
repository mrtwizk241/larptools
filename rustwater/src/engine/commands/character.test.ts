import { describe, expect, it } from 'vitest';
import { grantCxp, withCharacter } from '../testkit.ts';
import type { PlanResult } from './define.ts';

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('levelAncestryAbility', () => {
  it('spends 1 LXP for one more level and one more use', () => {
    const h = withCharacter();
    const [action] = h.run({ type: 'levelAncestryAbility', abilityId: 'human-resilience' });
    expect(action?.payload).toEqual({ abilityId: 'human-resilience', toLevel: 2 });
    const sheet = h.sheet();
    expect(sheet.points.lxp).toEqual({ total: 1, spent: 1, available: 0 });
    expect(sheet.ancestry?.abilities[0]?.uses).toEqual({ count: 2, per: 'encounter' });
  });

  it('needs LXP available', () => {
    const h = withCharacter({ startingLxpAbilityId: 'make-it-work' });
    const result = h.plan({ type: 'levelAncestryAbility', abilityId: 'make-it-work' });
    expect(result.ok ? null : result.errors[0]).toEqual({
      code: 'NOT_ENOUGH_LXP',
      message: 'Not enough LXP: needs 1, 0 left.',
      ruleId: 'PTS-LXP-SPEND',
    });
    grantCxp(h, 250);
    expect(h.plan({ type: 'levelAncestryAbility', abilityId: 'make-it-work' }).ok).toBe(true);
  });

  it('accepts a From Legends copy id and rejects other ancestries abilities', () => {
    const h = withCharacter({
      ancestryId: 'cryptid',
      subtypeId: 'cryptid-aquatic',
      fromLegendsChoice: 'ghostly',
    });
    const ok = h.plan({ type: 'levelAncestryAbility', abilityId: 'ghostly' });
    expect(ok.ok && ok.actions[0]?.payload).toEqual({ abilityId: 'from-legends', toLevel: 2 });
    expect(codes(h.plan({ type: 'levelAncestryAbility', abilityId: 'accuracy' }))).toEqual([
      'UNKNOWN_ABILITY',
    ]);
  });
});

describe('changeInfection', () => {
  it('sets the level with a reason and keeps the previous level for history', () => {
    const h = withCharacter({ extraInfection: 1 });
    const [action] = h.run({
      type: 'changeInfection',
      toLevel: 5,
      reason: 'Rose by the virus at Spring Thaw',
      cause: 'death-rise',
    });
    expect(action?.payload).toEqual({
      track: 'infection',
      toLevel: 5,
      fromLevel: 4,
      reason: 'Rose by the virus at Spring Thaw',
      cause: 'death-rise',
    });
    expect(h.sheet().infection?.current).toBe(5);
  });

  it('allows decreases, rejects no-ops, out-of-range levels, unknown causes, and a missing reason', () => {
    const h = withCharacter();
    expect(h.plan({ type: 'changeInfection', toLevel: 2, reason: 'Cured' }).ok).toBe(true);
    expect(codes(h.plan({ type: 'changeInfection', toLevel: 3, reason: 'x' }))).toEqual([
      'NOTHING_CHANGED',
    ]);
    expect(codes(h.plan({ type: 'changeInfection', toLevel: 11, reason: 'x' }))).toEqual([
      'INFECTION_RANGE',
    ]);
    expect(
      codes(h.plan({ type: 'changeInfection', toLevel: 4, reason: 'x', cause: 'bad-luck' })),
    ).toEqual(['UNKNOWN_CAUSE']);
    expect(codes(h.plan({ type: 'changeInfection', toLevel: 4 }))).toEqual(['REASON_REQUIRED']);
  });

  it('reaching 10 is a notice to start an unplanned retirement', () => {
    const h = withCharacter();
    const result = h.plan({ type: 'changeInfection', toLevel: 10, reason: 'Final death' });
    expect(result.ok && result.notices.map((n) => n.code)).toEqual(['INFECTION_MAX']);
    if (result.ok) h.actions.push(...result.actions);
    expect(h.sheet().infection?.reachedMax).toBe(true);
  });

  it('Aware use the connection track', () => {
    const h = withCharacter({ ancestryId: 'aware', subtypeId: 'aware-personal-memory' });
    const [action] = h.run({
      type: 'changeInfection',
      toLevel: 1,
      reason: 'Died without Raise Dead',
    });
    expect((action?.payload as { track: string }).track).toBe('connection');
    expect(h.sheet().infection).toMatchObject({ label: 'Connection Damage', current: 1 });
  });
});

describe('updateProfile', () => {
  it('records only the fields that changed', () => {
    const h = withCharacter();
    const [action] = h.run({
      type: 'updateProfile',
      characterName: 'Mara Quill',
      playerName: 'Sample Player Two',
      age: 3,
      notes: 'Prefers night shifts.',
    });
    expect(action?.payload).toEqual({
      playerName: 'Sample Player Two',
      ageStep: 3,
      notes: 'Prefers night shifts.',
    });
    expect(h.sheet().profile).toMatchObject({
      playerName: 'Sample Player Two',
      age: 3,
      notes: 'Prefers night shifts.',
    });
  });

  it('clears the email with an empty string and refuses a no-op', () => {
    const h = withCharacter({ playerEmail: 'player@example.com' });
    expect(h.sheet().profile.playerEmail).toBe('player@example.com');
    h.run({ type: 'updateProfile', playerEmail: '' });
    expect(h.sheet().profile.playerEmail).toBeNull();
    expect(codes(h.plan({ type: 'updateProfile', playerEmail: null }))).toEqual([
      'NOTHING_CHANGED',
    ]);
  });
});
