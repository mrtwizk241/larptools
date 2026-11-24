import { describe, expect, it } from 'vitest';
import { event, rs, withCharacter } from '../testkit.ts';
import { npcTimeRewards } from './checkIn.ts';
import type { PlanResult } from './define.ts';

const SPRING = event('2026-05-16', 'spring-thaw', 'Spring Thaw');

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

function awardsOf(result: PlanResult) {
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join('; '));
  return (result.actions[0]?.payload as { awards: unknown[] }).awards;
}

describe('checkIn attendance types', () => {
  it('player: Event CXP and 1 FP', () => {
    const h = withCharacter();
    const result = h.plan({ type: 'checkIn', event: SPRING, attendance: 'player' });
    expect(awardsOf(result)).toEqual([
      { currency: 'cxp', amount: 75, kind: 'event' },
      { currency: 'fp', amount: 1, kind: 'attendance' },
    ]);
    expect(result.ok && result.actions[0]?.eventKey).toBe(SPRING.key);
  });

  it('unpaid NPC: Event CXP, NPC time at its maximum, 1 FP, six resources owed', () => {
    const h = withCharacter();
    const result = h.plan({ type: 'checkIn', event: SPRING, attendance: 'npc-unpaid' });
    expect(awardsOf(result)).toEqual([
      { currency: 'cxp', amount: 75, kind: 'event' },
      { currency: 'cxp', amount: 5, kind: 'npc' },
      { currency: 'pxp', amount: 5, kind: 'npc' },
      { currency: 'shinies', amount: 500, kind: 'npc' },
      { currency: 'fp', amount: 1, kind: 'attendance' },
    ]);
    expect(result.ok && (result.actions[0]?.payload as { owed: string[] }).owed).toEqual([
      '3 Common resources, 2 Uncommon resources, 1 Rare resource (Full Event NPC (Un-Paid))',
    ]);
  });

  it('paid NPC: as unpaid, plus a crafting allowance or an extra rare resource', () => {
    const crafter = withCharacter({
      startingSkills: [{ skillId: 'medicine', part: 'basic', level: 1 }],
    });
    const result = crafter.plan({ type: 'checkIn', event: SPRING, attendance: 'npc-paid' });
    expect(awardsOf(result)).toHaveLength(5);
    expect(result.ok && result.notices.map((n) => n.code)).toEqual(['CRAFTING_ALLOWANCE']);
    expect(result.ok && (result.actions[0]?.payload as { owed: string[] }).owed).toHaveLength(1);
    const plain = withCharacter();
    const other = plain.plan({ type: 'checkIn', event: SPRING, attendance: 'npc-paid' });
    expect(other.ok && (other.actions[0]?.payload as { owed: string[] }).owed[1]).toBe(
      '1 Rare resource (Full Event NPC (Paid), no crafting skills)',
    );
  });

  it('GM staff: Event CXP, 10 CXP, 10 PXP, 500 Shinies, 1 FP', () => {
    const h = withCharacter();
    expect(awardsOf(h.plan({ type: 'checkIn', event: SPRING, attendance: 'gm-staff' }))).toEqual([
      { currency: 'cxp', amount: 75, kind: 'event' },
      { currency: 'cxp', amount: 10, kind: 'staff' },
      { currency: 'pxp', amount: 10, kind: 'staff' },
      { currency: 'shinies', amount: 500, kind: 'staff' },
      { currency: 'fp', amount: 1, kind: 'attendance' },
    ]);
  });

  it('every attendance type gives exactly 1 FP (Q-PTS-7)', () => {
    for (const bundle of rs.awards.attendance) {
      const h = withCharacter();
      h.run({ type: 'checkIn', event: SPRING, attendance: bundle.id });
      expect(h.sheet().points.fp.total).toBe(1);
      expect(h.sheet().events).toHaveLength(1);
    }
  });
});

