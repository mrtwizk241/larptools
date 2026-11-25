import { describe, expect, it } from 'vitest';
import { rs } from '../testkit.ts';
import {
  abilityStates,
  applyStep,
  checkPrereqs,
  highestTechnique,
  namedLevelReached,
  namedLevelUnlocked,
  NOT_OWNED,
  refundableSteps,
  removeStep,
  stepOrderProblem,
  stepsTo,
  techniqueTier,
  type OwnedSkill,
} from './skills.ts';

const skill = (id: string) => {
  const s = rs.skillsById[id];
  if (!s) throw new Error(id);
  return s;
};

describe('levels and Techniques [SKL-LEVELS] [SKL-TECH]', () => {
  it('levels are bought in order up to 10', () => {
    expect(stepOrderProblem(rs, NOT_OWNED, { level: 1 })).toBeNull();
    expect(stepOrderProblem(rs, NOT_OWNED, { level: 2 })?.code).toBe('LEVEL_ORDER');
    expect(stepOrderProblem(rs, { level: 3, techniques: [] }, { level: 3 })?.code).toBe(
      'ALREADY_AT_LEVEL',
    );
    expect(stepOrderProblem(rs, { level: 10, techniques: [] }, { level: 11 })?.code).toBe(
      'MAX_LEVEL',
    );
  });

  it('Techniques need their level and the Technique before', () => {
    expect(stepOrderProblem(rs, { level: 2, techniques: [] }, { technique: 'expert' })?.code).toBe(
      'TECHNIQUE_LEVEL',
    );
    expect(stepOrderProblem(rs, { level: 3, techniques: [] }, { technique: 'expert' })).toBeNull();
    expect(stepOrderProblem(rs, { level: 6, techniques: [] }, { technique: 'master' })?.code).toBe(
      'TECHNIQUE_ORDER',
    );
    expect(
      stepOrderProblem(rs, { level: 6, techniques: ['expert'] }, { technique: 'master' }),
    ).toBeNull();
    expect(
      stepOrderProblem(
        rs,
        { level: 9, techniques: ['expert', 'master'] },
        { technique: 'grandmaster' },
      )?.code,
    ).toBe('TECHNIQUE_LEVEL');
    expect(
      stepOrderProblem(rs, { level: 6, techniques: ['expert'] }, { technique: 'expert' })?.code,
    ).toBe('ALREADY_OWNED');
  });

  it('stepsTo puts each Technique right after its level gate', () => {
    expect(stepsTo(rs, NOT_OWNED, 7, ['expert', 'master'])).toEqual([
      { level: 1 },
      { level: 2 },
      { level: 3 },
      { technique: 'expert' },
      { level: 4 },
      { level: 5 },
      { level: 6 },
      { technique: 'master' },
      { level: 7 },
    ]);
    // A Technique whose gate is never reached is listed last, so the caller reports it.
    expect(stepsTo(rs, NOT_OWNED, 2, ['expert']).at(-1)).toEqual({ technique: 'expert' });
  });

  it('tiers and the highest Technique', () => {
    const s: OwnedSkill = { level: 6, techniques: ['expert', 'master'] };
    expect(techniqueTier(s)).toBe(2);
    expect(highestTechnique(s)).toBe('master');
    expect(highestTechnique({ level: 2, techniques: [] })).toBeNull();
    expect(applyStep(s, { technique: 'grandmaster' }).techniques).toEqual([
      'expert',
      'master',
      'grandmaster',
    ]);
  });
});

describe('named abilities [SKL-TECH] (Rulebook p.88)', () => {
  it('a level 8 Aggression with no Techniques has only the Basic ability unlocked', () => {
    // hand-derived: Basic unlocks at level 1; Expert, Master, Grandmaster need their Technique.
    const owned: OwnedSkill = { level: 8, techniques: [] };
    const states = abilityStates(skill('aggression'), owned);
    expect(states.map((a) => [a.named, a.unlocked])).toEqual([
      ['basic', true],
      ['expert', false],
      ['master', false],
      ['grandmaster', false],
    ]);
    expect(states.map((a) => a.uses)).toEqual([1, 2, 3, 4]);
    expect(namedLevelReached(rs, owned, 'master')).toBe(true);
    expect(namedLevelUnlocked(owned, 'master')).toBe(false);
  });

  it('the Technique unlocks its ability', () => {
    const states = abilityStates(skill('aggression'), { level: 3, techniques: ['expert'] });
    expect(states.filter((a) => a.unlocked).map((a) => a.named)).toEqual(['basic', 'expert']);
  });
});

describe('refunds take the top only (Unlearn)', () => {
  it('top level when no Technique depends on it, and the top Technique', () => {
    expect(refundableSteps(rs, { level: 5, techniques: ['expert'] })).toEqual([
      { level: 5 },
      { technique: 'expert' },
    ]);
    // Level 3 holds the Expert Technique up: only the Technique comes off first.
    expect(refundableSteps(rs, { level: 3, techniques: ['expert'] })).toEqual([
      { technique: 'expert' },
    ]);
    expect(refundableSteps(rs, NOT_OWNED)).toEqual([]);
    expect(removeStep({ level: 3, techniques: ['expert'] }, { technique: 'expert' })).toEqual({
      level: 3,
      techniques: [],
    });
  });
});

describe('advanced prerequisites [SKL-ADV]', () => {
  const lookup = (table: Record<string, OwnedSkill>) => (id: string) => table[id] ?? NOT_OWNED;
  const master: OwnedSkill = { level: 6, techniques: ['expert', 'master'] };

  it('Frenzy needs Weapon Proficiency and Strength at the Master Technique', () => {
    expect(checkPrereqs(rs, skill('frenzy'), lookup({})).unmet).toHaveLength(2);
    expect(
      checkPrereqs(rs, skill('frenzy'), lookup({ 'weapon-proficiency': master })).unmet,
    ).toEqual(['Strength (Master Technique)']);
    expect(
      checkPrereqs(rs, skill('frenzy'), lookup({ 'weapon-proficiency': master, strength: master }))
        .ok,
    ).toBe(true);
    // Level 6 without the Technique is not enough (Q-MAG-1).
    expect(
      checkPrereqs(
        rs,
        skill('frenzy'),
        lookup({ 'weapon-proficiency': master, strength: { level: 10, techniques: ['expert'] } }),
      ).ok,
    ).toBe(false);
  });

  it('Flash groups "or" lists (Q-SKL-2)', () => {
    const r = checkPrereqs(rs, skill('flash'), lookup({ blink: master }));
    expect(r.unmet).toEqual(['Precision (Master Technique) or Back Strike (Master Technique)']);
    expect(
      checkPrereqs(rs, skill('flash'), lookup({ 'evoke-fear': master, 'back-strike': master })).ok,
    ).toBe(true);
  });

  it('Ritualism needs any two base magics', () => {
    expect(checkPrereqs(rs, skill('ritualism'), lookup({ 'fire-magic': master })).ok).toBe(false);
    expect(
      checkPrereqs(rs, skill('ritualism'), lookup({ 'fire-magic': master, 'life-magic': master }))
        .ok,
    ).toBe(true);
  });
});
