import { describe, expect, it } from 'vitest';
import { event, withCharacter } from '../testkit.ts';
import type { PlanResult } from './define.ts';

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('awardPoints', () => {
  it('credits a ledger with the kind and event', () => {
    const h = withCharacter();
    const [action] = h.run({
      type: 'awardPoints',
      currency: 'shinies',
      amount: 150,
      kind: 'donation',
      eventKey: '2026-05-16-spring-thaw',
      note: 'Packets',
    });
    expect(action).toMatchObject({
      type: 'points.awarded',
      eventKey: '2026-05-16-spring-thaw',
      note: 'Packets',
      payload: {
        currency: 'shinies',
        amount: 150,
        kind: 'donation',
        requested: 150,
        credited: 150,
      },
    });
    expect(h.sheet().points.shinies.balance).toBe(150);
  });

  it('clamps earned CXP at the 2000 cap with a notice, then refuses [PTS-CXP-CAP]', () => {
    const h = withCharacter();
    h.run({ type: 'awardPoints', currency: 'cxp', amount: 1990, kind: 'staff' });
    const clamped = h.plan({ type: 'awardPoints', currency: 'cxp', amount: 30, kind: 'npc' });
    expect(clamped.ok).toBe(true);
    if (!clamped.ok) return;
    expect(clamped.actions[0]?.payload).toMatchObject({ amount: 10, requested: 30, credited: 10 });
    expect(clamped.notices).toEqual([
      {
        code: 'CXP_CAPPED',
        message: 'CXP cap reached: credited 10 of 30 CXP (2000 earned CXP limit).',
        ruleId: 'PTS-CXP-CAP',
      },
    ]);
    h.actions.push(...clamped.actions);
    expect(h.sheet().points.cxp).toMatchObject({ total: 2250, earned: 2000, capRemaining: 0 });
    expect(codes(h.plan({ type: 'awardPoints', currency: 'cxp', amount: 5, kind: 'npc' }))).toEqual(
      ['CXP_CAP_REACHED'],
    );
    // PXP and Shinies are not capped.
    expect(h.plan({ type: 'awardPoints', currency: 'pxp', amount: 5, kind: 'npc' }).ok).toBe(true);
  });

  it('starting kinds do not count toward the cap', () => {
    const h = withCharacter({
      extraInfection: 2,
      retirement: { fromName: 'Hal', cxp: 400, fp: 0, shinies: 0 },
    });
    expect(h.sheet().points.cxp).toMatchObject({ total: 670, earned: 0, capRemaining: 2000 });
  });

  it('refuses unknown, reserved, and duplicate event kinds', () => {
    const h = withCharacter();
    expect(
      codes(h.plan({ type: 'awardPoints', currency: 'cxp', amount: 5, kind: 'bribe' })),
    ).toEqual(['INVALID_KIND']);
    expect(
      codes(h.plan({ type: 'awardPoints', currency: 'cxp', amount: 5, kind: 'start' })),
    ).toEqual(['INVALID_KIND']);
    expect(
      codes(h.plan({ type: 'awardPoints', currency: 'cxp', amount: 5, kind: 'penalty' })),
    ).toEqual(['INVALID_KIND']);
    expect(
      codes(h.plan({ type: 'awardPoints', currency: 'cxp', amount: 75, kind: 'event' })),
    ).toEqual(['EVENT_REQUIRED']);
    h.run({ type: 'checkIn', event: event('2026-05-16', 'spring-thaw'), attendance: 'player' });
    expect(
      codes(
        h.plan({
          type: 'awardPoints',
          currency: 'cxp',
          amount: 75,
          kind: 'event',
          eventKey: '2026-05-16-spring-thaw',
        }),
      ),
    ).toEqual(['EVENT_CXP_ALREADY_CREDITED']);
    expect(
      codes(
        h.plan({
          type: 'awardPoints',
          currency: 'fp',
          amount: 1,
          kind: 'attendance',
          eventKey: '2026-05-16-spring-thaw',
        }),
      ),
    ).toEqual(['FP_ALREADY_CREDITED']);
  });

  it('rejects AP and LXP (derived) and non-positive amounts as invalid commands', () => {
    const h = withCharacter();
    expect(
      codes(h.plan({ type: 'awardPoints', currency: 'ap' as 'cxp', amount: 5, kind: 'npc' })),
    ).toEqual(['INVALID_COMMAND']);
    expect(codes(h.plan({ type: 'awardPoints', currency: 'cxp', amount: 0, kind: 'npc' }))).toEqual(
      ['INVALID_COMMAND'],
    );
  });
});

describe('adjustPoints', () => {
  it('records a negative correction with its reason', () => {
    const h = withCharacter();
    const [action] = h.run({
      type: 'adjustPoints',
      currency: 'cxp',
      amount: -30,
      reason: 'Second strike',
      kind: 'penalty',
    });
    expect(action?.payload).toEqual({
      currency: 'cxp',
      amount: -30,
      reason: 'Second strike',
      kind: 'penalty',
    });
    const sheet = h.sheet();
    expect(sheet.points.cxp.total).toBe(220);
    expect(sheet.ledger.at(-1)).toMatchObject({
      kind: 'penalty',
      amount: -30,
      note: 'Second strike',
    });
  });

  it('requires a reason', () => {
    const h = withCharacter();
    expect(codes(h.plan({ type: 'adjustPoints', currency: 'fp', amount: 1 }))).toEqual([
      'REASON_REQUIRED',
    ]);
    expect(
      codes(h.plan({ type: 'adjustPoints', currency: 'fp', amount: 1, reason: '   ' })),
    ).toEqual(['REASON_REQUIRED']);
  });

  it('warns when the balance would go negative but still records it', () => {
    const h = withCharacter();
    const result = h.plan({
      type: 'adjustPoints',
      currency: 'shinies',
      amount: -10,
      reason: 'Typo',
    });
    expect(result.ok && result.notices.map((n) => n.code)).toEqual(['NEGATIVE_AFTER_ADJUSTMENT']);
  });

  it('rejects a zero adjustment', () => {
    const h = withCharacter();
    expect(
      codes(h.plan({ type: 'adjustPoints', currency: 'cxp', amount: 0, reason: 'x' })),
    ).toEqual(['INVALID_COMMAND']);
  });
});