describe('NPC hours [PTS-SHINY-EARN]', () => {
  it.each([
    [3, false, { cxp: 3, pxp: 3, shinies: 30 }],
    [5, false, { cxp: 5, pxp: 5, shinies: 50 }],
    [8, false, { cxp: 5, pxp: 5, shinies: 200 }],
    [14, false, { cxp: 5, pxp: 5, shinies: 500 }],
    [20, false, { cxp: 5, pxp: 5, shinies: 500 }],
    [2, true, { cxp: 5, pxp: 5, shinies: 50 }],
    [7, true, { cxp: 5, pxp: 5, shinies: 150 }],
  ])('%i hours (pre-signed shift %s)', (hours, preSigned, expected) => {
    expect(npcTimeRewards(rs, hours, preSigned, false)).toEqual(expected);
  });

  it('a player who NPCs 3 hours gets NPC time on top of Event CXP', () => {
    const h = withCharacter();
    const result = h.plan({ type: 'checkIn', event: SPRING, attendance: 'player', npcHours: 3 });
    expect(awardsOf(result)).toEqual([
      { currency: 'cxp', amount: 75, kind: 'event' },
      { currency: 'cxp', amount: 3, kind: 'npc' },
      { currency: 'pxp', amount: 3, kind: 'npc' },
      { currency: 'shinies', amount: 30, kind: 'npc' },
      { currency: 'fp', amount: 1, kind: 'attendance' },
    ]);
  });

  it('a pre-signed 4 hour shift is credited as 5 hours', () => {
    const h = withCharacter();
    const result = h.plan({
      type: 'checkIn',
      event: SPRING,
      attendance: 'player',
      npcHours: 4,
      preSignedShift: true,
    });
    expect(awardsOf(result)).toContainEqual({ currency: 'shinies', amount: 50, kind: 'npc' });
    expect(awardsOf(result)).toContainEqual({ currency: 'cxp', amount: 5, kind: 'npc' });
  });

  it('full-event NPCs ignore entered hours with a notice', () => {
    const h = withCharacter();
    const result = h.plan({
      type: 'checkIn',
      event: SPRING,
      attendance: 'npc-unpaid',
      npcHours: 9,
    });
    expect(result.ok && result.notices.map((n) => n.code)).toEqual(['NPC_HOURS_IGNORED']);
    expect(awardsOf(result)).toContainEqual({ currency: 'shinies', amount: 500, kind: 'npc' });
  });
});

describe('checkIn rules', () => {
  it('Event CXP and FP at most once per event', () => {
    const h = withCharacter();
    h.run({ type: 'checkIn', event: SPRING, attendance: 'player' });
    expect(codes(h.plan({ type: 'checkIn', event: SPRING, attendance: 'gm-staff' }))).toEqual([
      'EVENT_ALREADY_CHECKED_IN',
    ]);
    expect(
      h.plan({ type: 'checkIn', event: event('2026-06-20', 'midsummer'), attendance: 'player' }).ok,
    ).toBe(true);
  });

  it('extras are credited once per event', () => {
    const h = withCharacter();
    const result = h.plan({
      type: 'checkIn',
      event: SPRING,
      attendance: 'player',
      extras: ['marshal', 'sunday-clean-up'],
    });
    expect(awardsOf(result)).toEqual([
      { currency: 'cxp', amount: 75, kind: 'event' },
      { currency: 'fp', amount: 1, kind: 'attendance' },
      { currency: 'shinies', amount: 50, kind: 'volunteer' },
      { currency: 'shinies', amount: 100, kind: 'volunteer' },
    ]);
    expect(
      codes(
        h.plan({
          type: 'checkIn',
          event: SPRING,
          attendance: 'player',
          extras: ['marshal', 'marshal'],
        }),
      ),
    ).toEqual(['EXTRA_OVER_CAP']);
    expect(
      codes(h.plan({ type: 'checkIn', event: SPRING, attendance: 'player', extras: ['juggling'] })),
    ).toEqual(['UNKNOWN_EXTRA']);
  });

  it('rejects an unknown attendance type and a key that does not match the date', () => {
    const h = withCharacter();
    expect(codes(h.plan({ type: 'checkIn', event: SPRING, attendance: 'tourist' }))).toEqual([
      'UNKNOWN_ATTENDANCE',
    ]);
    expect(
      codes(
        h.plan({ type: 'checkIn', event: { ...SPRING, date: '2026-05-17' }, attendance: 'player' }),
      ),
    ).toEqual(['INVALID_EVENT']);
  });

  it('clamps Event CXP at the earned cap but still records attendance and FP', () => {
    const h = withCharacter();
    h.run({ type: 'awardPoints', currency: 'cxp', amount: 1950, kind: 'staff' });
    const result = h.plan({ type: 'checkIn', event: SPRING, attendance: 'gm-staff' });
    expect(awardsOf(result)).toEqual([
      { currency: 'cxp', amount: 50, kind: 'event' },
      { currency: 'pxp', amount: 10, kind: 'staff' },
      { currency: 'shinies', amount: 500, kind: 'staff' },
      { currency: 'fp', amount: 1, kind: 'attendance' },
    ]);
    expect(result.ok && result.notices.map((n) => n.code)).toEqual(['CXP_CAPPED', 'CXP_CAPPED']);
  });
});
