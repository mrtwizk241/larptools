import { describe, expect, it } from 'vitest';
import { deriveSheet } from '../derive/deriveSheet.ts';
import type { Action } from '../model.ts';
import { event, grantCxp, rs, withCharacter, type Harness } from '../testkit.ts';
import type { PlanResult } from './define.ts';
import type { StartProfessionCommand } from './profession.ts';
import { preview } from './plan.ts';

const SPRING = event('2026-05-16', 'spring-thaw', 'Spring Thaw');

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

function messages(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.message);
}

function checkIn(h: Harness, attendance = 'player', e = SPRING): Action {
  const [action] = h.run({ type: 'checkIn', event: e, attendance });
  if (!action) throw new Error('no check-in action');
  return action;
}

describe('voidCheckIn', () => {
  it('restores CXP, FP, events attended, and the earned cap room', () => {
    const h = withCharacter();
    const before = h.sheet();
    const action = checkIn(h);
    expect(h.sheet().points.cxp.total).toBe(before.points.cxp.total + 75);

    const [voided] = h.run({
      type: 'voidCheckIn',
      checkInActionId: action.id,
      reason: 'Wrong person',
    });
    expect(voided).toMatchObject({
      type: 'event.checkInVoided',
      payload: { checkInActionId: action.id, reason: 'Wrong person' },
      eventKey: SPRING.key,
    });
    const after = h.sheet();
    expect(after.points.cxp).toEqual(before.points.cxp);
    expect(after.points.fp).toEqual(before.points.fp);
    expect(after.events).toEqual([]);
    expect(after.voidedCheckIns).toEqual([
      {
        checkInActionId: action.id,
        actionId: voided?.id,
        key: SPRING.key,
        name: 'Spring Thaw',
        date: SPRING.date,
        reason: 'Wrong person',
      },
    ]);
    expect(after.warnings).toEqual([]);
  });

  it('shows reversing ledger rows with the reason instead of deleting the credits', () => {
    const h = withCharacter();
    const action = checkIn(h);
    h.run({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Wrong person' });
    const rows = h.sheet().ledger.filter((r) => r.eventKey === SPRING.key);
    expect(rows.map((r) => [r.currency, r.amount, r.kind, r.note])).toEqual([
      ['cxp', 75, 'event', null],
      ['fp', 1, 'attendance', null],
      ['cxp', -75, 'event', 'Voided check-in: Wrong person'],
      ['fp', -1, 'attendance', 'Voided check-in: Wrong person'],
    ]);
  });

  it('allows a new check-in for the same event, with a different attendance', () => {
    const h = withCharacter();
    const start = h.sheet().points;
    const action = checkIn(h);
    h.run({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Was an NPC' });
    expect(h.plan({ type: 'checkIn', event: SPRING, attendance: 'npc-unpaid' }).ok).toBe(true);
    checkIn(h, 'npc-unpaid');
    const sheet = h.sheet();
    expect(sheet.events.map((e) => e.attendance)).toEqual(['npc-unpaid']);
    expect(sheet.points.cxp.total).toBe(start.cxp.total + 80);
    expect(sheet.points.fp.total).toBe(1);
    expect(sheet.warnings).toEqual([]);
    // Once checked in again, the once-per-event rule applies again.
    expect(codes(h.plan({ type: 'checkIn', event: SPRING, attendance: 'player' }))).toEqual([
      'EVENT_ALREADY_CHECKED_IN',
    ]);
  });

  it('lowers the events counted for starting a profession', () => {
    const h = withCharacter();
    const first = checkIn(h, 'player', event('2026-01-10', 'frost-moot'));
    checkIn(h, 'player', event('2026-02-14', 'thaw-market'));
    checkIn(h, 'player', event('2026-03-14', 'mud-season'));
    h.run({ type: 'adjustPoints', currency: 'pxp', amount: 100, reason: 'test setup' });
    const start: StartProfessionCommand = {
      type: 'startProfession',
      professionId: 'medic',
      eventKey: '2026-04-11-spring-fair',
      skills: ['medic-stitch-em-up'],
    };
    expect(h.plan(start).ok).toBe(true);
    h.run({ type: 'voidCheckIn', checkInActionId: first.id, reason: 'Did not attend' });
    expect(codes(h.plan(start))).toEqual(['NOT_ENOUGH_EVENTS']);
  });

  it('removes undelivered owed items and keeps delivered ones with a warning', () => {
    const h = withCharacter();
    const action = checkIn(h, 'npc-paid');
    expect(h.sheet().owed).toHaveLength(2);
    h.run({ type: 'deliverOwed', owedId: `${action.id}#0` });
    const plan = h.plan({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Mistake' });
    expect(plan.ok && plan.notices.map((n) => n.code)).toEqual(['OWED_ALREADY_DELIVERED']);
    h.run({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Mistake' });
    const sheet = h.sheet();
    expect(sheet.owed).toEqual([
      expect.objectContaining({ id: `${action.id}#0`, delivered: true, source: 'check-in' }),
    ]);
    expect(sheet.warnings.map((w) => w.code)).toEqual(['VOIDED_OWED_DELIVERED']);
  });

  it('needs a reason; preview ignores a missing one', () => {
    const h = withCharacter();
    const action = checkIn(h);
    expect(codes(h.plan({ type: 'voidCheckIn', checkInActionId: action.id }))).toEqual([
      'REASON_REQUIRED',
    ]);
    expect(
      codes(h.plan({ type: 'voidCheckIn', checkInActionId: action.id, reason: '  ' })),
    ).toEqual(['REASON_REQUIRED']);
    expect(
      preview(rs, h.sheet(), { type: 'voidCheckIn', checkInActionId: action.id }),
    ).toMatchObject({ allowed: true, reasons: [] });
  });

  it('is staff only', () => {
    const h = withCharacter();
    const action = checkIn(h);
    const result = h.plan(
      { type: 'voidCheckIn', checkInActionId: action.id, reason: 'x' },
      'player',
    );
    expect(codes(result)).toEqual(['ROLE_NOT_ALLOWED']);
  });

  it('rejects a double void and a non-check-in', () => {
    const h = withCharacter();
    const action = checkIn(h);
    h.run({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Oops' });
    const again = h.plan({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Oops' });
    expect(codes(again)).toEqual(['CHECK_IN_ALREADY_VOIDED']);
    expect(messages(again)).toEqual(['The check-in to Spring Thaw was already voided.']);
    const created = h.actions[0]?.id ?? '';
    expect(
      codes(h.plan({ type: 'voidCheckIn', checkInActionId: created, reason: 'Oops' })),
    ).toEqual(['NOT_A_CHECK_IN']);
  });

  it('blocks when the check-in CXP is already spent, and says which balance', () => {
    const h = withCharacter();
    const action = checkIn(h);
    const left = h.sheet().points.cxp.available;
    h.run({ type: 'adjustPoints', currency: 'cxp', amount: -(left - 30), reason: 'test setup' });
    const result = h.plan({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Oops' });
    expect(codes(result)).toEqual(['CHECK_IN_POINTS_SPENT']);
    expect(messages(result)[0]).toBe(
      'Cannot void: it takes back 75 CXP, but only 30 CXP is unspent. CXP would be -45; refund what it paid for first.',
    );
  });

  it('blocks when the FP from it is spent', () => {
    const h = withCharacter();
    const action = checkIn(h);
    h.run({ type: 'adjustPoints', currency: 'fp', amount: -1, reason: 'test setup' });
    const result = h.plan({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Oops' });
    expect(codes(result)).toEqual(['CHECK_IN_POINTS_SPENT']);
    expect(messages(result)[0]).toMatch(/takes back 1 FP, but only 0 FP is unspent/);
  });

  it('blocks when the LXP its CXP earned is spent on ancestry levels', () => {
    const h = withCharacter();
    grantCxp(h, 175);
    const action = checkIn(h);
    expect(h.sheet().points.lxp.total).toBe(2);
    h.run({ type: 'levelAncestryAbility', abilityId: 'human-resilience' });
    h.run({ type: 'levelAncestryAbility', abilityId: 'human-resilience' });
    const result = h.plan({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Oops' });
    expect(codes(result)).toEqual(['CHECK_IN_POINTS_SPENT']);
    expect(messages(result)[0]).toMatch(/LXP total would drop from 2 to 1, but 2 LXP is spent/);
  });

  it('blocks when a profession level was bought at that event', () => {
    const h = withCharacter();
    for (const e of [
      event('2026-01-10', 'frost-moot'),
      event('2026-02-14', 'thaw-market'),
      event('2026-03-14', 'mud-season'),
    ])
      checkIn(h, 'player', e);
    const action = checkIn(h);
    h.run({ type: 'adjustPoints', currency: 'pxp', amount: 100, reason: 'test setup' });
    h.run({
      type: 'startProfession',
      professionId: 'medic',
      eventKey: SPRING.key,
      skills: ['medic-stitch-em-up'],
    });
    const result = h.plan({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Oops' });
    expect(codes(result)).toEqual(['CHECK_IN_IN_USE', 'CHECK_IN_IN_USE']);
    expect(messages(result)).toEqual([
      'Cannot void: the Medic profession was started at Spring Thaw.',
      expect.stringMatching(/^Cannot void: .+ level 1 was bought at Spring Thaw\.$/),
    ]);
  });

  it('blocks when a later profession start would lose an event it needed', () => {
    const h = withCharacter();
    const first = checkIn(h, 'player', event('2026-01-10', 'frost-moot'));
    checkIn(h, 'player', event('2026-02-14', 'thaw-market'));
    checkIn(h, 'player', event('2026-03-14', 'mud-season'));
    h.run({ type: 'adjustPoints', currency: 'pxp', amount: 100, reason: 'test setup' });
    h.run({
      type: 'startProfession',
      professionId: 'medic',
      eventKey: SPRING.key,
      skills: ['medic-stitch-em-up'],
    });
    const result = h.plan({ type: 'voidCheckIn', checkInActionId: first.id, reason: 'Oops' });
    expect(codes(result)).toEqual(['CHECK_IN_IN_USE']);
    expect(messages(result)[0]).toBe(
      'Cannot void: the Medic profession needs 3 events played before it started; without frost-moot there would be 2.',
    );
  });
});

describe('event.checkInVoided replay', () => {
  it('warns and skips a double void or a void of something else', () => {
    const h = withCharacter();
    const action = checkIn(h);
    const [voided] = h.run({ type: 'voidCheckIn', checkInActionId: action.id, reason: 'Oops' });
    if (!voided) throw new Error('no void action');
    const twice: Action = { ...voided, id: 'void-2', seq: voided.seq + 1 };
    const other: Action = {
      ...voided,
      id: 'void-3',
      seq: voided.seq + 2,
      payload: { checkInActionId: h.actions[0]?.id, reason: 'Oops' },
    };
    const sheet = deriveSheet(rs, [...h.actions, twice, other]);
    expect(sheet.warnings.map((w) => [w.actionId, w.code])).toEqual([
      ['void-2', 'CHECK_IN_ALREADY_VOIDED'],
      ['void-3', 'CHECK_IN_NOT_FOUND'],
    ]);
    expect(sheet.points.cxp).toEqual(h.sheet().points.cxp);
    expect(sheet.ledger).toHaveLength(h.sheet().ledger.length);
  });

  it('needs a reason in the payload', () => {
    const h = withCharacter();
    const action = checkIn(h);
    const bad: Action = {
      id: 'void-1',
      seq: h.actions.length + 1,
      at: action.at,
      actor: { role: 'staff' },
      type: 'event.checkInVoided',
      payload: { checkInActionId: action.id, reason: '' },
    };
    const sheet = deriveSheet(rs, [...h.actions, bad]);
    expect(sheet.warnings.map((w) => w.code)).toEqual(['INVALID_PAYLOAD']);
    expect(sheet.events).toHaveLength(1);
  });
});
