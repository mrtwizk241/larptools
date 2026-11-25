import { describe, expect, it } from 'vitest';
import { preview } from './plan.ts';
import { attend, event, grant, learn, rs, withCharacter } from '../testkit.ts';

const E1 = event('2026-03-01', 'march', 'March Game');
const E2 = event('2026-04-01', 'april', 'April Game');

describe('checkIn', () => {
  it('player attendance: 60 XP, 5 CXP, 1 AXP; Human silver; first event free', () => {
    const h = withCharacter();
    const p = preview(rs, h.sheet(), { type: 'checkIn', event: E1 });
    expect(p.awards).toEqual([
      { currency: 'xp', amount: 60, kind: 'event' },
      { currency: 'cxp', amount: 5, kind: 'event' },
      { currency: 'axp', amount: 1, kind: 'event' },
    ]);
    h.run({ type: 'checkIn', event: E1 });
    const e = h.sheet().events[0];
    expect(e).toMatchObject({ key: E1.key, upkeep: { dueSilver: 0, coveredBy: null } });
    expect(e?.handedOut).toEqual(['1 Silver (Human innate)']);
    expect(h.fail({ type: 'checkIn', event: E1 })).toEqual(['EVENT_ALREADY_CHECKED_IN']);
    h.run({ type: 'checkIn', event: E2 });
    expect(h.sheet().events[1]?.upkeep).toEqual({ dueSilver: 1, coveredBy: 'paid' });
  });

  it('NPC time: 1 XP and 1 CXP an hour up to 5, then 50 MT an hour, 500 at most', () => {
    const h = withCharacter();
    const p = preview(rs, h.sheet(), {
      type: 'checkIn',
      event: E1,
      npcHours: 7,
      extras: ['check-in-assist'],
    });
    // hand-derived: 7 + 2 (check-in assist) = 9 hours: 5 XP, 5 CXP, (9 - 5) x 50 = 200 MT
    expect(p.awards?.filter((a) => a.kind === 'npc-time')).toEqual([
      { currency: 'xp', amount: 5, kind: 'npc-time' },
      { currency: 'cxp', amount: 5, kind: 'npc-time' },
      { currency: 'mt', amount: 200, kind: 'npc-time' },
    ]);
  });

  it('full event NPC and GM staff bundles', () => {
    const h = withCharacter();
    const npc = preview(rs, h.sheet(), {
      type: 'checkIn',
      event: E1,
      attendance: 'npc-unpaid',
      npcHours: 3,
    });
    // hand-derived: 60 XP + 1 AXP + NPC time at the maximum (5 XP, 5 CXP, 500 MT)
    expect(npc.awards).toEqual([
      { currency: 'xp', amount: 60, kind: 'event' },
      { currency: 'axp', amount: 1, kind: 'event' },
      { currency: 'xp', amount: 5, kind: 'npc-time' },
      { currency: 'cxp', amount: 5, kind: 'npc-time' },
      { currency: 'mt', amount: 500, kind: 'npc-time' },
    ]);
    expect(npc.notices.map((n) => n.code)).toEqual(['NPC_HOURS_IGNORED']);
    h.run({ type: 'checkIn', event: E1, attendance: 'gm-staff', extras: ['marshal-medic'] });
    const s = h.sheet();
    // hand-derived: XP 150 + 60 + 10 = 220; CXP 10; MT 500 + 50 = 550; AXP 1
    expect(s.points.xp.earned).toBe(220);
    expect(s.points.cxp.earned).toBe(10);
    expect(s.points.mt.balance).toBe(550);
    expect(s.events[0]?.handedOut).toEqual([
      '5 Silver (Full event GM-level staff)',
      '1 Silver (Human innate)',
    ]);
  });

  it('paid NPC silver: 1 Silver per 150 XP the character has', () => {
    const h = withCharacter();
    grant(h, 'xp', 300);
    h.run({ type: 'checkIn', event: E1, attendance: 'npc-paid', paidChoice: 'silver' });
    // hand-derived: floor(450 / 150) = 3 Silver
    expect(h.sheet().events[0]?.handedOut[0]).toBe('3 Silver (Full event NPC (paid))');
    expect(h.fail({ type: 'checkIn', event: E2, paidChoice: 'silver' })).toEqual([
      'PAID_CHOICE_INVALID',
    ]);
  });

  it('extras: known, once per event', () => {
    const h = withCharacter();
    expect(h.fail({ type: 'checkIn', event: E1, extras: ['juggling'] })).toEqual(['UNKNOWN_EXTRA']);
    expect(
      h.fail({ type: 'checkIn', event: E1, extras: ['friday-setup', 'friday-setup'] }),
    ).toEqual(['EXTRA_OVER_CAP']);
    expect(h.fail({ type: 'checkIn', event: { ...E1, date: '2026-03-02' } })).toEqual([
      'INVALID_EVENT',
    ]);
  });

  it('XP above the cap is recorded as not credited', () => {
    const h = withCharacter();
    grant(h, 'xp', 1820);
    h.run({ type: 'checkIn', event: E1 });
    const e = h.sheet().events[0];
    // hand-derived: room 2000 - 1970 = 30 of the 60
    expect(e?.awards[0]).toEqual({ currency: 'xp', amount: 30, kind: 'event' });
    expect(e?.notCredited).toEqual([{ currency: 'xp', amount: 30, kind: 'event' }]);
  });

  it('upkeep covers: only what the character has', () => {
    const h = withCharacter({ startingSkills: [{ skillId: 'urban-knowledge', level: 1 }] });
    attend(h, 1);
    expect(h.fail({ type: 'checkIn', event: E2, upkeep: 'merchanting' })).toEqual([
      'UPKEEP_COVER_INVALID',
    ]);
    h.run({ type: 'checkIn', event: E2, upkeep: 'urban-knowledge' });
    expect(h.sheet().events[1]?.upkeep).toEqual({ dueSilver: 1, coveredBy: 'urban-knowledge' });
  });
});

