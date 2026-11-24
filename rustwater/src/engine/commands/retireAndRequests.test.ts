import { describe, expect, it } from 'vitest';
import type { LearnSkillRequest } from '../model.ts';
import { retirementCarry } from '../rules/progression.ts';
import {
  AT,
  BASE_CHARACTER,
  grantCxp,
  grantShinies,
  harness,
  learnBasic,
  rs,
  withCharacter,
  type Harness,
} from '../testkit.ts';
import { checkRequest } from './checkRequest.ts';
import type { PlanResult } from './define.ts';
import { preview } from './plan.ts';

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

/** The [PTS-RETIRE] worked example: 1000 CXP total, 850 spent, 150 available. */
function veteran(): Harness {
  const h = withCharacter();
  grantCxp(h, 750);
  learnBasic(h, 'assault', 10);
  learnBasic(h, 'bash', 7);
  learnBasic(h, 'knockback', 1);
  learnBasic(h, 'stun', 1);
  h.run({ type: 'adjustPoints', currency: 'fp', amount: 10, reason: 'test setup' });
  h.run({ type: 'bondFamiliar', name: 'Murk' });
  h.run({ type: 'awakenFamiliar', awakenedSkillId: 'gather' });
  grantShinies(h, 300);
  return h;
}

describe('retirement', () => {
  it('computes the carry-over from the worked example', () => {
    const sheet = veteran().sheet();
    expect(sheet.points.cxp).toMatchObject({ total: 1000, spent: 850, available: 150 });
    expect(sheet.points.fp).toEqual({ total: 10, spent: 5, available: 5 });
    // CXP floor(600 / 3) + 150; FP floor(5 / 3) + 5; every Shiny.
    expect(retirementCarry(sheet)).toEqual({ cxp: 350, fp: 6, shinies: 300 });
    expect(retirementCarry(sheet, rs)).toEqual({ cxp: 350, fp: 6, shinies: 300 });
  });

  it('records character.retired and then refuses changes except notes and owed delivery', () => {
    const h = veteran();
    expect(preview(rs, h.sheet(), { type: 'retireCharacter' }).carry).toEqual({
      cxp: 350,
      fp: 6,
      shinies: 300,
    });
    expect(codes(h.plan({ type: 'retireCharacter' }))).toEqual(['REASON_REQUIRED']);
    expect(codes(h.plan({ type: 'retireCharacter', reason: 'Done', kind: 'sideways' }))).toEqual([
      'RETIREMENT_KIND_INVALID',
    ]);
    h.run({ type: 'addOwed', text: '3 Common resources' });
    h.run({ type: 'retireCharacter', reason: 'Settled down in Rustwater', kind: 'planned' });
    const sheet = h.sheet();
    expect(sheet.retired).toEqual({
      reason: 'Settled down in Rustwater',
      at: AT,
      kind: 'planned',
      carry: { cxp: 350, fp: 6, shinies: 300 },
    });

    expect(
      codes(h.plan({ type: 'learnSkill', skillId: 'slay', part: 'basic', teacher: 'X' })),
    ).toEqual(['CHARACTER_RETIRED']);
    expect(codes(h.plan({ type: 'retireCharacter', reason: 'Again' }))).toEqual([
      'CHARACTER_RETIRED',
    ]);
    expect(codes(h.plan({ type: 'updateProfile', characterName: 'New Name' }))).toEqual([
      'CHARACTER_RETIRED',
    ]);
    h.run({ type: 'updateProfile', notes: 'Runs the tea house now.' });
    h.run({ type: 'deliverOwed', owedId: sheet.owed[0]?.id ?? '' });
    const after = h.sheet();
    expect(after.profile.notes).toBe('Runs the tea house now.');
    expect(after.owed[0]?.delivered).toBe(true);
    expect(after.warnings).toEqual([]);
  });

  it('replay skips actions after retirement with a warning', () => {
    const h = veteran();
    h.run({ type: 'retireCharacter', reason: 'Gone' });
    h.actions.push({
      id: 'late-1',
      seq: h.actions.length + 1,
      at: AT,
      actor: { role: 'staff' },
      type: 'points.adjusted',
      payload: { currency: 'cxp', amount: 10, reason: 'late' },
    });
    const sheet = h.sheet();
    expect(sheet.warnings.map((w) => w.code)).toEqual(['CHARACTER_RETIRED']);
    expect(sheet.points.cxp.total).toBe(1000);
  });

  it('a retirement character starts with the carry in the right ledger kinds', () => {
    const h = harness();
    h.run({
      ...BASE_CHARACTER,
      characterName: 'Tamsin Vale',
      retirement: { fromName: 'Mara Quill', cxp: 350, fp: 6, shinies: 300 },
    });
    const sheet = h.sheet();
    expect(sheet.ledger.map((r) => [r.currency, r.kind, r.amount])).toEqual([
      ['cxp', 'start', 250],
      ['cxp', 'retirement-carry', 350],
      ['fp', 'retirement-carry', 6],
      ['shinies', 'retirement-carry', 300],
    ]);
    expect(sheet.points.cxp).toMatchObject({ total: 600, earned: 0, available: 600 });
    expect(sheet.points.lxp.total).toBe(2);
    expect(sheet.points.fp.available).toBe(6);
    expect(sheet.profile.retirementFrom).toEqual({
      fromName: 'Mara Quill',
      cxp: 350,
      fp: 6,
      shinies: 300,
    });
  });
});

