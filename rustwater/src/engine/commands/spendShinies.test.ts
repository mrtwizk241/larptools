import { describe, expect, it } from 'vitest';
import { event, grantShinies, withCharacter } from '../testkit.ts';
import type { PlanResult } from './define.ts';

const SPRING = event('2026-05-16', 'spring-thaw', 'Spring Thaw');
const SUMMER = event('2026-07-18', 'high-summer', 'High Summer');

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

function richInShinies(amount = 5000) {
  const h = withCharacter();
  grantShinies(h, amount);
  return h;
}

describe('spendShinies', () => {
  it('buys CXP at 50 each, credited as earned CXP', () => {
    const h = richInShinies(400);
    const [action] = h.run({
      type: 'spendShinies',
      purchaseId: 'buy-cxp',
      qty: 5,
      eventKey: SPRING.key,
    });
    expect(action?.payload).toEqual({
      purchaseId: 'buy-cxp',
      qty: 5,
      shiniesCost: 250,
      grants: [{ currency: 'cxp', amount: 5, kind: 'shiny-purchase' }],
      items: [],
    });
    const sheet = h.sheet();
    expect(sheet.points.shinies.balance).toBe(150);
    expect(sheet.points.cxp).toMatchObject({ total: 255, earned: 5 });
    expect(sheet.shinyPurchases[0]).toMatchObject({
      purchaseId: 'buy-cxp',
      qty: 5,
      eventKey: SPRING.key,
    });
  });

  it('caps CXP purchases at 5 per event', () => {
    const h = richInShinies();
    h.run({ type: 'spendShinies', purchaseId: 'buy-cxp', qty: 3, eventKey: SPRING.key });
    const over = h.plan({
      type: 'spendShinies',
      purchaseId: 'buy-cxp',
      qty: 3,
      eventKey: SPRING.key,
    });
    expect(over.ok ? '' : over.errors[0]?.message).toBe(
      'CXP: at most 5 per event; 3 already bought for this event.',
    );
    expect(
      h.plan({ type: 'spendShinies', purchaseId: 'buy-cxp', qty: 2, eventKey: SPRING.key }).ok,
    ).toBe(true);
    expect(
      h.plan({ type: 'spendShinies', purchaseId: 'buy-cxp', qty: 5, eventKey: SUMMER.key }).ok,
    ).toBe(true);
  });

  it.each([
    ['buy-basic-resource', 6, 20],
    ['buy-uncommon-resource', 4, 40],
    ['buy-rare-resource', 2, 60],
    ['buy-pxp', 1, 100],
    ['buy-bits', 20, 5],
    ['buy-upkeep', 1, 40],
  ])('%s: cap %i per event at %i Shinies each (per rarity, Q-PTS-8)', (purchaseId, cap, price) => {
    const h = richInShinies();
    const ok = h.plan({ type: 'spendShinies', purchaseId, qty: cap, eventKey: SPRING.key });
    expect(ok.ok && (ok.actions[0]?.payload as { shiniesCost: number }).shiniesCost).toBe(
      cap * price,
    );
    expect(
      codes(h.plan({ type: 'spendShinies', purchaseId, qty: cap + 1, eventKey: SPRING.key })),
    ).toEqual(['PURCHASE_OVER_CAP']);
  });

  it('lists the items handed over', () => {
    const h = richInShinies();
    const [action] = h.run({
      type: 'spendShinies',
      purchaseId: 'buy-basic-resource',
      qty: 6,
      eventKey: SPRING.key,
    });
    expect((action?.payload as { items: string[] }).items).toEqual(['6 Common resources']);
  });

  it('needs enough Shinies and an event for capped purchases', () => {
    const h = richInShinies(30);
    const poor = h.plan({
      type: 'spendShinies',
      purchaseId: 'buy-rare-resource',
      eventKey: SPRING.key,
    });
    expect(poor.ok ? '' : poor.errors[0]?.message).toBe('Not enough Shinies: needs 60, 30 left.');
    expect(codes(h.plan({ type: 'spendShinies', purchaseId: 'buy-bits' }))).toEqual([
      'EVENT_REQUIRED',
    ]);
    expect(
      codes(h.plan({ type: 'spendShinies', purchaseId: 'buy-gold', eventKey: SPRING.key })),
    ).toEqual(['UNKNOWN_PURCHASE']);
  });

  it('blocks bought CXP the earned cap cannot credit', () => {
    const h = richInShinies();
    h.run({ type: 'awardPoints', currency: 'cxp', amount: 1998, kind: 'staff' });
    expect(
      codes(h.plan({ type: 'spendShinies', purchaseId: 'buy-cxp', qty: 3, eventKey: SPRING.key })),
    ).toEqual(['CXP_CAP_REACHED']);
  });

  describe('missed-event Event CXP', () => {
    it('credits 75 Event CXP for the missed event when the player attended another that year', () => {
      const h = richInShinies(600);
      h.run({ type: 'checkIn', event: SPRING, attendance: 'player' });
      const [action] = h.run({
        type: 'spendShinies',
        purchaseId: 'buy-missed-event-cxp',
        forEvent: SUMMER,
      });
      expect(action?.payload).toMatchObject({
        shiniesCost: 500,
        grants: [{ currency: 'cxp', amount: 75, kind: 'event', eventKey: SUMMER.key }],
        forEvent: SUMMER,
      });
      const sheet = h.sheet();
      expect(sheet.points.cxp.total).toBe(400);
      expect(sheet.events).toHaveLength(1); // buying Event CXP is not attending
      expect(sheet.ledger.at(-1)?.eventKey).toBe(SUMMER.key);
      // Now the event has Event CXP: no second purchase, no check-in credit.
      expect(
        codes(
          h.plan({ type: 'spendShinies', purchaseId: 'buy-missed-event-cxp', forEvent: SUMMER }),
        ),
      ).toEqual(expect.arrayContaining(['MISSED_EVENT_CONDITION']));
      expect(codes(h.plan({ type: 'checkIn', event: SUMMER, attendance: 'player' }))).toEqual([
        'EVENT_CXP_ALREADY_CREDITED',
      ]);
    });

    it('needs another attended event in the same calendar year', () => {
      const h = richInShinies(600);
      h.run({ type: 'checkIn', event: event('2025-10-11', 'last-autumn'), attendance: 'player' });
      const result = h.plan({
        type: 'spendShinies',
        purchaseId: 'buy-missed-event-cxp',
        forEvent: SUMMER,
      });
      expect(result.ok ? '' : result.errors[0]?.message).toBe(
        'The player must have attended another event in 2026.',
      );
      // The UI may pass the player's count across characters.
      expect(
        h.plan({
          type: 'spendShinies',
          purchaseId: 'buy-missed-event-cxp',
          forEvent: SUMMER,
          playerEventsAttendedInYear: 2,
        }).ok,
      ).toBe(true);
      expect(codes(h.plan({ type: 'spendShinies', purchaseId: 'buy-missed-event-cxp' }))).toEqual([
        'EVENT_REQUIRED',
      ]);
    });
  });

  describe('alt-character Event CXP', () => {
    it('debits this character and names the other; at most 3 a year and no more than events attended', () => {
      const h = richInShinies(5000);
      const dates = ['2026-02-14', '2026-03-14', '2026-04-11', '2026-05-16'];
      for (const d of dates)
        h.run({ type: 'checkIn', event: event(d, 'game'), attendance: 'player' });
      const buy = (d: string) =>
        h.plan({
          type: 'spendShinies',
          purchaseId: 'buy-alt-character-event-cxp',
          eventKey: `${d}-game`,
          altCharacter: { name: 'Pip Second' },
        });
      const first = buy('2026-02-14');
      expect(first.ok && first.notices[0]?.message).toBe(
        'Record 75 Event CXP on Pip Second for 2026-02-14-game.',
      );
      expect(first.ok && first.actions[0]?.payload).toMatchObject({
        grants: [],
        items: ['Event CXP (75) for Pip Second at 2026-02-14-game'],
        altCharacter: { name: 'Pip Second' },
      });
      for (const d of dates.slice(0, 3)) {
        const r = buy(d);
        if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
        h.actions.push(...r.actions);
      }
      expect(h.sheet().shinyPurchases).toHaveLength(3);
      expect(codes(buy('2026-05-16'))).toEqual(['ALT_CHARACTER_CONDITION']);
      expect(h.sheet().points.cxp.total).toBe(250 + 4 * 75);
    });

    it('is limited by the events the player attended that year', () => {
      const h = richInShinies(5000);
      expect(
        codes(
          h.plan({
            type: 'spendShinies',
            purchaseId: 'buy-alt-character-event-cxp',
            eventKey: SPRING.key,
            altCharacter: { name: 'Pip Second' },
          }),
        ),
      ).toEqual(['ALT_CHARACTER_CONDITION']);
      expect(
        codes(
          h.plan({
            type: 'spendShinies',
            purchaseId: 'buy-alt-character-event-cxp',
            eventKey: SPRING.key,
          }),
        ),
      ).toEqual(['ALT_CHARACTER_REQUIRED']);
    });
  });
});