describe('voidCheckIn', () => {
  it('reverses the awards with a reason and frees the event', () => {
    const h = withCharacter();
    const [checkIn] = h.run({ type: 'checkIn', event: E1 });
    expect(h.fail({ type: 'voidCheckIn', checkInActionId: checkIn?.id ?? '' })).toEqual([
      'REASON_REQUIRED',
    ]);
    const r = h.plan({
      type: 'voidCheckIn',
      checkInActionId: checkIn?.id ?? '',
      reason: 'Wrong character',
    });
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['HANDED_OUT_STAYS']);
    h.run({ type: 'voidCheckIn', checkInActionId: checkIn?.id ?? '', reason: 'Wrong character' });
    const s = h.sheet();
    expect(s.events).toEqual([]);
    expect(s.points.xp.earned).toBe(150);
    expect(s.ledger.filter((l) => l.amount < 0).map((l) => l.note)).toEqual([
      'Voided check-in: Wrong character',
      'Voided check-in: Wrong character',
      'Voided check-in: Wrong character',
    ]);
    expect(s.voidedCheckIns[0]).toMatchObject({ key: E1.key, reason: 'Wrong character' });
    expect(
      h.fail({ type: 'voidCheckIn', checkInActionId: checkIn?.id ?? '', reason: 'x' }),
    ).toEqual(['CHECK_IN_ALREADY_VOIDED']);
    expect(h.fail({ type: 'voidCheckIn', checkInActionId: 'act-1', reason: 'x' })).toEqual([
      'NOT_A_CHECK_IN',
    ]);
    h.run({ type: 'checkIn', event: E1 });
    expect(h.sheet().events).toHaveLength(1);
  });

  it('is blocked once its points are spent', () => {
    const h = withCharacter();
    const [checkIn] = h.run({ type: 'checkIn', event: E1 });
    learn(h, 'toughness', 5);
    // hand-derived: 210 earned, 75 spent; removing 60 leaves 75 >= 0: allowed
    expect(
      h.plan({ type: 'voidCheckIn', checkInActionId: checkIn?.id ?? '', reason: 'x' }).ok,
    ).toBe(true);
    learn(h, 'wear-armor', 5);
    // hand-derived: spent 150, 60 available; removing 60 XP leaves 0: still allowed
    learn(h, 'stun', 1);
    // now 55 available: removing 60 would go negative
    expect(
      h.fail({ type: 'voidCheckIn', checkInActionId: checkIn?.id ?? '', reason: 'x' }),
    ).toEqual(['CHECK_IN_POINTS_SPENT']);
  });

  it('is blocked by a Mist Token back-buy, a journal entry, or a teaching dated to it', () => {
    const messages = (h: ReturnType<typeof withCharacter>, id: string) => {
      const r = h.plan({ type: 'voidCheckIn', checkInActionId: id, reason: 'Wrong event' });
      return r.ok ? [] : r.errors.map((e) => `${e.code}: ${e.message}`);
    };

    // Back-buy: XP bought at April for March.
    const mt = withCharacter();
    grant(mt, 'mt', 500);
    const [march] = mt.run({ type: 'checkIn', event: E1 });
    mt.run({ type: 'checkIn', event: E2 });
    mt.run({ type: 'spendMt', purchaseId: 'xp', qty: 1, eventKey: E2.key, forEventKey: E1.key });
    const name = mt.sheet().mtPurchases[0]?.name ?? '';
    expect(messages(mt, march?.id ?? '')).toEqual([
      `CHECK_IN_IN_USE: Cannot void: the Mist Token back-buy ${name} is for March Game; refund it first.`,
    ]);

    // Journal entry dated to the event.
    const book = withCharacter();
    const [april] = book.run({ type: 'checkIn', event: E2 });
    book.run({
      type: 'addJournal',
      kind: 'spell',
      refId: 'fire-dart',
      source: 'scroll',
      eventKey: E2.key,
    });
    expect(messages(book, april?.id ?? '')).toEqual([
      'CHECK_IN_IN_USE: Cannot void: Fire Dart was added to the spellbook at April Game.',
    ]);

    // Teaching dated to the event (Basic, Log of Learning).
    const taught = withCharacter();
    const [first] = taught.run({ type: 'checkIn', event: E1 });
    learn(taught, 'stun', 1, [], E1.key);
    expect(messages(taught, first?.id ?? '')).toEqual([
      'CHECK_IN_IN_USE: Cannot void: Stun Basic was taught at March Game (Log of Learning).',
    ]);
    // Once the teaching is refunded, the void goes through.
    taught.run({ type: 'refundSkill', skillId: 'stun', step: { level: 1 }, reason: 'Mistake' });
    expect(messages(taught, first?.id ?? '')).toEqual([]);
  });

  it('is blocked when the Calling depends on it', () => {
    const h = withCharacter();
    const keys = attend(h, 6);
    h.run({ type: 'startCalling', callingId: 'protector', eventKey: keys[5] ?? '' });
    const first = h.sheet().events[0]?.actionId ?? '';
    const sixth = h.sheet().events[5]?.actionId ?? '';
    expect(h.fail({ type: 'voidCheckIn', checkInActionId: first, reason: 'x' })).toEqual([
      'CHECK_IN_IN_USE',
    ]);
    expect(h.fail({ type: 'voidCheckIn', checkInActionId: sixth, reason: 'x' })).toEqual([
      'CHECK_IN_IN_USE',
    ]);
  });
});
