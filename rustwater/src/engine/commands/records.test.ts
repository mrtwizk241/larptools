import { describe, expect, it } from 'vitest';
import { event, withCharacter } from '../testkit.ts';
import type { PlanResult } from './define.ts';

function codes(result: PlanResult): string[] {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe('boons', () => {
  it('adds a boon from the data with its expiry text, and a free-text boon', () => {
    const h = withCharacter();
    h.run({ type: 'addBoon', boonId: 'slap-in-the-face' });
    h.run({ type: 'addBoon', name: 'Blessing of the Ferryman', expires: 'Next event' });
    h.run({ type: 'addBoon', name: 'Mud charm' });
    const boons = h.sheet().boons;
    expect(boons.map((b) => [b.boonId, b.name, b.expires])).toEqual([
      [
        'slap-in-the-face',
        'Slap in the Face',
        'Lasts until the end of the Event if never used, or until the end of the Encounter once used or activated.',
      ],
      [null, 'Blessing of the Ferryman', 'Next event'],
      [null, 'Mud charm', 'Expires at the end of the event (default).'],
    ]);
  });

  it('blocks a 4th boon and a duplicate', () => {
    const h = withCharacter();
    h.run({ type: 'addBoon', boonId: 'slap-in-the-face' });
    expect(codes(h.plan({ type: 'addBoon', boonId: 'slap-in-the-face' }))).toEqual([
      'BOON_DUPLICATE',
    ]);
    h.run({ type: 'addBoon', boonId: 'bionic-ears' });
    h.run({ type: 'addBoon', boonId: 'bionic-eyes' });
    expect(codes(h.plan({ type: 'addBoon', boonId: 'bionic-arms' }))).toEqual(['BOON_SLOTS_FULL']);
    const first = h.sheet().boons[0];
    h.run({ type: 'removeBoon', boonActionId: first?.actionId ?? '', reason: 'Used up' });
    expect(h.sheet().boons).toHaveLength(2);
    expect(h.plan({ type: 'addBoon', boonId: 'bionic-arms' }).ok).toBe(true);
  });

  it('checks ancestry restrictions, unknown ids, and missing names', () => {
    const h = withCharacter();
    expect(codes(h.plan({ type: 'addBoon', boonId: 'aware-healing-patch' }))).toEqual([
      'BOON_RESTRICTED',
    ]);
    expect(codes(h.plan({ type: 'addBoon', boonId: 'nope' }))).toEqual(['UNKNOWN_BOON']);
    expect(codes(h.plan({ type: 'addBoon' }))).toEqual(['NAME_REQUIRED']);
    expect(codes(h.plan({ type: 'removeBoon', boonActionId: 'nope' }))).toEqual(['BOON_NOT_FOUND']);
  });
});

describe('starting items', () => {
  it('records up to 10 picks with repeats, and notices fewer than 10', () => {
    const h = withCharacter();
    const r = h.plan({
      type: 'setStartingItems',
      picks: [
        { optionId: 'basic-melee-weapon', detail: 'long' },
        { optionId: 'bits' },
        { optionId: 'bits' },
      ],
    });
    expect(r.ok && r.notices.map((n) => n.code)).toEqual(['STARTING_ITEMS_FEWER']);
    h.run({
      type: 'setStartingItems',
      picks: [
        { optionId: 'basic-melee-weapon', detail: 'long' },
        { optionId: 'bits' },
        { optionId: 'bits' },
      ],
    });
    expect(h.sheet().startingItems).toEqual([
      {
        optionId: 'basic-melee-weapon',
        detail: 'long',
        name: 'Basic Melee Weapon (short/long/great)',
      },
      { optionId: 'bits', detail: null, name: '10 Bits' },
      { optionId: 'bits', detail: null, name: '10 Bits' },
    ]);
    const ten = h.plan({
      type: 'setStartingItems',
      picks: Array.from({ length: 10 }, () => ({ optionId: 'basic-armor' })),
    });
    expect(ten.ok && ten.notices).toEqual([]);
  });

  it('blocks more than 10 picks and unknown options', () => {
    const h = withCharacter();
    expect(
      codes(
        h.plan({
          type: 'setStartingItems',
          picks: Array.from({ length: 11 }, () => ({ optionId: 'bits' })),
        }),
      ),
    ).toEqual(['STARTING_ITEMS_OVER']);
    expect(codes(h.plan({ type: 'setStartingItems', picks: [{ optionId: 'laser' }] }))).toEqual([
      'UNKNOWN_STARTING_ITEM',
    ]);
  });
});

describe('owed rewards', () => {
  it('lists check-in rewards and manual ones, and marks them delivered', () => {
    const h = withCharacter();
    const spring = event('2026-05-16', 'spring-thaw', 'Spring Thaw');
    const [checkIn] = h.run({ type: 'checkIn', event: spring, attendance: 'gm-staff' });
    h.run({ type: 'addOwed', text: '1 Spell Blueprint (Elemental Bolt)', eventKey: spring.key });
    let owed = h.sheet().owed;
    expect(owed).toHaveLength(2);
    expect(owed[0]).toMatchObject({
      id: `${checkIn?.id ?? ''}#0`,
      eventKey: spring.key,
      delivered: false,
      source: 'check-in',
    });
    expect(owed[1]).toMatchObject({
      text: '1 Spell Blueprint (Elemental Bolt)',
      source: 'manual',
      delivered: false,
    });
    h.run({ type: 'deliverOwed', owedId: owed[0]?.id ?? '' });
    h.run({ type: 'deliverOwed', owedId: owed[1]?.id ?? '' });
    owed = h.sheet().owed;
    expect(owed.map((o) => o.delivered)).toEqual([true, true]);
    expect(owed[0]?.deliveredAt).not.toBeNull();
    expect(codes(h.plan({ type: 'deliverOwed', owedId: owed[0]?.id ?? '' }))).toEqual([
      'OWED_ALREADY_DELIVERED',
    ]);
    expect(codes(h.plan({ type: 'deliverOwed', owedId: 'nope' }))).toEqual(['OWED_NOT_FOUND']);
  });
});
