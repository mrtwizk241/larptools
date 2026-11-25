import { describe, expect, it } from 'vitest';
import { checkRequest } from './checkRequest.ts';
import { preview } from './plan.ts';
import type { Request } from '../model.ts';
import { grant, harness, learn, rs, withCharacter } from '../testkit.ts';

describe('learnSkill', () => {
  it('buys one step with a teacher; levels in order; the cost', () => {
    const h = withCharacter();
    const p = preview(rs, h.sheet(), { type: 'learnSkill', skillId: 'stun', step: { level: 1 } });
    expect(p).toMatchObject({
      allowed: true,
      cost: { currency: 'xp', amount: 5 },
      teacherRequired: true,
    });
    h.run({ type: 'learnSkill', skillId: 'stun', step: { level: 1 }, teacher: 'Sergeant Pell' });
    h.run({ type: 'learnSkill', skillId: 'stun', step: { level: 3 } });
    // hand-derived: 5 + 10 + 15 = 30
    expect(h.sheet().skills[0]).toMatchObject({ level: 3, spent: 30, maxUses: 3 });
  });

  it('a higher level buys every level in between', () => {
    const h = withCharacter();
    const actions = h.run({
      type: 'learnSkill',
      skillId: 'stun',
      step: { level: 4 },
      teacher: 'Pell',
    });
    // hand-derived: 5 + 10 + 15 + 20 = 50
    expect(actions.map((a) => (a.payload as { cost: number }).cost)).toEqual([5, 10, 15, 20]);
    expect(h.sheet().points.xp.spent).toBe(50);
    // The teacher is kept for Basic only (levels 2 to 10 are self-taught).
    expect(actions.map((a) => (a.payload as { teacher?: string }).teacher)).toEqual([
      'Pell',
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('error codes for order and Techniques', () => {
    const h = withCharacter();
    learn(h, 'stun', 2);
    expect(h.fail({ type: 'learnSkill', skillId: 'stun', step: { level: 2 } })).toEqual([
      'ALREADY_AT_LEVEL',
    ]);
    expect(h.fail({ type: 'learnSkill', skillId: 'stun', step: { technique: 'expert' } })).toEqual([
      'TECHNIQUE_LEVEL',
    ]);
    learn(h, 'stun', 6);
    expect(h.fail({ type: 'learnSkill', skillId: 'stun', step: { technique: 'master' } })).toEqual([
      'TECHNIQUE_ORDER',
    ]);
    expect(h.fail({ type: 'learnSkill', skillId: 'stun', step: { level: 11 } })).toEqual([
      'MAX_LEVEL',
    ]);
    expect(h.fail({ type: 'learnSkill', skillId: 'nope', step: { level: 1 } })).toEqual([
      'UNKNOWN_SKILL',
    ]);
  });

  it('not enough XP', () => {
    const h = withCharacter();
    learn(h, 'stun', 6);
    // hand-derived: 105 spent, 45 left; level 7 costs 35, levels 7 and 8 cost 75
    expect(h.fail({ type: 'learnSkill', skillId: 'stun', step: { level: 8 } })).toEqual([
      'NOT_ENOUGH_XP',
    ]);
  });

  it('staff may leave the teacher blank: unverified (Q-SKL-4)', () => {
    const h = withCharacter();
    const r = h.plan({ type: 'learnSkill', skillId: 'stun', step: { level: 1 } });
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['TEACHER_MISSING']);
    h.run({ type: 'learnSkill', skillId: 'stun', step: { level: 1 } });
    expect(h.sheet().skills[0]?.teaching[0]).toMatchObject({
      step: 'basic',
      teacher: null,
      unverified: true,
    });
  });

  it('racial skills only for the race; Calling skills only on the Calling', () => {
    const h = withCharacter();
    expect(h.fail({ type: 'learnSkill', skillId: 'orcish-anger', step: { level: 1 } })).toEqual([
      'RACIAL_SKILL_OTHER_RACE',
    ]);
    // Calling skills are paid in CXP, and a new character has none.
    expect(h.fail({ type: 'learnSkill', skillId: 'guardianship', step: { level: 1 } })).toEqual([
      'CALLING_NOT_ACTIVE',
      'NOT_ENOUGH_CXP',
    ]);
  });

  it('advanced skills need the prerequisites at the Master Technique', () => {
    const h = withCharacter();
    grant(h, 'xp', 500);
    learn(h, 'stun', 6, ['expert', 'master']);
    expect(h.fail({ type: 'learnSkill', skillId: 'slay', step: { level: 1 } })).toEqual([
      'PREREQ_NOT_MET',
    ]);
    learn(h, 'aggression', 6, ['expert', 'master']);
    h.run({ type: 'learnSkill', skillId: 'slay', step: { level: 1 }, teacher: 'Blademaster Ivo' });
    expect(h.sheet().skills.find((s) => s.skillId === 'slay')?.advanced).toBe(true);
  });
});

describe('refundSkill', () => {
  it('takes back the top level or Technique and returns its cost', () => {
    const h = withCharacter();
    learn(h, 'stun', 5, ['expert']);
    expect(h.sheet().points.xp.spent).toBe(80);
    expect(
      h.fail({ type: 'refundSkill', skillId: 'stun', step: { level: 3 }, reason: 'Unlearn' }),
    ).toEqual(['REFUND_NOT_TOP']);
    expect(h.fail({ type: 'refundSkill', skillId: 'stun', step: { level: 5 } })).toEqual([
      'REASON_REQUIRED',
    ]);
    const p = preview(rs, h.sheet(), {
      type: 'refundSkill',
      skillId: 'stun',
      step: { level: 5 },
      reason: 'Unlearn',
    });
    expect(p.refund).toEqual({ currency: 'xp', amount: 25 });
    h.run({ type: 'refundSkill', skillId: 'stun', step: { level: 5 }, reason: 'Unlearn' });
    h.run({
      type: 'refundSkill',
      skillId: 'stun',
      step: { technique: 'expert' },
      reason: 'Unlearn',
    });
    const s = h.sheet();
    // hand-derived: 80 - 25 - 5 = 50
    expect(s.points.xp.spent).toBe(50);
    expect(s.skills[0]).toMatchObject({ level: 4, techniques: [] });
    expect(s.refunds.map((r) => r.refund.amount)).toEqual([25, 5]);
    expect(
      h.fail({ type: 'refundSkill', skillId: 'toughness', step: { level: 1 }, reason: 'x' }),
    ).toEqual(['NOT_OWNED']);
  });

  it('refunds the stored price of the step it removes, not the current table price', () => {
    const base = withCharacter();
    learn(base, 'stun', 2);
    // An older table priced Stun 2 at 8 XP: the log keeps the price paid.
    const actions = base.actions.map((a) =>
      a.type === 'skill.learned' && (a.payload as { step: { level?: number } }).step.level === 2
        ? { ...a, payload: { ...(a.payload as object), cost: 8 } }
        : a,
    );
    const h = harness(actions);
    expect(h.sheet().points.xp.spent).toBe(13);
    const p = preview(rs, h.sheet(), {
      type: 'refundSkill',
      skillId: 'stun',
      step: { level: 2 },
      reason: 'Unlearn',
    });
    expect(p.refund).toEqual({ currency: 'xp', amount: 8 });
    h.run({ type: 'refundSkill', skillId: 'stun', step: { level: 2 }, reason: 'Unlearn' });
    // hand-derived: 13 - 8 = 5, the Stun 1 price
    expect(h.sheet().points.xp.spent).toBe(5);
    expect(h.sheet().refunds.at(-1)?.refund).toEqual({ currency: 'xp', amount: 8 });
    // Re-learned at today's price, the next refund returns that price.
    learn(h, 'stun', 2);
    const again = preview(rs, h.sheet(), {
      type: 'refundSkill',
      skillId: 'stun',
      step: { level: 2 },
      reason: 'Unlearn',
    });
    expect(again.refund).toEqual({ currency: 'xp', amount: 10 });
  });

  it('notes when an advanced skill loses a prerequisite', () => {
    const h = withCharacter();
    grant(h, 'xp', 500);
    learn(h, 'stun', 6, ['expert', 'master']);
    learn(h, 'aggression', 6, ['expert', 'master']);
    learn(h, 'slay', 1);
    const r = h.plan({
      type: 'refundSkill',
      skillId: 'stun',
      step: { technique: 'master' },
      reason: 'Unlearn',
    });
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['PREREQ_LOST']);
  });
});

describe('requests (Log of Learning)', () => {
  const request = (over: Partial<Request> = {}): Request => ({
    id: 'req-1',
    characterId: 'char-1',
    createdAt: '2026-05-01T10:00:00.000Z',
    kind: 'learn-skill',
    skillId: 'stun',
    step: { level: 1 },
    teacher: 'Sergeant Pell',
    note: 'Taught at the tavern',
    status: 'sent',
    ...over,
  });

  it('approve runs the learn rules and records the decision', () => {
    const h = withCharacter();
    expect(checkRequest(rs, h.sheet(), request())).toMatchObject({
      valid: true,
      decided: null,
      cost: { currency: 'xp', amount: 5 },
      teacherRequired: true,
    });
    const actions = h.run({ type: 'approveRequest', request: request() });
    expect(actions.map((a) => [a.type, a.causedBy])).toEqual([
      ['skill.learned', 'req-1'],
      ['request.approved', 'req-1'],
    ]);
    expect(h.sheet().requestDecisions[0]).toMatchObject({
      status: 'approved',
      teacher: 'Sergeant Pell',
      step: { level: 1 },
    });
    expect(checkRequest(rs, h.sheet(), request()).decided).toBe('approved');
    expect(h.fail({ type: 'approveRequest', request: request() })).toEqual([
      'REQUEST_ALREADY_DECIDED',
    ]);
  });

  it('player requests must name a teacher', () => {
    const h = withCharacter();
    const r = request({ teacher: '' });
    expect(checkRequest(rs, h.sheet(), r).valid).toBe(false);
    expect(h.fail({ type: 'approveRequest', request: r })).toEqual(['TEACHER_REQUIRED']);
    h.run({ type: 'approveRequest', request: r, teacher: 'Pell (staff confirmed)' });
    expect(h.sheet().skills[0]?.teaching[0]?.teacher).toBe('Pell (staff confirmed)');
  });

  it('reject needs a reason', () => {
    const h = withCharacter();
    expect(h.fail({ type: 'rejectRequest', request: request() })).toEqual(['REASON_REQUIRED']);
    h.run({ type: 'rejectRequest', request: request(), reason: 'No signature in the Log' });
    expect(h.sheet().requestDecisions[0]).toMatchObject({
      status: 'rejected',
      reason: 'No signature in the Log',
    });
  });
});