function request(overrides: Partial<LearnSkillRequest> = {}): LearnSkillRequest {
  return {
    id: 'req-1',
    characterId: 'char-1',
    createdAt: '2026-05-17T09:30:00.000Z',
    kind: 'learn-skill',
    skillId: 'assault',
    part: 'basic',
    toLevel: 2,
    teacher: 'Old Jory',
    note: 'Learned at the fair',
    status: 'sent',
    ...overrides,
  };
}

describe('requests', () => {
  it('approval learns the skill with causedBy and records request.approved', () => {
    const h = withCharacter();
    expect(checkRequest(rs, h.sheet(), request())).toEqual({
      valid: true,
      decided: null,
      cost: { currency: 'cxp', amount: 30 },
      teacherRequired: true,
      reasons: [],
      errors: [],
    });
    const actions = h.run({ type: 'approveRequest', request: request() });
    expect(actions.map((a) => [a.type, a.causedBy])).toEqual([
      ['skill.learned', 'req-1'],
      ['skill.learned', 'req-1'],
      ['request.approved', 'req-1'],
    ]);
    expect(actions[2]?.payload).toEqual({
      requestId: 'req-1',
      submittedAt: '2026-05-17T09:30:00.000Z',
      kind: 'learn-skill',
      skillId: 'assault',
      part: 'basic',
      toLevel: 2,
      teacher: 'Old Jory',
      playerNote: 'Learned at the fair',
    });
    const sheet = h.sheet();
    expect(sheet.skills.find((s) => s.skillId === 'assault')?.parts[0]).toMatchObject({
      level: 2,
      teacher: 'Old Jory',
    });
    expect(sheet.requestDecisions).toEqual([
      expect.objectContaining({ requestId: 'req-1', status: 'approved', reason: null }),
    ]);
    expect(codes(h.plan({ type: 'approveRequest', request: request() }))).toEqual([
      'REQUEST_ALREADY_DECIDED',
    ]);
    expect(codes(h.plan({ type: 'rejectRequest', request: request(), reason: 'No' }))).toEqual([
      'REQUEST_ALREADY_DECIDED',
    ]);
    expect(checkRequest(rs, sheet, request())).toMatchObject({ valid: false, decided: 'approved' });
  });

  it('approval runs the learnSkill rules', () => {
    const h = withCharacter();
    const tooFar = request({ toLevel: 7 });
    expect(codes(h.plan({ type: 'approveRequest', request: tooFar }))).toEqual(['NOT_ENOUGH_CXP']);
    expect(checkRequest(rs, h.sheet(), tooFar)).toMatchObject({
      valid: false,
      reasons: ['Not enough CXP: needs 280, 250 left.'],
    });
    const noTeacher = request({ teacher: '' });
    expect(codes(h.plan({ type: 'approveRequest', request: noTeacher }))).toEqual([
      'TEACHER_REQUIRED',
    ]);
    expect(checkRequest(rs, h.sheet(), noTeacher).valid).toBe(false);
    const actions = h.run({ type: 'approveRequest', request: noTeacher, teacher: 'Sister Ash' });
    expect(actions[2]?.payload).toMatchObject({ teacher: 'Sister Ash' });
    expect(
      codes(
        h.plan({ type: 'approveRequest', request: request({ id: 'req-2', status: 'rejected' }) }),
      ),
    ).toEqual(['REQUEST_ALREADY_DECIDED']);
  });

  it('rejection records the reason', () => {
    const h = withCharacter();
    expect(codes(h.plan({ type: 'rejectRequest', request: request() }))).toEqual([
      'REASON_REQUIRED',
    ]);
    const [action] = h.run({
      type: 'rejectRequest',
      request: request(),
      reason: 'Old Jory was not at that event.',
    });
    expect(action?.type).toBe('request.rejected');
    expect(action?.causedBy).toBe('req-1');
    const sheet = h.sheet();
    expect(sheet.skills).toEqual([]);
    expect(sheet.requestDecisions[0]).toMatchObject({
      status: 'rejected',
      reason: 'Old Jory was not at that event.',
      teacher: 'Old Jory',
      playerNote: 'Learned at the fair',
    });
    expect(checkRequest(rs, sheet, request()).decided).toBe('rejected');
  });

  it('a multi-archetype first purchase uses the archetype on the request', () => {
    const h = withCharacter();
    const bard = request({ skillId: 'bardic-performance', toLevel: 1, archetype: 'magic' });
    expect(checkRequest(rs, h.sheet(), bard)).toMatchObject({ valid: true, reasons: [] });
    const actions = h.run({ type: 'approveRequest', request: bard });
    expect(actions.map((a) => a.type)).toEqual(['skill.learned', 'request.approved']);
    expect(actions[0]?.payload).toMatchObject({ archetype: 'magic' });
    expect(h.sheet().skills.find((s) => s.skillId === 'bardic-performance')?.archetype).toBe(
      'magic',
    );
  });

  it('staff can set or change the archetype when approving', () => {
    const h = withCharacter();
    const noArchetype = request({ skillId: 'bardic-performance', toLevel: 1 });
    expect(checkRequest(rs, h.sheet(), noArchetype).errors.map((e) => e.code)).toEqual([
      'ARCHETYPE_REQUIRED',
    ]);
    expect(codes(h.plan({ type: 'approveRequest', request: noArchetype }))).toEqual([
      'ARCHETYPE_REQUIRED',
    ]);
    const wrong = request({ skillId: 'bardic-performance', toLevel: 1, archetype: 'warrior' });
    expect(checkRequest(rs, h.sheet(), wrong).errors.map((e) => e.code)).toEqual([
      'ARCHETYPE_INVALID',
    ]);
    const actions = h.run({
      type: 'approveRequest',
      request: request({ skillId: 'bardic-performance', toLevel: 1, archetype: 'magic' }),
      archetype: 'utility',
    });
    expect(actions[0]?.payload).toMatchObject({ archetype: 'utility' });
    // Later levels use the locked archetype; a request naming another one is refused.
    const locked = request({
      id: 'req-2',
      skillId: 'bardic-performance',
      toLevel: 2,
      archetype: 'magic',
    });
    expect(codes(h.plan({ type: 'approveRequest', request: locked }))).toEqual([
      'ARCHETYPE_LOCKED',
    ]);
    expect(
      codes(h.plan({ type: 'approveRequest', request: { ...locked, archetype: undefined } })),
    ).toEqual([]);
  });
});
