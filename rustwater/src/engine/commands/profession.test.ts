import { describe, expect, it } from 'vitest';
import { event, withCharacter, type Harness } from '../testkit.ts';
import type { PlanResult } from './define.ts';

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

const EVENTS = [
  event('2026-01-10', 'frost-moot'),
  event('2026-02-14', 'thaw-market'),
  event('2026-03-14', 'mud-season'),
];
/** Event keys used for purchases (not checked in; only earlier check-ins count). */
const BUY = [
  '2026-04-11-spring-fair',
  '2026-05-16-spring-thaw',
  '2026-06-13-long-day',
  '2026-07-18-high-summer',
  '2026-08-15-dust-storm',
  '2026-09-12-harvest',
];

function veteran(pxp = 400, events = EVENTS.length): Harness {
  const h = withCharacter();
  for (const e of EVENTS.slice(0, events))
    h.run({ type: 'checkIn', event: e, attendance: 'player' });
  if (pxp > 0) h.run({ type: 'adjustPoints', currency: 'pxp', amount: pxp, reason: 'test setup' });
  return h;
}

describe('startProfession', () => {
  it('needs 3 events before, buys level 1, and grants the passive', () => {
    const h = veteran();
    const actions = h.run({
      type: 'startProfession',
      professionId: 'medic',
      eventKey: BUY[0] ?? '',
      skills: ['medic-get-back-in-there', 'medic-stitch-em-up'],
    });
    expect(actions.map((a) => a.type)).toEqual([
      'profession.started',
      'profession.leveled',
      'profession.leveled',
    ]);
    expect(actions[0]?.payload).toEqual({ professionId: 'medic', eventsPlayedBefore: 3 });
    expect(actions[1]?.causedBy).toBe(actions[0]?.id);
    const sheet = h.sheet();
    expect(sheet.points.pxp).toEqual({ total: 400, spent: 20, available: 380 });
    expect(sheet.profession).toMatchObject({
      professionId: 'medic',
      name: 'Medic',
      levels: { 'medic-get-back-in-there': 1, 'medic-stitch-em-up': 1 },
      startedEventKey: BUY[0],
    });
    expect(sheet.profession?.passive.id).toBe('medic-skilled-healer');
  });

  it('blocks a start before the 4th event, a second profession, and bad skills', () => {
    const early = veteran(400, 2);
    expect(
      codes(
        early.plan({
          type: 'startProfession',
          professionId: 'medic',
          eventKey: BUY[0] ?? '',
          skills: ['medic-stitch-em-up'],
        }),
      ),
    ).toEqual(['NOT_ENOUGH_EVENTS']);
    // The third check-in on the start date itself does not count.
    expect(
      codes(
        veteran().plan({
          type: 'startProfession',
          professionId: 'medic',
          eventKey: EVENTS[2]?.key ?? '',
          skills: ['medic-stitch-em-up'],
        }),
      ),
    ).toEqual(['NOT_ENOUGH_EVENTS']);

    const h = veteran();
    expect(
      codes(
        h.plan({
          type: 'startProfession',
          professionId: 'medic',
          eventKey: BUY[0] ?? '',
          skills: ['sniper-open-spots'],
        }),
      ),
    ).toEqual(['UNKNOWN_PROFESSION_SKILL']);
    expect(
      codes(
        h.plan({
          type: 'startProfession',
          professionId: 'no-such',
          eventKey: BUY[0] ?? '',
          skills: ['x'],
        }),
      ),
    ).toEqual(['UNKNOWN_PROFESSION']);
    h.run({
      type: 'startProfession',
      professionId: 'medic',
      eventKey: BUY[0] ?? '',
      skills: ['medic-stitch-em-up'],
    });
    expect(
      codes(
        h.plan({
          type: 'startProfession',
          professionId: 'sniper',
          eventKey: BUY[1] ?? '',
          skills: ['sniper-open-spots'],
        }),
      ),
    ).toEqual(['PROFESSION_ALREADY_STARTED']);
  });

  it('needs the PXP', () => {
    const h = veteran(15);
    const r = h.plan({
      type: 'startProfession',
      professionId: 'medic',
      eventKey: BUY[0] ?? '',
      skills: ['medic-get-back-in-there', 'medic-stitch-em-up'],
    });
    expect(codes(r)).toEqual(['NOT_ENOUGH_PXP']);
    expect(r.ok ? '' : r.errors[0]?.message).toBe('Not enough PXP: needs 20, 15 left.');
  });
});

