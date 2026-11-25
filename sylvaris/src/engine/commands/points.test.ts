import { describe, expect, it } from 'vitest';
import { preview } from './plan.ts';
import { attend, event, grant, rs, withCharacter } from '../testkit.ts';

describe('awardPoints', () => {
  it('credits a ledger kind', () => {
    const h = withCharacter();
    h.run({ type: 'awardPoints', currency: 'mt', amount: 200, kind: 'donation' });
    expect(h.sheet().points.mt.balance).toBe(200);
    expect(h.sheet().ledger.at(-1)).toMatchObject({
      currency: 'mt',
      amount: 200,
      kind: 'donation',
    });
  });

  it('refuses unknown and engine-only kinds', () => {
    const h = withCharacter();
    expect(h.fail({ type: 'awardPoints', currency: 'xp', amount: 5, kind: 'bribe' })).toEqual([
      'INVALID_KIND',
    ]);
    expect(h.fail({ type: 'awardPoints', currency: 'xp', amount: 5, kind: 'starting' })).toEqual([
      'INVALID_KIND',
    ]);
    expect(h.fail({ type: 'awardPoints', currency: 'xp', amount: 5, kind: 'mt-purchase' })).toEqual(
      ['INVALID_KIND'],
    );
  });

  it('event awards need the event, once per currency', () => {
    const h = withCharacter();
    expect(h.fail({ type: 'awardPoints', currency: 'xp', amount: 60, kind: 'event' })).toEqual([
      'EVENT_REQUIRED',
    ]);
    const [key] = attend(h, 1);
    expect(
      h.fail({
        type: 'awardPoints',
        currency: 'xp',
        amount: 60,
        kind: 'event',
        eventKey: key ?? '',
      }),
    ).toEqual(['EVENT_ALREADY_CREDITED']);
  });

  it('XP stops at the 2000 earned cap; the excess is not credited', () => {
    const h = withCharacter();
    grant(h, 'xp', 1840);
    const r = h.plan({ type: 'awardPoints', currency: 'xp', amount: 60, kind: 'gm-award' });
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['XP_CAPPED']);
    const p = preview(rs, h.sheet(), {
      type: 'awardPoints',
      currency: 'xp',
      amount: 60,
      kind: 'gm-award',
    });
    // hand-derived: 2000 - (150 + 1840) = 10 credited, 50 not
    expect(p.awards).toEqual([{ currency: 'xp', amount: 10, kind: 'gm-award' }]);
    expect(p.notCredited).toEqual([{ currency: 'xp', amount: 50, kind: 'gm-award' }]);
    h.run({ type: 'awardPoints', currency: 'xp', amount: 60, kind: 'gm-award' });
    expect(h.sheet().points.xp).toMatchObject({ earned: 2000, capRemaining: 0 });
    expect(h.fail({ type: 'awardPoints', currency: 'xp', amount: 1, kind: 'gm-award' })).toEqual([
      'XP_CAP_REACHED',
    ]);
  });

  it('CXP stops at 610 (Q-PTS-8)', () => {
    const h = withCharacter();
    grant(h, 'cxp', 608);
    h.run({ type: 'awardPoints', currency: 'cxp', amount: 5, kind: 'gm-award' });
    expect(h.sheet().points.cxp.earned).toBe(610);
    expect(h.fail({ type: 'awardPoints', currency: 'cxp', amount: 1, kind: 'away-role' })).toEqual([
      'CXP_CAP_REACHED',
    ]);
  });
});

describe('adjustPoints', () => {
  it('needs a reason, may go negative with a notice and a sheet warning', () => {
    const h = withCharacter();
    expect(h.fail({ type: 'adjustPoints', currency: 'xp', amount: -10 })).toEqual([
      'REASON_REQUIRED',
    ]);
    const r = h.plan({
      type: 'adjustPoints',
      currency: 'axp',
      amount: -1,
      reason: 'Second strike',
      kind: 'penalty',
    });
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['NEGATIVE_AFTER_ADJUSTMENT']);
    h.run({
      type: 'adjustPoints',
      currency: 'axp',
      amount: -1,
      reason: 'Second strike',
      kind: 'penalty',
    });
    expect(h.sheet().warnings.map((w) => w.code)).toEqual(['NEGATIVE_AXP']);
    expect(h.sheet().ledger.at(-1)).toMatchObject({ kind: 'penalty', note: 'Second strike' });
  });

  it('notes when it goes above a cap', () => {
    const h = withCharacter();
    const r = h.plan({ type: 'adjustPoints', currency: 'xp', amount: 1900, reason: 'import' });
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['ABOVE_CAP']);
  });
});

