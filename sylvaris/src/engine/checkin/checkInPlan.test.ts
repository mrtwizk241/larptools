import { describe, expect, it } from 'vitest';
import { preview } from '../commands/plan.ts';
import { event, grant, learn, rs, withCharacter } from '../testkit.ts';
import { checkInItems, checkInSources, checkRegistration, upkeepFor } from './checkInPlan.ts';

const E1 = event('2026-03-01', 'march', 'March Game');
const E2 = event('2026-04-01', 'april', 'April Game');

describe('check-in sources and items', () => {
  it('Harvesting Grandmaster: the alternative and the Exotic trade', () => {
    const h = withCharacter();
    grant(h, 'xp', 300);
    learn(h, 'harvesting', 10, ['expert', 'master', 'grandmaster']);
    const sources = checkInSources(rs, h.sheet());
    const id = 'skill:harvesting';
    // hand-derived: 2 x 10 = 20 Basic; Grandmaster bonus 2 Exotic
    expect(
      checkInItems(rs, sources, {})
        .items.filter((i) => i.source === 'Harvesting')
        .map((i) => i.text),
    ).toEqual(['20 Basic Components (Harvesting)', '2 Exotic Components (Harvesting)']);
    expect(
      checkInItems(rs, sources, { technique: { [id]: 'alternative' } }).items.map((i) => i.text),
    ).toContain('1 Master Building Material (Harvesting)');
    // hand-derived: trade 16 Basic for 4 Exotic: 20 - 16 = 4 Basic, 2 + 4 = 6 Exotic (the max)
    const traded = checkInItems(rs, sources, { tradeExotics: { [id]: 4 } });
    expect(traded.problems).toEqual([]);
    expect(traded.items.filter((i) => i.source === 'Harvesting').map((i) => i.text)).toEqual([
      '4 Basic Components (Harvesting)',
      '6 Exotic Components (Harvesting)',
    ]);
    expect(checkInItems(rs, sources, { tradeExotics: { [id]: 5 } }).problems).toEqual([
      'Harvesting: at most 4 Exotic Components by trade.',
    ]);
  });

  it('Merchanting Technique options', () => {
    const h = withCharacter();
    grant(h, 'xp', 200);
    learn(h, 'merchanting', 6, ['expert', 'master']);
    const sources = checkInSources(rs, h.sheet());
    const items = checkInItems(rs, sources, { technique: { 'skill:merchanting': 1 } }).items;
    // hand-derived: 6 x 5 = 30 Copper per level; Master option 2 is one Master Trade Item
    expect(items.filter((i) => i.source === 'Merchanting').map((i) => i.text)).toEqual([
      '30 Copper (Merchanting)',
      '1 Master Trade Item (Merchanting)',
    ]);
    expect(checkInItems(rs, sources, { perLevel: { 'skill:merchanting': 7 } }).problems).toEqual([
      'Merchanting: choose one of the 2 options.',
    ]);
  });
});

describe('upkeepFor', () => {
  it('first event free, then 1 Silver', () => {
    const h = withCharacter();
    expect(upkeepFor(rs, h.sheet(), E1.key)).toMatchObject({
      due: false,
      reason: 'first event: no upkeep',
    });
    h.run({ type: 'checkIn', event: E1 });
    expect(upkeepFor(rs, h.sheet(), E2.key)).toMatchObject({ due: true, dueSilver: 1, covers: [] });
  });
});

describe('checkRegistration', () => {
  it('checks purchases through the engine and lists what to hand over', () => {
    const h = withCharacter();
    h.run({ type: 'checkIn', event: E1 });
    grant(h, 'mt', 600);
    const reg = checkRegistration(rs, h.actions, E2, {
      purchases: [
        { purchaseId: 'xp', qty: 10 },
        { purchaseId: 'copper', qty: 5 },
      ],
      choices: { upkeep: 'paid' },
    });
    expect(reg.errors).toEqual([]);
    // hand-derived: 10 x 50 + 5 x 10 = 550 MT
    expect(reg.mtCost).toBe(550);
    expect(reg.mtBalance).toBe(600);
    expect(reg.picks).toEqual(['Upkeep: paying 1 Silver']);
    expect(reg.items.map((i) => i.text)).toEqual(['1 Silver (Human innate)', '5 Copper']);
    expect(reg.purchaseCommands).toEqual([
      { purchaseId: 'xp', qty: 10 },
      { purchaseId: 'copper', qty: 5 },
    ]);
  });

  it('gives the sheet after the purchases, so the check-in preview matches the save', () => {
    const h = withCharacter();
    h.run({ type: 'checkIn', event: E1 });
    grant(h, 'xp', 1730);
    grant(h, 'mt', 500);
    // hand-derived: 150 + 60 + 1730 = 1940 XP earned of the 2000 cap
    expect(h.sheet().points.xp.earned).toBe(1940);
    const reg = checkRegistration(rs, h.actions, E2, {
      purchases: [{ purchaseId: 'xp', qty: 10 }],
      choices: { upkeep: 'paid' },
    });
    expect(reg.errors).toEqual([]);
    expect(reg.sheetAfterPurchases.points.xp.earned).toBe(1950);
    expect(reg.sheetAfterPurchases.points.mt.balance).toBe(0);
    const checkIn = { type: 'checkIn', event: E2, upkeep: 'paid' } as const;
    // On the sheet before the purchases the full 60 XP would show; after them, 50 fit the cap.
    expect(preview(rs, h.sheet(), checkIn).awards).toContainEqual(
      expect.objectContaining({ currency: 'xp', amount: 60 }),
    );
    const after = preview(rs, reg.sheetAfterPurchases, checkIn);
    expect(after.awards).toContainEqual(expect.objectContaining({ currency: 'xp', amount: 50 }));
    expect(after.notCredited).toContainEqual(
      expect.objectContaining({ currency: 'xp', amount: 10 }),
    );
    // No purchases: the current sheet.
    const none = checkRegistration(rs, h.actions, E2, { choices: { upkeep: 'paid' } });
    expect(none.sheetAfterPurchases.points.xp.earned).toBe(1940);
  });

  it('reports problems', () => {
    const h = withCharacter();
    h.run({ type: 'checkIn', event: E1 });
    const reg = checkRegistration(rs, h.actions, E2, {
      purchases: [
        { purchaseId: 'xp', qty: 11 },
        { purchaseId: 'teaching-normal', qty: 1 },
        { purchaseId: 'copper', qty: 1 },
        { purchaseId: 'copper', qty: 1 },
      ],
    });
    expect(reg.errors).toEqual([
      'Choose how upkeep is paid.',
      'Teaching (normal skill) cannot be bought when pre-registering.',
      '1 Copper is listed twice.',
      '1 XP: Not enough Mist Tokens: needs 550, 0 left.',
      '1 XP: at most 10 per event; 0 already bought for this event.',
      '1 Copper: Not enough Mist Tokens: needs 10, 0 left.',
    ]);
    expect(checkRegistration(rs, h.actions, E1, {}).errors).toEqual([
      'Wren Ashdown is already checked in to March Game.',
    ]);
    expect(checkRegistration(rs, h.actions, E2, { attendance: 'tourist' } as never).errors).toEqual(
      ['The registration is not valid.'],
    );
  });
});