describe('levelProfession', () => {
  function started(): Harness {
    const h = veteran();
    h.run({
      type: 'startProfession',
      professionId: 'medic',
      eventKey: BUY[0] ?? '',
      skills: ['medic-get-back-in-there', 'medic-stitch-em-up'],
    });
    return h;
  }

  it('one level per skill per event', () => {
    const h = started();
    const r = h.plan({
      type: 'levelProfession',
      skillId: 'medic-stitch-em-up',
      eventKey: BUY[0] ?? '',
    });
    expect(codes(r)).toEqual(['PROFESSION_PACE']);
    h.run({ type: 'levelProfession', skillId: 'medic-stitch-em-up', eventKey: BUY[1] ?? '' });
    // The other skill may go up at the same event.
    h.run({ type: 'levelProfession', skillId: 'medic-get-back-in-there', eventKey: BUY[1] ?? '' });
    expect(
      codes(
        h.plan({ type: 'levelProfession', skillId: 'medic-stitch-em-up', eventKey: BUY[1] ?? '' }),
      ),
    ).toEqual(['PROFESSION_PACE']);
    expect(h.sheet().profession?.levels).toEqual({
      'medic-get-back-in-there': 2,
      'medic-stitch-em-up': 2,
    });
  });

  it('uses and upgrades at levels 1 to 5, PXP 10 x level', () => {
    const h = started();
    const rows: unknown[] = [];
    const record = () => {
      const p = h.sheet().profession;
      const s1 = p?.skills[0];
      const s2 = p?.skills[1];
      rows.push([
        s2?.level,
        s1?.uses,
        s1?.adeptUpgrades,
        s1?.advancedUpgrades,
        s2?.uses.count,
        s2?.adeptUpgrades,
        s2?.advancedUpgrades,
        s2?.pxpSpent,
      ]);
    };
    record();
    for (const key of BUY.slice(1, 5)) {
      h.run({ type: 'levelProfession', skillId: 'medic-stitch-em-up', eventKey: key });
      h.run({ type: 'levelProfession', skillId: 'medic-get-back-in-there', eventKey: key });
      record();
    }
    expect(rows).toEqual([
      [1, { count: 1, per: 'encounter' }, 0, 0, 1, 0, 0, 10],
      [2, { count: 2, per: 'encounter' }, 0, 0, 2, 0, 0, 30],
      [3, { count: 3, per: 'encounter' }, 0, 0, 3, 1, 0, 60],
      [4, { count: 4, per: 'encounter' }, 0, 0, 4, 2, 0, 100],
      [5, { count: 5, per: 'encounter' }, 0, 0, 5, 2, 1, 150],
    ]);
    const sheet = h.sheet();
    expect(sheet.profession?.skills[1]?.uses.per).toBe('repop');
    expect(sheet.points.pxp).toEqual({ total: 400, spent: 300, available: 100 });
    expect(sheet.profession?.skills[1]?.nextCost).toBeNull();
    expect(
      codes(
        h.plan({ type: 'levelProfession', skillId: 'medic-stitch-em-up', eventKey: BUY[5] ?? '' }),
      ),
    ).toEqual(['MAX_LEVEL']);
  });

  it('needs a profession, a known skill, and the PXP', () => {
    const none = veteran();
    expect(
      codes(
        none.plan({
          type: 'levelProfession',
          skillId: 'medic-stitch-em-up',
          eventKey: BUY[1] ?? '',
        }),
      ),
    ).toEqual(['NO_PROFESSION']);
    const h = veteran(20);
    h.run({
      type: 'startProfession',
      professionId: 'medic',
      eventKey: BUY[0] ?? '',
      skills: ['medic-stitch-em-up'],
    });
    expect(
      codes(
        h.plan({ type: 'levelProfession', skillId: 'medic-stitch-em-up', eventKey: BUY[1] ?? '' }),
      ),
    ).toEqual(['NOT_ENOUGH_PXP']);
    expect(
      codes(
        h.plan({ type: 'levelProfession', skillId: 'sniper-open-spots', eventKey: BUY[1] ?? '' }),
      ),
    ).toEqual(['UNKNOWN_PROFESSION_SKILL']);
  });

  it('replay warns on two levels of one skill at one event', () => {
    const h = started();
    const last = h.actions[h.actions.length - 1];
    if (!last) throw new Error('no action');
    h.actions.push({
      ...last,
      id: 'manual-pace',
      seq: h.actions.length + 1,
      payload: {
        abilityId: 'medic-stitch-em-up',
        toLevel: 2,
        cost: { currency: 'pxp', amount: 20 },
      },
      eventKey: BUY[0] ?? '',
    });
    const sheet = h.sheet();
    expect(sheet.warnings.map((w) => w.code)).toEqual(['PROFESSION_PACE']);
    expect(sheet.points.pxp.spent).toBe(40);
  });
});