describe('spendMt', () => {
  const E1 = event('2026-03-01', 'march');
  const E2 = event('2026-04-01', 'april');

  function rich() {
    const h = withCharacter();
    grant(h, 'mt', 5000);
    return h;
  }

  it('buys XP at 50 MT each, 10 per event', () => {
    const h = rich();
    h.run({ type: 'spendMt', purchaseId: 'xp', qty: 10, eventKey: E1.key });
    // hand-derived: 10 x 50 = 500 MT; 150 + 10 = 160 XP earned
    expect(h.sheet().points.mt).toEqual({ earned: 5000, spent: 500, balance: 4500 });
    expect(h.sheet().points.xp.earned).toBe(160);
    expect(h.sheet().ledger.at(-1)).toMatchObject({
      currency: 'xp',
      kind: 'mt-purchase',
      eventKey: E1.key,
    });
    expect(h.fail({ type: 'spendMt', purchaseId: 'xp', qty: 1, eventKey: E1.key })).toEqual([
      'PURCHASE_OVER_CAP',
    ]);
    expect(h.fail({ type: 'spendMt', purchaseId: 'xp', qty: 1 })).toEqual(['EVENT_REQUIRED']);
    // Back-buy for another event of the same year counts against that event.
    const feb = event('2026-02-01', 'feb');
    h.run({ type: 'checkIn', event: feb });
    h.run({
      type: 'spendMt',
      purchaseId: 'xp',
      qty: 10,
      eventKey: E2.key,
      forEventKey: feb.key,
    });
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'xp',
        qty: 1,
        eventKey: E2.key,
        forEventKey: event('2025-12-01', 'dec').key,
      }),
    ).toEqual(['BACK_BUY_YEAR', 'BACK_BUY_NOT_ATTENDED']);
  });

  it('back-buys need the purchase event, a real earlier check-in of the same year', () => {
    const h = rich();
    const jan = event('2026-01-10', 'jan');
    h.run({ type: 'checkIn', event: jan });
    h.run({ type: 'checkIn', event: E1 });
    // No purchase event: refused.
    expect(h.fail({ type: 'spendMt', purchaseId: 'xp', qty: 1, forEventKey: jan.key })).toEqual([
      'EVENT_REQUIRED',
    ]);
    // A made-up key opens no new 10 XP allowance.
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'xp',
        qty: 10,
        eventKey: E1.key,
        forEventKey: event('2026-01-11', 'made-up').key,
      }),
    ).toEqual(['BACK_BUY_NOT_ATTENDED']);
    // Not after the purchase event.
    const later = event('2026-09-01', 'sept');
    h.run({ type: 'checkIn', event: later });
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'cxp',
        qty: 1,
        eventKey: E1.key,
        forEventKey: later.key,
      }),
    ).toEqual(['BACK_BUY_DATE']);
    // The 5 CXP cap counts against the real event, wherever it is bought.
    h.run({ type: 'spendMt', purchaseId: 'cxp', qty: 5, eventKey: jan.key });
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'cxp',
        qty: 1,
        eventKey: E1.key,
        forEventKey: jan.key,
      }),
    ).toEqual(['PURCHASE_OVER_CAP']);
  });

  it('balance, unknown purchases, named levels', () => {
    const h = withCharacter();
    expect(h.fail({ type: 'spendMt', purchaseId: 'copper', qty: 1, eventKey: E1.key })).toEqual([
      'NOT_ENOUGH_MT',
    ]);
    expect(h.fail({ type: 'spendMt', purchaseId: 'dragon', eventKey: E1.key })).toEqual([
      'UNKNOWN_PURCHASE',
    ]);
    grant(h, 'mt', 1000);
    expect(h.fail({ type: 'spendMt', purchaseId: 'spell-enhancement', eventKey: E1.key })).toEqual([
      'CHOICE_REQUIRED',
    ]);
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'spell-enhancement',
        namedLevel: 'grandmaster',
        eventKey: E1.key,
      }),
    ).toEqual(['NAMED_LEVEL_INVALID']);
    const r = h.run({
      type: 'spendMt',
      purchaseId: 'spell-enhancement',
      namedLevel: 'master',
      eventKey: E1.key,
    });
    // hand-derived: Master = 150 MT (Q-PTS-4)
    expect(r[0]?.payload).toMatchObject({ mtCost: 150, items: ['Master Spell Enhancement'] });
    expect(
      h.fail({ type: 'spendMt', purchaseId: 'copper', forEventKey: E1.key, eventKey: E1.key }),
    ).toEqual(['BACK_BUY_NOT_ALLOWED']);
  });

  it('per-year caps: Stable Renewing Augment 1 per year', () => {
    const h = rich();
    h.run({
      type: 'spendMt',
      purchaseId: 'renewing-augment',
      namedLevel: 'basic',
      eventKey: E1.key,
    });
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'renewing-augment',
        namedLevel: 'basic',
        eventKey: E2.key,
      }),
    ).toEqual(['PURCHASE_OVER_CAP']);
  });

  it('teaching: one per event, normal or advanced, then used as the teacher', () => {
    const h = rich();
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'teaching-normal',
        namedLevel: 'basic',
        eventKey: E1.key,
      }),
    ).toEqual(['CHOICE_REQUIRED']);
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'teaching-normal',
        namedLevel: 'basic',
        skillId: 'frenzy',
        eventKey: E1.key,
      }),
    ).toEqual(['MT_TEACHING_INVALID']);
    const [buy] = h.run({
      type: 'spendMt',
      purchaseId: 'teaching-normal',
      namedLevel: 'basic',
      skillId: 'stun',
      eventKey: E1.key,
    });
    expect(buy?.payload).toMatchObject({
      mtCost: 100,
      items: ['Teaching (normal skill): Stun Basic'],
    });
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'teaching-advanced',
        namedLevel: 'basic',
        skillId: 'slay',
        eventKey: E1.key,
      }),
    ).toEqual(['PURCHASE_OVER_CAP']);
    h.run({ type: 'learnSkill', skillId: 'stun', step: { level: 1 }, viaMt: buy?.id ?? '' });
    const stun = h.sheet().skills.find((s) => s.skillId === 'stun');
    expect(stun?.teaching[0]).toMatchObject({ step: 'basic', viaMt: buy?.id, unverified: false });
    expect(h.sheet().mtPurchases[0]?.usedBy).toBe(stun?.teaching[0]?.actionId);
  });

  it('XP bought counts as earned: blocked when the cap cannot take it all', () => {
    const h = rich();
    grant(h, 'xp', 1845);
    expect(h.fail({ type: 'spendMt', purchaseId: 'xp', qty: 10, eventKey: E1.key })).toEqual([
      'XP_CAP_REACHED',
    ]);
  });

  it('missed event XP: no credit for that event, the player attended another that year', () => {
    const h = rich();
    const missed = event('2026-02-01', 'missed');
    h.knownEvents([missed, E1]);
    expect(
      h.fail({ type: 'spendMt', purchaseId: 'missed-event-xp', forEventKey: missed.key }),
    ).toEqual(['MISSED_EVENT_CONDITION']);
    h.run({ type: 'checkIn', event: E1 });
    expect(h.fail({ type: 'spendMt', purchaseId: 'missed-event-xp' })).toEqual(['EVENT_REQUIRED']);
    expect(h.fail({ type: 'spendMt', purchaseId: 'missed-event-xp', forEventKey: E1.key })).toEqual(
      ['MISSED_EVENT_CONDITION', 'MISSED_EVENT_CONDITION'],
    );
    h.run({
      type: 'spendMt',
      purchaseId: 'missed-event-xp',
      forEventKey: missed.key,
      eventKey: E1.key,
    });
    expect(h.sheet().ledger.at(-1)).toMatchObject({
      currency: 'xp',
      amount: 60,
      kind: 'missed-event',
      eventKey: missed.key,
    });
    // That event now has its XP: no check-in and no second purchase for it.
    expect(h.fail({ type: 'checkIn', event: missed })).toEqual(['EVENT_XP_ALREADY_CREDITED']);
    expect(
      h.fail({ type: 'spendMt', purchaseId: 'missed-event-xp', forEventKey: missed.key, qty: 2 }),
    ).toEqual(['QTY_INVALID', 'MISSED_EVENT_CONDITION']);
  });

  it('alternate character event XP: one use per event the player attended, 3 a year', () => {
    const h = rich();
    const a = event('2026-05-01', 'may');
    h.run({
      type: 'spendMt',
      purchaseId: 'alt-character-event-xp',
      forEventKey: a.key,
      playerEventsAttendedInYear: 1,
    });
    expect(h.sheet().points.xp.earned).toBe(210);
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'alt-character-event-xp',
        forEventKey: event('2026-06-01', 'june').key,
        playerEventsAttendedInYear: 1,
      }),
    ).toEqual(['ALT_CHARACTER_CONDITION']);
    for (const m of ['06', '07'])
      h.run({
        type: 'spendMt',
        purchaseId: 'alt-character-event-xp',
        forEventKey: event(`2026-${m}-01`, 'game').key,
        playerEventsAttendedInYear: 5,
      });
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'alt-character-event-xp',
        forEventKey: event('2026-08-01', 'game').key,
        playerEventsAttendedInYear: 5,
      }),
    ).toEqual(['PURCHASE_OVER_CAP']);
  });

  it('missed event XP: a known event of the current year only', () => {
    const h = rich();
    h.run({ type: 'checkIn', event: E1 });
    const missed = event('2026-02-01', 'missed');
    // Without the events list the engine cannot tell a real event from a made-up key.
    expect(
      h.fail({ type: 'spendMt', purchaseId: 'missed-event-xp', forEventKey: missed.key }),
    ).toEqual(['EVENT_LIST_REQUIRED']);
    h.knownEvents([missed, E1]);
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'missed-event-xp',
        forEventKey: event('2026-02-02', 'made-up').key,
      }),
    ).toEqual(['EVENT_UNKNOWN']);
    // A past year is refused even without the purchase event (now is 2026-05-16).
    const old = event('2025-11-01', 'old');
    h.knownEvents([missed, E1, old]);
    expect(
      h.fail({ type: 'spendMt', purchaseId: 'missed-event-xp', forEventKey: old.key }),
    ).toContain('MISSED_EVENT_CONDITION');
    // Not after the event it is bought at.
    const later = event('2026-04-20', 'later');
    h.knownEvents([missed, E1, later]);
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'missed-event-xp',
        forEventKey: later.key,
        eventKey: E1.key,
      }),
    ).toEqual(['BACK_BUY_DATE']);
    h.run({ type: 'spendMt', purchaseId: 'missed-event-xp', forEventKey: missed.key });
    // hand-derived: 150 start + 60 (E1 check-in) + 60 (missed event) = 270
    expect(h.sheet().points.xp.earned).toBe(270);
  });

  it('alternate character event XP: no attendance count and no check-in that year is refused', () => {
    const h = rich();
    const a = event('2026-05-01', 'may');
    expect(
      h.fail({ type: 'spendMt', purchaseId: 'alt-character-event-xp', forEventKey: a.key }),
    ).toEqual(['ALT_CHARACTER_CONDITION']);
    expect(
      h.fail({
        type: 'spendMt',
        purchaseId: 'alt-character-event-xp',
        forEventKey: a.key,
        playerEventsAttendedInYear: 0,
      }),
    ).toEqual(['ALT_CHARACTER_CONDITION']);
    // This character's own check-in that year counts for one use.
    h.run({ type: 'checkIn', event: E1 });
    h.run({ type: 'spendMt', purchaseId: 'alt-character-event-xp', forEventKey: a.key });
  });
});
